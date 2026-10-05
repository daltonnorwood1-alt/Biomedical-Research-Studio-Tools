import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:4317" },
  webServer: { command: "pnpm dev", url: "http://127.0.0.1:4317/health", reuseExistingServer: true, timeout: 120_000 }
});
