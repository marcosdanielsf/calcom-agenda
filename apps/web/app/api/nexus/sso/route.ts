import process from "node:process";
import { WEBAPP_URL } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { isAllowedOrigin, normalizeTheme, resolveDestRoute } from "@lib/nexus-sso/config";
import {
  consumeJti,
  NexusSsoEmailConflictError,
  NexusSsoJtiReusedError,
  resolveNexusUser,
} from "@lib/nexus-sso/provision";
import { buildSessionCookie } from "@lib/nexus-sso/session";
import { importNexusPublicKey, verifyNexusToken } from "@lib/nexus-sso/verifyToken";
import { type NextRequest, NextResponse } from "next/server";

const log = logger.getSubLogger({ prefix: ["nexus-sso"] });

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

async function handler(req: NextRequest) {
  const rawKey = process.env.NEXUS_AGENDA_SSO_PUBLIC_KEY;
  const secret = process.env.NEXTAUTH_SECRET;
  if (!rawKey || !secret) return fail("agenda_sso_unavailable", 503);
  let key: Awaited<ReturnType<typeof importNexusPublicKey>>;
  try {
    key = await importNexusPublicKey(rawKey);
  } catch {
    log.error("chave publica do SSO invalida");
    return fail("agenda_sso_unavailable", 503);
  }

  if (!isAllowedOrigin(req.headers.get("origin"))) return fail("forbidden_origin", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("bad_request", 400);
  }
  const token = form.get("token");
  const dest = form.get("dest");
  const theme = normalizeTheme(form.get("theme"));

  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    return fail("invalid_token", 401);
  }
  let claims: Awaited<ReturnType<typeof verifyNexusToken>>;
  try {
    claims = await verifyNexusToken(token, key);
  } catch {
    return fail("invalid_token", 401);
  }

  // dest antes do jti: destino recusado nao queima o token.
  const route = resolveDestRoute(dest);
  if (!route) return fail("invalid_dest", 400);

  try {
    await consumeJti(claims.jti, claims.exp);
  } catch (e) {
    if (e instanceof NexusSsoJtiReusedError) return fail("invalid_token", 401);
    throw e;
  }

  let user: Awaited<ReturnType<typeof resolveNexusUser>>;
  try {
    user = await resolveNexusUser({ sub: claims.sub, email: claims.email, name: claims.name });
  } catch (e) {
    if (e instanceof NexusSsoEmailConflictError) return fail("agenda_email_conflict", 409);
    throw e;
  }

  const cookie = await buildSessionCookie({ user, secret, webappUrl: WEBAPP_URL });
  const res = NextResponse.redirect(`${WEBAPP_URL}${route}?shell=nexus&theme=${theme}`, 303);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}

export async function POST(req: NextRequest, _ctx?: unknown) {
  try {
    return await handler(req);
  } catch (e) {
    // Nunca logar token nem corpo: so a mensagem do erro.
    log.error("falha no login unico", { message: e instanceof Error ? e.message : "desconhecido" });
    return fail("agenda_sso_error", 500);
  }
}
