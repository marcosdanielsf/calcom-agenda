// Criado: 2026-11-02 BRT. POST /api/nexus/agenda-ia: o agente de IA do Nexus le horarios livres, reserva, lista, remarca e
// cancela na agenda do dono da subconta. Servidor a servidor: Bearer assinado pela chave do login unico, destino proprio e
// corpo preso ao token (bsh). O dono da agenda vem do token (a subconta), nunca do corpo.
import { createHash } from "node:crypto";
import process from "node:process";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import logger from "@calcom/lib/logger";
import { usesNexusBooking } from "@calcom/lib/nexus-booking/server";
import { NEXUS_AGENDA_IA_AUDIENCE } from "@lib/nexus-sso/config";
import { verifyNexusEventTypesToken } from "@lib/nexus-sso/eventTypes";
import {
  NexusAgendaIaError,
  nexusAgendaIaInputSchema,
  runNexusAgendaIaOp,
} from "@lib/nexus-sso/agendaIa";
import { createAgendaIaDeps } from "@lib/nexus-sso/agendaIaDeps";
import {
  consumeJti,
  NexusSsoEmailConflictError,
  NexusSsoJtiReusedError,
  resolveNexusUser,
} from "@lib/nexus-sso/provision";
import { importNexusPublicKey } from "@lib/nexus-sso/verifyToken";
import { type NextRequest, NextResponse } from "next/server";

const log = logger.getSubLogger({ prefix: ["nexus-agenda-ia"] });
const MAX_BODY_BYTES = 8 * 1024;

const reply = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function handler(req: NextRequest) {
  const rawKey = process.env.NEXUS_AGENDA_SSO_PUBLIC_KEY;
  if (!rawKey) return reply({ error: "agenda_unavailable" }, 503);
  // Com o motor em modo Nexus a reserva mora no Nexus; gravar aqui criaria reserva que o outro lado nao enxerga.
  if (usesNexusBooking()) return reply({ error: "agenda_unavailable" }, 503);
  const key = await importNexusPublicKey(rawKey);

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 4096)
    return reply({ error: "invalid_token" }, 401);

  const body = await req.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES)
    return reply({ error: "payload_too_large" }, 413);
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");

  let claims: Awaited<ReturnType<typeof verifyNexusEventTypesToken>>;
  try {
    claims = await verifyNexusEventTypesToken(
      token,
      key,
      bodySha256,
      NEXUS_AGENDA_IA_AUDIENCE
    );
  } catch {
    return reply({ error: "invalid_token" }, 401);
  }

  // Corpo validado antes do jti: pedido recusado nao queima o token.
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return reply({ error: "bad_request" }, 400);
  }
  const parsed = nexusAgendaIaInputSchema.safeParse(json);
  if (!parsed.success) return reply({ error: "bad_request" }, 400);

  try {
    await consumeJti(claims.jti, claims.exp);
  } catch (e) {
    if (e instanceof NexusSsoJtiReusedError)
      return reply({ error: "invalid_token" }, 401);
    throw e;
  }

  try {
    const owner = await resolveNexusUser({
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
    });
    await checkRateLimitAndThrowError({ rateLimitingType: "common", identifier: `nexusAgendaIa:${owner.id}` });
    const result = await runNexusAgendaIaOp(
      owner.id,
      parsed.data,
      createAgendaIaDeps()
    );
    return reply(result as Record<string, unknown>, 200);
  } catch (e) {
    if (e instanceof NexusSsoEmailConflictError)
      return reply({ error: "agenda_email_conflict" }, 409);
    if (e instanceof NexusAgendaIaError)
      return reply({ error: e.code }, e.status);
    // Limite de taxa estourou antes de qualquer escrita: 429 proprio, para o Nexus saber que nada foi gravado.
    if ((e as { statusCode?: unknown })?.statusCode === 429) return reply({ error: "rate_limited" }, 429);
    throw e;
  }
}

export async function POST(req: NextRequest, _ctx?: unknown) {
  try {
    return await handler(req);
  } catch (e) {
    // Nunca logar token nem corpo: so a mensagem do erro.
    log.error("falha na agenda da IA", {
      message: e instanceof Error ? e.message : "desconhecido",
    });
    return reply({ error: "agenda_ia_error" }, 500);
  }
}
