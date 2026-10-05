import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AuthIdentity } from "./auth.js";
import { openDatabase, type StudioDb } from "./db.js";

export type TenantWorkspace = {
  db: StudioDb;
  dataRoot: string;
  identity: AuthIdentity;
};

export function createTenantStore(baseDataRoot: string) {
  const cache = new Map<string, TenantWorkspace>();

  function workspaceFor(identity: AuthIdentity): TenantWorkspace {
    const cached = cache.get(identity.tenantKey);
    if (cached) return cached;
    const dataRoot = identity.tenantKey === "local" ? baseDataRoot : join(baseDataRoot, "tenants", identity.tenantKey);
    mkdirSync(dataRoot, { recursive: true });
    const workspace = { db: openDatabase(join(dataRoot, "studio.sqlite")), dataRoot, identity };
    cache.set(identity.tenantKey, workspace);
    return workspace;
  }

  function close() {
    for (const workspace of cache.values()) workspace.db.close();
    cache.clear();
  }

  return { workspaceFor, close };
}

export type TenantStore = ReturnType<typeof createTenantStore>;

