import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export const READ_SCOPE = "brs:read";
export const WRITE_SCOPE = "brs:write";

export type AuthIdentity = {
  subject: string;
  issuer: string;
  tenantKey: string;
  scopes: Set<string>;
  email?: string;
  displayName?: string;
};

type AuthConfig = {
  enabled: boolean;
  resource: string;
  issuer?: string;
  audience?: string;
  jwksUri?: string;
};

const identities = new WeakMap<object, AuthIdentity>();

function normalizedUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  return url.toString().replace(/\/$/, "");
}

function loadConfig(): AuthConfig {
  const production = process.env.NODE_ENV === "production";
  const mode = process.env.BRS_AUTH_MODE ?? (production ? "oauth" : "disabled");
  if (mode === "disabled") {
    if (production && process.env.BRS_ALLOW_INSECURE_PRODUCTION !== "true") {
      throw new Error("Production refuses to start without OAuth. Set BRS_AUTH_MODE=oauth.");
    }
    return { enabled: false, resource: "http://127.0.0.1:4317" };
  }
  if (mode !== "oauth") throw new Error("BRS_AUTH_MODE must be oauth or disabled");
  const inferredRenderUrl = process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : "";
  const resource = normalizedUrl(process.env.BRS_PUBLIC_BASE_URL ?? inferredRenderUrl, "BRS_PUBLIC_BASE_URL");
  const issuer = normalizedUrl(process.env.BRS_OAUTH_ISSUER ?? "", "BRS_OAUTH_ISSUER");
  const audience = process.env.BRS_OAUTH_AUDIENCE?.trim() || resource;
  const jwksUri = normalizedUrl(process.env.BRS_OAUTH_JWKS_URI ?? "", "BRS_OAUTH_JWKS_URI");
  return { enabled: true, resource, issuer, audience, jwksUri };
}

function scopesFrom(payload: JWTPayload): Set<string> {
  const scopes = new Set<string>();
  if (typeof payload.scope === "string") for (const scope of payload.scope.split(/\s+/)) if (scope) scopes.add(scope);
  const scp = payload.scp;
  if (Array.isArray(scp)) for (const scope of scp) if (typeof scope === "string") scopes.add(scope);
  return scopes;
}

function bearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

export function createAuthRuntime() {
  const config = loadConfig();
  const jwks = config.enabled ? createRemoteJWKSet(new URL(config.jwksUri!)) : undefined;
  const metadataUrl = `${config.resource}/.well-known/oauth-protected-resource`;

  const challenge = (scope = READ_SCOPE, error?: string, description?: string) => {
    const parts = [`resource_metadata="${metadataUrl}"`, `scope="${scope}"`];
    if (error) parts.push(`error="${error}"`);
    if (description) parts.push(`error_description="${description.replace(/["\\]/g, "")}"`);
    return `Bearer ${parts.join(", ")}`;
  };

  async function authenticate(request: FastifyRequest): Promise<AuthIdentity> {
    const existing = identities.get(request);
    if (existing) return existing;
    if (!config.enabled) {
      const local: AuthIdentity = {
        subject: "local-user",
        issuer: "local",
        tenantKey: "local",
        scopes: new Set([READ_SCOPE, WRITE_SCOPE]),
        displayName: "Local user"
      };
      identities.set(request, local);
      return local;
    }
    const token = bearerToken(request);
    if (!token) throw new Error("missing_token");
    try {
      const { payload } = await jwtVerify(token, jwks!, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"]
      });
      if (!payload.sub) throw new Error("Token is missing sub");
      const scopes = scopesFrom(payload);
      if (!scopes.has(READ_SCOPE)) throw new Error(`Token is missing ${READ_SCOPE}`);
      const tenantKey = createHash("sha256").update(`${payload.iss}\0${payload.sub}`).digest("hex");
      const identity: AuthIdentity = {
        subject: payload.sub,
        issuer: payload.iss!,
        tenantKey,
        scopes,
        email: typeof payload.email === "string" ? payload.email : undefined,
        displayName: typeof payload.name === "string" ? payload.name : undefined
      };
      identities.set(request, identity);
      return identity;
    } catch (error) {
      if (error instanceof Error && error.message === "missing_token") throw error;
      throw new Error("invalid_token");
    }
  }

  async function protect(request: FastifyRequest, reply: FastifyReply) {
    try {
      await authenticate(request);
    } catch (error) {
      const missing = error instanceof Error && error.message === "missing_token";
      return reply
        .header("WWW-Authenticate", challenge(READ_SCOPE, missing ? "invalid_request" : "invalid_token", missing ? "Sign in to Biomedical Research Studio" : "The access token is invalid or expired"))
        .code(401)
        .send({ error: missing ? "Authentication required" : "Invalid or expired access token" });
    }
  }

  return { config, metadataUrl, challenge, authenticate, protect };
}

export type AuthRuntime = ReturnType<typeof createAuthRuntime>;
