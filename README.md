# Biomedical Research Studio Tools

This repository preserves the public GitHub Pages site at the repository root and stores the authenticated MCP server in `backend/`.

- Public documentation: <https://daltonnorwood1-alt.github.io/Biomedical-Research-Studio-Tools/>
- MCP endpoint after deployment: `https://<service-host>/mcp`
- Deployment definition: `render.yaml`

The production service refuses to start without OAuth configuration. It verifies access-token signature, issuer, audience, expiry, subject, and scopes and isolates each authenticated subject into a separate SQLite database and artifact directory.
