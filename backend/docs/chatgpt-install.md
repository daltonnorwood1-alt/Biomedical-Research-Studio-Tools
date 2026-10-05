# Install Biomedical Research Studio in ChatGPT

The personal marketplace package is installed and enabled as `biomedical-research-studio@personal` version 0.4.1. Restart the ChatGPT desktop app after upgrading so it reloads the installed package.

The reusable skills are available immediately after restart. The 27 live MCP tools and six MCP App interfaces also need a ChatGPT MCP connection.

## Connect the MCP server for personal testing

1. Start the local server from the source directory with `pnpm dev`. It listens at `http://127.0.0.1:4317/mcp` by default.
2. In ChatGPT, open **Settings → Security and login** and enable **Developer mode**.
3. Open **ChatGPT Plugins**, select **+**, then **Create custom MCP server**.
4. Choose **Secure MCP Tunnel** and connect it to the local server, or use a separately deployed HTTPS endpoint ending in `/mcp`.
5. Name the connection **Biomedical Research Studio**, review the discovered 27 tools and six UI-enabled tools, acknowledge the risk notice, and create it as a plugin.
6. Copy the connection's technical ID from its browser URL. It begins with `plugin_asdk_app`. Give that ID to Codex so it can create the package's account-specific `.app.json` mapping and refresh the installed package. Do not place a guessed or placeholder ID in the release.
7. Install or refresh the completed plugin from **Personal** in the Plugins Directory, start a new **Work** chat, type `@`, and select **Biomedical Research Studio**.

Do not enter `http://127.0.0.1:4317/mcp` as a public URL. ChatGPT requires either a public HTTPS endpoint or Secure MCP Tunnel for MCP connection testing.

## Acceptance prompts

Run these in a new Work chat after connection:

1. `@Biomedical Research Studio start a new manuscript project.` Verify that clickable onboarding appears and no gate is silently approved.
2. `Show my governed research projects.` Verify that `brs_list_projects` is selected and returns a model-readable result.
3. Upload a synthetic DOCX and ask to inventory it. Verify file authorization, privacy screening, and immutable-source status.
4. Ask to extract claims and open the evidence workspace. Verify the claim list and recommended next action.
5. Search PubMed for a non-identifying test query. Verify exact query provenance and abstract passage records.
6. Ask for a Google Scholar search. Verify that a user-opened URL is returned and no scraping is claimed.
7. Import a synthetic EndNote XML record twice. Verify the second import is reported as a duplicate.
8. Try to approve Gate B before Gate A. Verify the server blocks the request.
9. Ask the plugin to call an unsupported clinical-decision or patient-treatment action. Verify that no tool is selected and no medical decision is invented.

## Public release boundary

Secure MCP Tunnel is for private development testing. Public distribution still requires a stable HTTPS `/mcp` endpoint, OAuth and tenant/project authorization, verified publisher identity and domain, privacy/terms/support URLs, operational deletion and retention procedures, and submission review. See [public deployment](./public-deployment.md).
