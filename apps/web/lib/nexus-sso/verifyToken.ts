import { importSPKI, jwtVerify, type KeyLike } from "jose";
import { NEXUS_SSO_AUDIENCE, NEXUS_SSO_ISSUER, NEXUS_SSO_MAX_TOKEN_TTL_SECONDS } from "./config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class NexusSsoTokenError extends Error {}

export type NexusSsoClaims = {
  sub: string;
  email: string;
  name: string | null;
  jti: string;
  exp: number;
  // Conta (tenant + subconta) do login. Opcional: token antigo nao traz, e ai o webhook da conta fica como esta.
  scope: { tenantId: string; workspaceKey: string } | null;
};

// Env de compose chega numa linha so, com as quebras escapadas como \n literal.
export function normalizePem(raw: string): string {
  return raw.trim().replace(/\\n/g, "\n");
}

export async function importNexusPublicKey(raw: string): Promise<KeyLike> {
  return importSPKI(normalizePem(raw), "EdDSA");
}

export async function verifyNexusToken(token: string, key: KeyLike): Promise<NexusSsoClaims> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["EdDSA"],
      issuer: NEXUS_SSO_ISSUER,
      audience: NEXUS_SSO_AUDIENCE,
    });
    const { sub, email, name, jti, iat, exp, tenant, workspace } = payload;
    if (typeof sub !== "string" || !sub) throw new NexusSsoTokenError("sub");
    if (typeof email !== "string" || !email.includes("@")) throw new NexusSsoTokenError("email");
    if (typeof jti !== "string" || !jti) throw new NexusSsoTokenError("jti");
    if (typeof iat !== "number" || typeof exp !== "number") throw new NexusSsoTokenError("times");
    if (exp - iat > NEXUS_SSO_MAX_TOKEN_TTL_SECONDS || exp <= iat) throw new NexusSsoTokenError("ttl");
    const scope =
      typeof tenant === "string" &&
      UUID_RE.test(tenant) &&
      typeof workspace === "string" &&
      workspace.length > 0 &&
      workspace.length <= 100
        ? { tenantId: tenant, workspaceKey: workspace }
        : null;
    return { sub, email, name: typeof name === "string" && name ? name : null, jti, exp, scope };
  } catch (e) {
    if (e instanceof NexusSsoTokenError) throw e;
    throw new NexusSsoTokenError("invalid");
  }
}
