// Criado: 2026-10-08 BRT. POST /api/nexus/event-types: o Nexus cria ou atualiza o tipo de
// agendamento de um servico do catalogo dele, na conta do dono da pagina. Servidor a servidor:
// sem Origin, com Bearer assinado pela mesma chave do login unico e destino proprio.
import { createHash } from "node:crypto";
import process from "node:process";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import {
  nexusEventTypeInputSchema,
  upsertNexusEventType,
  verifyNexusEventTypesToken,
} from "@lib/nexus-sso/eventTypes";
import {
  consumeJti,
  NexusSsoEmailConflictError,
  NexusSsoJtiReusedError,
  resolveNexusUser,
} from "@lib/nexus-sso/provision";
import { importNexusPublicKey } from "@lib/nexus-sso/verifyToken";
import { type NextRequest, NextResponse } from "next/server";

const log = logger.getSubLogger({ prefix: ["nexus-event-types"] });
const MAX_BODY_BYTES = 16 * 1024;

const reply = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function handler(req: NextRequest) {
  const rawKey = process.env.NEXUS_AGENDA_SSO_PUBLIC_KEY;
  if (!rawKey) return reply({ error: "agenda_unavailable" }, 503);
  let key: Awaited<ReturnType<typeof importNexusPublicKey>>;
  try {
    key = await importNexusPublicKey(rawKey);
  } catch {
    log.error("chave publica invalida");
    return reply({ error: "agenda_unavailable" }, 503);
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 4096) return reply({ error: "invalid_token" }, 401);

  const body = await req.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return reply({ error: "payload_too_large" }, 413);
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");

  let claims: Awaited<ReturnType<typeof verifyNexusEventTypesToken>>;
  try {
    claims = await verifyNexusEventTypesToken(token, key, bodySha256);
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
  const parsed = nexusEventTypeInputSchema.safeParse(json);
  if (!parsed.success) return reply({ error: "bad_request" }, 400);

  try {
    await consumeJti(claims.jti, claims.exp);
  } catch (e) {
    if (e instanceof NexusSsoJtiReusedError) return reply({ error: "invalid_token" }, 401);
    throw e;
  }

  let user: Awaited<ReturnType<typeof resolveNexusUser>>;
  try {
    user = await resolveNexusUser({ sub: claims.sub, email: claims.email, name: claims.name });
  } catch (e) {
    if (e instanceof NexusSsoEmailConflictError) return reply({ error: "agenda_email_conflict" }, 409);
    throw e;
  }

  const result = await upsertNexusEventType(user.id, parsed.data);
  const owner = await prisma.user.findUnique({ where: { id: user.id }, select: { username: true } });
  if (!owner?.username) {
    log.error("dono sem usuario publico", { userId: user.id });
    return reply({ error: "agenda_owner_without_username" }, 500);
  }
  return reply({ eventTypeId: result.eventTypeId, slug: result.slug, username: owner.username }, 200);
}

export async function POST(req: NextRequest, _ctx?: unknown) {
  try {
    return await handler(req);
  } catch (e) {
    // Nunca logar token nem corpo: so a mensagem do erro.
    log.error("falha ao gravar tipo de agendamento", { message: e instanceof Error ? e.message : "desconhecido" });
    return reply({ error: "agenda_event_types_error" }, 500);
  }
}
