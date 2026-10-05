import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { Type } from "@sinclair/typebox";
import { FindingInput, ProjectInput, RevisionInput, TaskInput, type FindingInputType, type ProjectInputType, type RevisionInputType, type TaskInputType } from "../shared/schemas/contracts.js";
import { createFinding, createProject, createRevision, createTask, getDashboard, ingestSource, listApprovals, listProjects, listRecords, listSources, releaseAssessment } from "./core.js";
import { produceDocuments } from "./docx.js";
import { registerMcpRoutes } from "./mcp.js";
import { createAuthRuntime } from "./auth.js";
import { createTenantStore } from "./tenancy.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = existsSync(join(here, "..", "app")) ? join(here, "..") : join(here, "..", "..");
const dataRoot = process.env.BRS_DATA_ROOT ?? join(repoRoot, "data");
const auth = createAuthRuntime();
const tenants = createTenantStore(dataRoot);
export const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });

await app.register(cors, { origin: false });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 20 } });
await app.register(staticPlugin, { root: join(repoRoot, "app"), prefix: "/" });
await app.register(staticPlugin, { root: join(repoRoot, "ui"), prefix: "/ui/", decorateReply: false });

app.get("/.well-known/oauth-protected-resource", async (_request, reply) => {
  if (!auth.config.enabled) return reply.code(404).send({ error: "OAuth is disabled in local mode" });
  return {
    resource: auth.config.resource,
    authorization_servers: [auth.config.issuer],
    scopes_supported: ["brs:read", "brs:write"],
    resource_documentation: process.env.BRS_DOCUMENTATION_URL ?? `${auth.config.resource}/`,
    resource_policy_uri: process.env.BRS_PRIVACY_POLICY_URL,
    resource_tos_uri: process.env.BRS_TERMS_URL
  };
});

app.addHook("preHandler", async (request, reply) => {
  const path = request.url.split("?", 1)[0] ?? request.url;
  if (path === "/mcp" || path === "/api" || path.startsWith("/api/")) return auth.protect(request, reply);
});

const workspaceFor = async (request: Parameters<typeof auth.authenticate>[0]) => tenants.workspaceFor(await auth.authenticate(request));
registerMcpRoutes(app, workspaceFor, repoRoot, dataRoot, auth);

app.get("/health", async () => ({ status: "ok", authentication: auth.config.enabled ? "oauth" : "local", tenancy: "isolated", schema_version: "2.0.0", plugin_version: "0.4.1" }));
app.get("/api/projects", async (request) => listProjects((await workspaceFor(request)).db));
app.post("/api/projects", { schema: { body: ProjectInput } }, async (request, reply) => {
  const workspace = await workspaceFor(request);
  return reply.code(201).send(createProject(workspace.db, request.body as ProjectInputType, workspace.identity.displayName ?? workspace.identity.email ?? workspace.identity.subject));
});
app.get("/api/projects/:projectId/dashboard", { schema: { params: Type.Object({ projectId: Type.String() }) } }, async (request) => getDashboard((await workspaceFor(request)).db, (request.params as { projectId: string }).projectId));
app.get("/api/projects/:projectId/sources", { schema: { params: Type.Object({ projectId: Type.String() }) } }, async (request) => listSources((await workspaceFor(request)).db, (request.params as { projectId: string }).projectId));
app.get("/api/projects/:projectId/records", { schema: { params: Type.Object({ projectId: Type.String() }), querystring: Type.Object({ type: Type.Optional(Type.String()) }) } }, async (request) => listRecords((await workspaceFor(request)).db, (request.params as { projectId: string }).projectId, (request.query as { type?: string }).type));
app.get("/api/projects/:projectId/approvals", { schema: { params: Type.Object({ projectId: Type.String() }) } }, async (request) => listApprovals((await workspaceFor(request)).db, (request.params as { projectId: string }).projectId));
app.get("/api/projects/:projectId/release", { schema: { params: Type.Object({ projectId: Type.String() }) } }, async (request) => releaseAssessment((await workspaceFor(request)).db, (request.params as { projectId: string }).projectId));

app.post("/api/projects/:projectId/sources", { schema: { params: Type.Object({ projectId: Type.String() }) } }, async (request, reply) => {
  const workspace = await workspaceFor(request);
  const file = await request.file();
  if (!file) return reply.code(400).send({ error: "A file is required." });
  const bytes = await file.toBuffer();
  return reply.code(201).send(ingestSource(workspace.db, workspace.dataRoot, (request.params as { projectId: string }).projectId, file.filename, file.mimetype, bytes, workspace.identity.displayName ?? workspace.identity.email ?? workspace.identity.subject));
});

app.post("/api/tasks", { schema: { body: TaskInput } }, async (request, reply) => reply.code(201).send(createTask((await workspaceFor(request)).db, request.body as TaskInputType)));
app.post("/api/revisions", { schema: { body: RevisionInput } }, async (request, reply) => reply.code(201).send(createRevision((await workspaceFor(request)).db, request.body as RevisionInputType)));
app.post("/api/findings", { schema: { body: FindingInput } }, async (request, reply) => reply.code(201).send(createFinding((await workspaceFor(request)).db, request.body as FindingInputType)));
app.post("/api/approvals", async (_request, reply) => reply.code(409).send({
  error: "Direct approval recording is disabled. Prepare and submit a server-issued approval request through the governed MCP workflow.",
  blocked: true,
  next_step: "Use brs_prepare_approval, review the locked context, then use brs_submit_approval with a named human approver."
}));
app.post("/api/projects/:projectId/documents", { schema: { params: Type.Object({ projectId: Type.String() }), body: Type.Object({ revision_id: Type.String() }) } }, async (request, reply) => {
  try {
    const workspace = await workspaceFor(request);
    return reply.code(201).send(produceDocuments(workspace.db, workspace.dataRoot, (request.params as { projectId: string }).projectId, (request.body as { revision_id: string }).revision_id));
  } catch (error) {
    return reply.code(409).send({ error: error instanceof Error ? error.message : "Document production blocked" });
  }
});

app.get("/api/policies", async () => JSON.parse(readFileSync(join(repoRoot, "shared", "policies", "safety-rules.json"), "utf8")));

app.setErrorHandler((error: unknown, _request, reply) => {
  const typed = error as { statusCode?: number; message?: string };
  const status = typed.statusCode && typed.statusCode >= 400 ? typed.statusCode : 400;
  reply.code(status).send({ error: typed.message ?? "Request failed", blocked: status === 409 });
});

app.addHook("onClose", async () => tenants.close());

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 4317);
  const host = process.env.BRS_HOST ?? "127.0.0.1";
  await app.listen({ host, port });
}
