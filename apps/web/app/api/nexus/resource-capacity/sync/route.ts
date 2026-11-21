import { createHash } from "node:crypto";
import process from "node:process";
import logger from "@calcom/lib/logger";
import {
  NexusResourceCapacitySyncError,
  nexusResourceCapacitySyncInputSchema,
  syncNexusResourceCapacity,
} from "@lib/nexus-sso/resourceCapacity";
import { NEXUS_RESOURCE_CAPACITY_AUDIENCE } from "@lib/nexus-sso/config";
import { verifyNexusEventTypesToken } from "@lib/nexus-sso/eventTypes";
import {
  consumeJti,
  NexusSsoEmailConflictError,
  NexusSsoJtiReusedError,
  resolveNexusUser,
} from "@lib/nexus-sso/provision";
import { importNexusPublicKey } from "@lib/nexus-sso/verifyToken";
import { type NextRequest, NextResponse } from "next/server";

const log = logger.getSubLogger({ prefix: ["nexus-resource-capacity"] });
// Cabem 500 recursos (inclusive nomes escapados em JSON) e 2.000 vínculos.
const MAX_BODY_BYTES = 2 * 1024 * 1024;

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
    claims = await verifyNexusEventTypesToken(
      token,
      key,
      bodySha256,
      NEXUS_RESOURCE_CAPACITY_AUDIENCE,
      true
    );
  } catch {
    return reply({ error: "invalid_token" }, 401);
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return reply({ error: "bad_request" }, 400);
  }
  const parsed = nexusResourceCapacitySyncInputSchema.safeParse(json);
  if (!parsed.success) return reply({ error: "bad_request" }, 400);

  try {
    await consumeJti(claims.jti, claims.exp);
  } catch (error) {
    if (error instanceof NexusSsoJtiReusedError) return reply({ error: "invalid_token" }, 401);
    throw error;
  }

  let user: Awaited<ReturnType<typeof resolveNexusUser>>;
  try {
    user = await resolveNexusUser({ sub: claims.sub, email: claims.email, name: claims.name });
  } catch (error) {
    if (error instanceof NexusSsoEmailConflictError) return reply({ error: "agenda_email_conflict" }, 409);
    throw error;
  }

  // `requireScope` garante os dois claims; a checagem explicita mantem o narrowing local e
  // impede que uma futura mudanca no verificador transforme ausencia em escopo compartilhado.
  if (!claims.tenantId || !claims.workspaceKey) return reply({ error: "invalid_token" }, 401);

  try {
    const result = await syncNexusResourceCapacity(
      { tenantId: claims.tenantId, workspaceKey: claims.workspaceKey, ownerUserId: user.id },
      parsed.data
    );
    return reply(result, 200);
  } catch (error) {
    if (error instanceof NexusResourceCapacitySyncError) {
      if (error.code === "binding_not_found") return reply({ error: "binding_not_found" }, 404);
      return reply({ error: error.code }, 409);
    }
    throw error;
  }
}

export async function PUT(req: NextRequest, _ctx?: unknown) {
  try {
    return await handler(req);
  } catch (error) {
    // Token, corpo, ids externos e nomes podem conter dados de cliente; nenhum deles entra no log.
    log.error("falha ao sincronizar capacidade", { message: error instanceof Error ? error.message : "desconhecido" });
    return reply({ error: "agenda_resource_capacity_error" }, 500);
  }
}
