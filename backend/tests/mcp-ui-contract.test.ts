import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../server/db.js";
import { createSelectableQuestion } from "../server/interactions.js";
import { listMcpResources, listMcpTools, readMcpResource, UI_RESOURCES } from "../server/mcp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("MCP Apps UI contracts", () => {
  it("links every render tool to a registered MCP App resource with a model-readable fallback", () => {
    const resources = new Set(listMcpResources().map((resource) => resource.uri));
    const renderTools = listMcpTools().filter((tool) => tool.name.startsWith("brs_render_"));

    expect(resources).toEqual(new Set(Object.values(UI_RESOURCES)));
    expect(renderTools).toHaveLength(6);
    for (const tool of renderTools) {
      const metadata = tool._meta as any;
      expect(resources.has(metadata.ui.resourceUri), `${tool.name} must reference a listed resource`).toBe(true);
      expect(metadata["openai/outputTemplate"]).toBe(metadata.ui.resourceUri);
      expect(metadata.ui.visibility).toEqual(["model", "app"]);
      expect(tool.outputSchema.required).toEqual(["view", "data", "fallback_text", "next_actions"]);
    }
  });

  it("advertises the dashboard and review workspace on the intended ChatGPT surfaces", () => {
    const byName = new Map(listMcpTools().map((tool) => [tool.name, tool]));
    const dashboard = byName.get("brs_render_dashboard")?._meta as any;
    const review = byName.get("brs_render_review_workspace")?._meta as any;

    expect(dashboard["openai/ui"].entrypoints).toEqual([{ type: "global" }, { type: "thread" }]);
    expect(review["openai/ui"].entrypoints).toContainEqual({ type: "thread" });
    expect(review["openai/ui"].entrypoints).toContainEqual(expect.objectContaining({
      type: "file",
      extensions: expect.arrayContaining(["docx", "pdf", "csv", "xlsx", "png"])
    }));
  });

  it("returns packaged HTML resources instead of the emergency fallback", () => {
    for (const resource of listMcpResources()) {
      const response = readMcpResource(root, resource.uri);
      expect(response.contents).toHaveLength(1);
      const content = response.contents[0]!;
      expect(content.mimeType).toBe("text/html;profile=mcp-app");
      expect(content.text).toContain("<!doctype html>");
      expect(content.text).not.toContain("This component is loading structured data");
      expect(content.text).not.toMatch(/(?:href|src)="\.\/(?:styles\.css|bridge\.js|ui\.js)"/);
      expect((content._meta as any)["openai/ui"].availableDisplayModes).toContain("inline");
    }
  });

  it("builds native rich-form option schemas for single and multiple selections", () => {
    const temp = mkdtempSync(join(tmpdir(), "brs-form-contract-"));
    const db = openDatabase(join(temp, "studio.sqlite"));
    try {
      const single = createSelectableQuestion(db, {
        prompt: "Choose a workflow",
        selection_mode: "single",
        options: [{ value: "audit", title: "Audit" }, { value: "draft", title: "Draft" }]
      });
      const multiple = createSelectableQuestion(db, {
        prompt: "Choose supplied materials",
        selection_mode: "multiple",
        min_selections: 1,
        max_selections: 2,
        options: [{ value: "manuscript", title: "Manuscript" }, { value: "tables", title: "Tables" }]
      });
      const singleSelection = (single.requested_schema as any).properties.selected;
      const multipleSelection = (multiple.requested_schema as any).properties.selected;

      expect(singleSelection.oneOf).toEqual([
        { const: "audit", title: "Audit" },
        { const: "draft", title: "Draft" }
      ]);
      expect(multipleSelection.items.oneOf).toEqual([
        { const: "manuscript", title: "Manuscript" },
        { const: "tables", title: "Tables" }
      ]);
      expect(multipleSelection).toMatchObject({ minItems: 1, maxItems: 2, uniqueItems: true });
    } finally {
      db.close();
    }
  });
});
