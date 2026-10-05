import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const testDataRoot = mkdtempSync(join(tmpdir(), "brs-server-"));
process.env.BRS_DATA_ROOT = testDataRoot;
process.env.NODE_ENV = "test";
const { app } = await import("../server/index.js");

afterAll(async () => app.close());

describe("HTTP safety boundaries", () => {
  it("rejects direct approval writes and points to the governed request flow", async () => {
    const response = await app.inject({ method: "POST", url: "/api/approvals", payload: { decision: "approved" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ blocked: true, next_step: expect.stringContaining("brs_prepare_approval") });
  });
});
