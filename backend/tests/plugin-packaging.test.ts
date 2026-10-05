import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath: string): Record<string, any> {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function resolvePackagedPath(relativePath: string): string {
  expect(relativePath.startsWith("./")).toBe(true);
  expect(relativePath.includes("..")).toBe(false);
  const resolved = normalize(join(root, relativePath));
  expect(resolved.startsWith(`${normalize(root)}/`)).toBe(true);
  return resolved;
}

describe("plugin package contracts", () => {
  it("keeps portable, compatibility, and Node package identities aligned", () => {
    const portable = readJson("plugin.json");
    const compatibility = readJson(".codex-plugin/plugin.json");
    const nodePackage = readJson("package.json");

    expect(portable.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(portable.name).toBe("biomedical-research-studio");
    expect(compatibility.name).toBe(portable.name);
    expect(nodePackage.name).toBe(portable.name);
    expect(compatibility.version).toBe(portable.version);
    expect(nodePackage.version).toBe(portable.version);
    expect(compatibility.skills).toBe("./skills/");
  });

  it("declares only supported OpenAI packaging sections and a packaged onboarding skill", () => {
    const portable = readJson("plugin.json");
    const openai = portable.extensions["com.openai"];
    const compatibility = readJson(".codex-plugin/plugin.json");

    expect(Object.keys(openai).sort()).toEqual(["interface", "onboardingSkill"]);
    expect(openai.onboardingSkill).toBe("./skills/onboarding/SKILL.md");
    expect(existsSync(resolvePackagedPath(openai.onboardingSkill))).toBe(true);
    expect(compatibility.extensions["com.openai"].onboardingSkill).toBe(openai.onboardingSkill);
  });

  it("packages valid square interface assets and mirrors their paths in the compatibility manifest", () => {
    const portable = readJson("plugin.json");
    const compatibility = readJson(".codex-plugin/plugin.json");
    const ui = portable.extensions["com.openai"].interface;

    expect(ui.displayName.length).toBeLessThanOrEqual(30);
    expect(ui.shortDescription.length).toBeLessThanOrEqual(30);
    expect(ui.defaultPrompt).toHaveLength(3);
    for (const prompt of ui.defaultPrompt) expect(prompt.length).toBeLessThanOrEqual(128);
    expect(compatibility.interface).toEqual(ui);

    for (const field of ["logo", "composerIcon"] as const) {
      const asset = readFileSync(resolvePackagedPath(ui[field]), "utf8");
      const dimensions = asset.match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"[^>]*viewBox="0 0 (\d+) (\d+)"/);
      expect(dimensions, `${field} must declare numeric SVG dimensions and a viewBox`).not.toBeNull();
      const [, width, height, viewWidth, viewHeight] = dimensions!;
      expect(Number(width)).toBeGreaterThanOrEqual(48);
      expect(width).toBe(height);
      expect(viewWidth).toBe(viewHeight);
    }
  });

  it("declares one local Streamable HTTP MCP endpoint using the portable schema", () => {
    const mcp = readJson("mcp.json");
    expect(mcp.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
    expect(Object.keys(mcp.mcpServers)).toEqual(["biomedical-research-studio"]);
    expect(mcp.mcpServers["biomedical-research-studio"]).toEqual({
      type: "streamable-http",
      url: "http://127.0.0.1:4317/mcp"
    });
  });
});
