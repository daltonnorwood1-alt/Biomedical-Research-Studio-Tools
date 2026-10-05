import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createProject, createRevision, ingestSource, listApprovals } from "../server/core.js";
import { openDatabase } from "../server/db.js";
import { createSelectableQuestion, prepareApprovalRequest, submitPreparedApproval, submitSelectableResponse } from "../server/interactions.js";
import { listMcpTools, readMcpResource, registerMcpRoutes, UI_RESOURCES } from "../server/mcp.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "brs-mcp-"));
  const db = openDatabase(join(root, "studio.sqlite"));
  return { root, db };
}

describe("MCP Apps tool metadata", () => {
  it("publishes separate data and render tools with extension entrypoints", () => {
    const tools = listMcpTools();
    const dashboard = tools.find((tool) => tool.name === "brs_render_dashboard");
    const review = tools.find((tool) => tool.name === "brs_render_review_workspace");
    expect(dashboard?._meta?.ui).toMatchObject({ resourceUri: UI_RESOURCES.dashboard });
    expect(dashboard?._meta?.["openai/ui"]).toMatchObject({ entrypoints: [{ type: "global" }, { type: "thread" }] });
    expect(review?._meta?.["openai/ui"]).toMatchObject({ entrypoints: expect.arrayContaining([expect.objectContaining({ type: "file", extensions: expect.arrayContaining(["docx", "pdf", "xlsx", "tiff"]) })]) });
    expect(tools.find((tool) => tool.name === "brs_get_dashboard")?._meta?.ui).toBeUndefined();
    expect(tools.find((tool) => tool.name === "brs_search_pubmed")?.annotations.openWorldHint).toBe(true);
    expect(tools.find((tool) => tool.name === "brs_create_google_scholar_search")?.annotations.openWorldHint).toBe(true);
    expect(tools.find((tool) => tool.name === "brs_ingest_chatgpt_file")?._meta?.["openai/fileParams"]).toEqual(["file"]);
    expect(tools.find((tool) => tool.name === "brs_render_evidence_workspace")?._meta?.ui).toMatchObject({ resourceUri: UI_RESOURCES.evidence });
    for (const tool of tools) {
      expect(tool.outputSchema.required).toContain("next_actions");
      expect(tool.securitySchemes?.[0]).toMatchObject({ type: "oauth2", scopes: expect.arrayContaining(["brs:read"]) });
      if (!tool.annotations.readOnlyHint) expect(tool.securitySchemes?.[0]?.scopes).toContain("brs:write");
    }
  });

  it("returns a standards-based MCP App resource with display metadata", () => {
    const result = readMcpResource(process.cwd(), UI_RESOURCES.approval);
    expect(result.contents[0]).toMatchObject({
      uri: UI_RESOURCES.approval,
      mimeType: "text/html;profile=mcp-app",
      _meta: { "openai/ui": { availableDisplayModes: ["inline", "fullscreen"] } }
    });
    expect(result.contents[0]?.text).toContain("data-surface=\"cards\"");
    expect(result.contents[0]?.text).toContain("<style>");
    expect(result.contents[0]?.text).not.toContain("src=\"./ui.js\"");
  });
});

describe("clickable questions and governed approvals", () => {
  it("stores exact options and rejects unknown or repeated selections", () => {
    const { db } = setup();
    const request = createSelectableQuestion(db, {
      prompt: "Choose the study design",
      selection_mode: "single",
      options: [
        { value: "observational", title: "Observational" },
        { value: "randomized", title: "Randomized trial" }
      ]
    });
    expect(request.requested_schema).toMatchObject({ properties: { selected: { oneOf: [{ const: "observational" }, { const: "randomized" }] } } });
    expect(() => submitSelectableResponse(db, request.id, "other-design")).toThrow(/invalid option/);
    expect(submitSelectableResponse(db, request.id, "observational").status).toBe("answered");
    expect(() => submitSelectableResponse(db, request.id, "randomized")).toThrow(/already been answered/);
  });

  it("locks approval wording and context before a human decision", () => {
    const { root, db } = setup();
    const project = createProject(db, { title: "Study", project_type: "manuscript revision", article_type: "Original research" }) as { id: string };
    const source = ingestSource(db, root, project.id, "source.txt", "text/plain", Buffer.from("Exposure X was measured.")) as { id: string };
    const revision = createRevision(db, { project_id: project.id, source_artifact_ids: [source.id], section: "Discussion", original_text: "X caused Y.", proposed_text: "X was associated with Y.", rationale: "Observational evidence does not establish causation.", substantive_domains: ["causal-language"] }) as { id: string };
    for (const gate of ["A", "B", "C"] as const) {
      const prior = prepareApprovalRequest(db, { project_id: project.id, gate });
      submitPreparedApproval(db, { request_id: prior.id, decision: "approved", approver: "Human reviewer", rationale: "Checked the displayed gate context." });
    }
    const request = prepareApprovalRequest(db, { project_id: project.id, subject_id: revision.id, gate: "D" });
    submitPreparedApproval(db, { request_id: request.id, decision: "approved", approver: "Human reviewer", rationale: "Checked against the supplied design." });
    const approval = listApprovals(db, project.id)[0] as Record<string, unknown>;
    expect(approval.exact_proposed_wording).toBe("X was associated with Y.");
    expect(approval.selected_source_version).toBe(source.id);
    expect(approval.approver).toBe("Human reviewer");
  });

  it("enforces gate order, evidence intake, and validated selectable inputs", () => {
    const { db } = setup();
    const project = createProject(db, { title: "Study", project_type: "manuscript revision", article_type: "Original research" }) as { id: string };
    expect(() => prepareApprovalRequest(db, { project_id: project.id, gate: "B" })).toThrow(/Gate A/);
    const gateA = prepareApprovalRequest(db, { project_id: project.id, gate: "A" });
    submitPreparedApproval(db, { request_id: gateA.id, decision: "approved", approver: "Reviewer", rationale: "Scope checked." });
    expect(() => prepareApprovalRequest(db, { project_id: project.id, gate: "B" })).toThrow(/at least one source/);
    expect(() => createSelectableQuestion(db, { prompt: "Choose", selection_mode: "invalid" as "single", options: [{ value: "a", title: "A" }, { value: "b", title: "B" }] })).toThrow(/selection_mode/);
    expect(() => createSelectableQuestion(db, { prompt: "Choose", selection_mode: "single", options: [{ value: "a", title: "A" }, { value: "a", title: "Duplicate" }] })).toThrow(/unique/);
  });
});

describe("MCP JSON-RPC endpoint", () => {
  it("supports initialize, tools/list, and headless tool results", async () => {
    const { root, db } = setup();
    const app = Fastify();
    registerMcpRoutes(app, db, root);
    const discovered = await app.inject({ method: "POST", url: "/mcp", payload: { jsonrpc: "2.0", id: 0, method: "server/discover", params: {} } });
    expect(discovered.json().result).toMatchObject({ resultType: "complete", supportedVersions: expect.arrayContaining(["2026-07-28", "2025-06-18"]), capabilities: { tools: {}, resources: {} } });
    const initialized = await app.inject({ method: "POST", url: "/mcp", payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } } });
    expect(initialized.statusCode).toBe(200);
    expect(initialized.json().result.capabilities).toHaveProperty("tools");
    const listed = await app.inject({ method: "POST", url: "/mcp", payload: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} } });
    expect(listed.json().result).toMatchObject({ resultType: "complete", ttlMs: 300000, cacheScope: "public" });
    expect(listed.json().result.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "brs_create_selectable_question" })]));
    const called = await app.inject({ method: "POST", url: "/mcp", payload: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "brs_list_projects", arguments: {} } } });
    expect(called.json().result).toMatchObject({ structuredContent: { data: [], fallback_text: expect.any(String), next_actions: expect.any(Array) } });
    await app.close();
  });
});
