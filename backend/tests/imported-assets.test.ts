import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const builder = join(root, "skills", "medical-data-integrity-audit", "scripts", "build_review_interface.py");

describe("adapted source packages", () => {
  it("records both writer containers but adapts one identical payload", () => {
    const manifest = JSON.parse(readFileSync(join(root, "imported-sources", "manifest.json"), "utf8"));
    const duplicate = manifest.artifacts.find((artifact: { original_name: string }) => artifact.original_name.endsWith("(2).zip"));
    expect(duplicate.status).toBe("entry-identical-duplicate");
    expect(duplicate.duplicate_of).toBe("research-manuscript-writer (1).zip");
  });

  it("packages a portable ChatGPT and Codex skill suite", () => {
    const plugin = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8"));
    expect(plugin.$schema).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(plugin.name).toBe("biomedical-research-studio");
    expect(plugin.extensions["com.openai"].interface.displayName).toBe("Biomedical Research Studio");
  });

  it("builds an escaped, CSP-constrained audit interface inside the project root", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "brs-audit-"));
    const review = join(projectRoot, "review.json");
    const output = join(projectRoot, "review.html");
    copyFileSync(join(root, "fixtures", "audit-review.json"), review);
    const result = spawnSync("python3", [builder, review, "--output", output, "--allowed-root", projectRoot], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const html = readFileSync(output, "utf8");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("&lt;script&gt;alert(&#x27;escaped&#x27;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert('escaped')</script>");
  });

  it("rejects audit inputs outside the allowed project root", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "brs-audit-"));
    const result = spawnSync("python3", [builder, "/etc/passwd", "--output", join(projectRoot, "review.html"), "--allowed-root", projectRoot], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must stay within the allowed project root");
  });
});
