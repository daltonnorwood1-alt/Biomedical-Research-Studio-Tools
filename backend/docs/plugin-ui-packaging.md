# Plugin UI packaging

Biomedical Research Studio remains a portable skills-first plugin and adds its interactive experience through a bundled MCP server. The root package follows the Agent Plugins layout:

- `plugin.json` owns portable identity and OpenAI-specific listing metadata.
- `skills/` remains automatically discovered, including the onboarding entry skill.
- `mcp.json` declares the local Streamable HTTP endpoint at `http://127.0.0.1:4317/mcp`.
- `assets/` contains the square listing and composer icons referenced by the manifest.
- `ui/` contains the MCP Apps HTML, JavaScript, and styles returned through registered `ui://` resources.
- `.codex-plugin/plugin.json` remains a compatibility fallback.

The manifest uses only documented package-level UI fields: `extensions.com.openai.interface` for listing presentation and `extensions.com.openai.onboardingSkill` for the packaged getting-started skill. Fullscreen sidebar entrypoints, conversation panels, inline cards, rich forms, and modals are MCP App capabilities. They are declared by the MCP server on the relevant tool or UI resource rather than as speculative `plugin.json` keys.

## Local and deployed endpoints

The checked-in `mcp.json` intentionally targets the loopback development server. Start the repository server before connecting the local plugin. Public ChatGPT distribution requires replacing that URL during release packaging with the deployed public HTTPS `/mcp` endpoint; a loopback URL is not suitable for public review.

Public MCP review also requires real HTTPS values for the product website, support page, privacy policy, and terms of service. They are deliberately absent from the manifest until the publisher supplies authoritative URLs; placeholder or invented legal links must not be shipped.

The UI is progressive enhancement. MCP tools must continue to return structured, model-readable results when a host cannot render the component. Scientific state, approval gates, and release blocking remain server-authoritative rather than widget-only state.

## Packaging checks

`tests/plugin-packaging.test.ts` checks manifest identity alignment, supported OpenAI extension sections, onboarding-skill existence, asset paths and dimensions, and the portable MCP declaration. The onboarding skill is also validated with the bundled skill validator during release verification.
