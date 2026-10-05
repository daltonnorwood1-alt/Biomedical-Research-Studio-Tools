import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, "dist");
const pages = ["onboarding.html", "dashboard.html", "review.html", "approval.html", "forms.html", "cards.html"];

const css = await readFile(join(root, "styles.css"), "utf8");
const bridge = await readFile(join(root, "bridge.js"), "utf8");
const ui = (await readFile(join(root, "ui.js"), "utf8")).replace('import { bridge } from "./bridge.js";\n', "");
const script = `${bridge}\n${ui}`;

await mkdir(output, { recursive: true });
for (const page of pages) {
  const source = await readFile(join(root, page), "utf8");
  const bundled = source
    .replace('<link rel="stylesheet" href="./styles.css">', `<style>\n${css}\n</style>`)
    .replace('<script type="module" src="./ui.js"></script>', `<script type="module">\n${script}\n</script>`);
  await writeFile(join(output, page), bundled);
}

console.log(`Built ${pages.length} self-contained MCP App resources in ${output}`);
