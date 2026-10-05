# Public ChatGPT deployment boundary

Version 0.4.1 contains a deployable container and MCP 2.0-compatible `/mcp` transport. Hosted mode now fails closed unless OAuth is configured, validates signed access tokens on every private request, enforces read/write scopes, and isolates each OAuth subject into a separate SQLite database and artifact directory. External security review and provider configuration are still required before public submission.

## Required public architecture

1. Deploy the container at a stable HTTPS origin and configure an established OAuth 2.1 identity provider. Auth0 is the reference configuration; do not build a password system in this service.
2. Set `BRS_AUTH_MODE=oauth`, `BRS_PUBLIC_BASE_URL`, `BRS_OAUTH_ISSUER`, `BRS_OAUTH_AUDIENCE`, and `BRS_OAUTH_JWKS_URI`. The service will refuse production startup without a valid HTTPS configuration.
3. The service requires authentication for `/mcp` and every `/api` route. Only static assets, the OAuth protected-resource document, and the minimal health probe are public.
4. Store `BRS_DATA_ROOT` on encrypted persistent storage. The server derives a non-reversible tenant key from the verified issuer and subject and stores every tenant in a separate database and artifact root.
5. Allow outbound HTTPS only to NCBI E-utilities, Crossref, and short-lived ChatGPT file-download hosts. Google Scholar remains a user-opened link and is not fetched by the server.
6. Replace the local URL in `mcp.json` with the final verified HTTPS `/mcp` URL only in the publication package.

## Required publication material

- Verified developer or business identity and domain.
- Public support page, privacy policy, and terms of service on that domain.
- OAuth client and protected-resource metadata compatible with the selected gateway.
- Reviewer test account and concise test cases for onboarding, file intake, PubMed search, EndNote import, evidence linking, and approval gates.
- A data-retention and deletion procedure covering SQLite rows, immutable sources, generated artifacts, logs, and backups.
- A vulnerability and abuse-response contact.

## Environment

`BRS_HOST=0.0.0.0` is set by the container. `PORT` defaults to 4317. `BRS_DATA_ROOT` defaults to `/data` in the container. Mount `/data` on encrypted persistent storage.

The server never trusts caller-supplied identity headers. It verifies JWT signature, issuer, audience, time validity, subject, and scopes against the configured provider JWKS. A static bearer token or a public unauthenticated endpoint is not acceptable for manuscripts or research data.

## Render deployment

`render.yaml` provisions the container and an attached `/data` disk. Render hosting and the identity provider are separate from ChatGPT usage and may have their own charges. Fill the unsynchronized environment variables in the Render dashboard; never commit secrets or tokens.

On Render, the service derives its public origin from `RENDER_EXTERNAL_HOSTNAME`. On other hosts, set `BRS_PUBLIC_BASE_URL` explicitly. Configure the OAuth API audience to that exact origin, with no `/mcp` suffix. The ChatGPT server URL is the same origin followed by `/mcp`.

## Release gate

Public submission remains blocked until authentication, tenant authorization, policy URLs, verified domain/identity, hosted HTTPS endpoint, and external penetration/security review are complete. This is an operational boundary, not a scientific approval gate, and it must not be bypassed by changing the plugin manifest alone.
