// Criado: 2026-11-02 BRT. POST /api/nexus/team-event-types: o Nexus lista, cria, edita e apaga
// calendario de equipe. Servidor a servidor, com Bearer assinado e corpo preso ao token (bsh).
import { createHash } from "node:crypto";
import process from "node:process";
import logger from "@calcom/lib/logger";
import { NEXUS_TEAM_EVENT_TYPES_AUDIENCE } from "@lib/nexus-sso/config";
import { verifyNexusEventTypesToken } from "@lib/nexus-sso/eventTypes";
import {
  consumeJti,
  NexusSsoEmailConflictError,
  NexusSsoJtiReusedError,
  resolveNexusUser,
} from "@lib/nexus-sso/provision";
import {
  NexusTeamWebhookUnconfiguredError,
  nexusTeamEventTypeInputSchema,
  runNexusTeamEventTypeOp,
} from "@lib/nexus-sso/teamEventTypes";
import { importNexusPublicKey } from "@lib/nexus-sso/verifyToken";
import { type NextRequest, NextResponse } from "next/server";

const log = logger.getSubLogger({ prefix: ["nexus-team-event-types"] });
const MAX_BODY_BYTES = 32 * 1024;

const reply = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function handler(req: NextRequest) {
  const rawKey = process.env.NEXUS_AGENDA_SSO_PUBLIC_KEY;
  if (!rawKey) return reply({ error: "agenda_unavailable" }, 503);
  const key = await importNexusPublicKey(rawKey);

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 4096) return reply({ error: "invalid_token" }, 401);

  const body = await req.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return reply({ error: "payload_too_large" }, 413);
  const bodySha256 = createHash("sha256").update(body, "utf8").digest("hex");

  let claims: Awaited<ReturnType<typeof verifyNexusEventTypesToken>>;
  try {
    claims = await verifyNexusEventTypesToken(token, key, bodySha256, NEXUS_TEAM_EVENT_TYPES_AUDIENCE);
  } catch {
    return reply({ error: "invalid_token" }, 401);
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return reply({ error: "bad_request" }, 400);
  }
  const parsed = nexusTeamEventTypeInputSchema.safeParse(json);
  if (!parsed.success) return reply({ error: "bad_request" }, 400);

  try {
    await consumeJti(claims.jti, claims.exp);
  } catch (e) {
    if (e instanceof NexusSsoJtiReusedError) return reply({ error: "invalid_token" }, 401);
    throw e;
  }

  try {
    // Ler nao cria conta: so a escrita precisa do dono.
    const ownerId =
      parsed.data.op === "list"
        ? null
        : (await resolveNexusUser({ sub: claims.sub, email: claims.email, name: claims.name })).id;
    const calendars = await runNexusTeamEventTypeOp(ownerId, parsed.data);
    if (!calendars) return reply({ error: "not_found" }, 404);
    return reply({ calendars }, 200);
  } catch (e) {
    if (e instanceof NexusTeamWebhookUnconfiguredError) return reply({ error: "agenda_webhook_unconfigured" }, 503);
    if (e instanceof NexusSsoEmailConflictError) return reply({ error: "agenda_email_conflict" }, 409);
    throw e;
  }
}

export async function POST(req: NextRequest, _ctx?: unknown) {
  try {
    return await handler(req);
  } catch (e) {
    log.error("falha no calendario de equipe", { message: e instanceof Error ? e.message : "desconhecido" });
    return reply({ error: "agenda_team_event_types_error" }, 500);
  }
}
