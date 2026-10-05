import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuthRuntime, READ_SCOPE, WRITE_SCOPE, type AuthIdentity } from "../server/auth.js";
import { createProject, listProjects } from "../server/core.js";
import { createTenantStore } from "../server/tenancy.js";

const saved = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe("production authentication boundary", () => {
  it("refuses insecure production startup unless the operator explicitly overrides it", () => {
    process.env.NODE_ENV = "production";
    process.env.BRS_AUTH_MODE = "disabled";
    delete process.env.BRS_ALLOW_INSECURE_PRODUCTION;
    expect(() => createAuthRuntime()).toThrow(/refuses to start without OAuth/);
  });

  it("requires HTTPS OAuth configuration", () => {
    process.env.NODE_ENV = "production";
    process.env.BRS_AUTH_MODE = "oauth";
    process.env.BRS_PUBLIC_BASE_URL = "http://example.test";
    process.env.BRS_OAUTH_ISSUER = "https://issuer.example.test";
    process.env.BRS_OAUTH_JWKS_URI = "https://issuer.example.test/.well-known/jwks.json";
    expect(() => createAuthRuntime()).toThrow(/must use HTTPS/);
  });
});

describe("tenant storage isolation", () => {
  it("gives each authenticated subject a separate database and artifact root", () => {
    const root = mkdtempSync(join(tmpdir(), "brs-tenants-"));
    const store = createTenantStore(root);
    const identity = (tenantKey: string, subject: string): AuthIdentity => ({
      tenantKey,
      subject,
      issuer: "https://issuer.example.test",
      scopes: new Set([READ_SCOPE, WRITE_SCOPE])
    });
    const alice = store.workspaceFor(identity("alice-key", "alice"));
    const bob = store.workspaceFor(identity("bob-key", "bob"));

    createProject(alice.db, { title: "Alice project", project_type: "writing", article_type: "Original research" }, "Alice");

    expect(listProjects(alice.db)).toHaveLength(1);
    expect(listProjects(bob.db)).toEqual([]);
    expect(alice.dataRoot).not.toBe(bob.dataRoot);
    expect(alice.dataRoot).toContain(join("tenants", "alice-key"));
    store.close();
  });
});

