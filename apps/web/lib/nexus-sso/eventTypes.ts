// Criado: 2026-10-08 BRT. Tipo de agendamento de um servico do catalogo do Nexus.
// O catalogo (preco, foto, categoria) e do Nexus; aqui ficam so o que a reserva precisa:
// titulo, duracao, descricao, visibilidade e ordem. Plano no repo do Nexus:
// docs/plans/2026-10-08-1645-agenda-servicos-v2-catalogo-nexus-horario-motor.md.
import { randomBytes } from "node:crypto";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { jwtVerify, type KeyLike } from "jose";
import { z } from "zod";
import { NEXUS_EVENT_TYPES_AUDIENCE, NEXUS_SSO_ISSUER, NEXUS_SSO_MAX_TOKEN_TTL_SECONDS } from "./config";
import { NexusSsoTokenError } from "./verifyToken";

export type NexusEventTypesClaims = { sub: string; email: string; name: string | null; jti: string; exp: number };

// O token prende o corpo pelo claim `bsh` (sha256 hex do corpo exato): token interceptado
// nao carrega outro corpo.
export async function verifyNexusEventTypesToken(
  token: string,
  key: KeyLike,
  bodySha256: string
): Promise<NexusEventTypesClaims> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["EdDSA"],
      issuer: NEXUS_SSO_ISSUER,
      audience: NEXUS_EVENT_TYPES_AUDIENCE,
    });
    const { sub, email, name, jti, iat, exp, bsh } = payload;
    if (typeof sub !== "string" || !sub) throw new NexusSsoTokenError("sub");
    if (typeof email !== "string" || !email.includes("@")) throw new NexusSsoTokenError("email");
    if (typeof jti !== "string" || !jti) throw new NexusSsoTokenError("jti");
    if (typeof iat !== "number" || typeof exp !== "number") throw new NexusSsoTokenError("times");
    if (exp - iat > NEXUS_SSO_MAX_TOKEN_TTL_SECONDS || exp <= iat) throw new NexusSsoTokenError("ttl");
    if (typeof bsh !== "string" || bsh !== bodySha256) throw new NexusSsoTokenError("bsh");
    return { sub, email, name: typeof name === "string" && name ? name : null, jti, exp };
  } catch (e) {
    if (e instanceof NexusSsoTokenError) throw e;
    throw new NexusSsoTokenError("invalid");
  }
}

export const nexusEventTypeInputSchema = z
  .object({
    nexusServiceId: z.string().uuid(),
    eventTypeId: z.number().int().positive().nullable(),
    title: z.string().trim().min(1).max(200),
    lengthMinutes: z.number().int().min(1).max(1440),
    description: z.string().max(2000).nullable(),
    hidden: z.boolean(),
    position: z.number().int().min(0).max(100000),
  })
  .strict();

export type NexusEventTypeInput = z.infer<typeof nexusEventTypeInputSchema>;

// A Agenda ordena por `position` decrescente; no Nexus a ordem 0 vem primeiro.
const POSITION_TOPO = 100000;

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * Cria ou atualiza, na conta do dono, o tipo de agendamento do servico. Casa primeiro pelo id
 * que o Nexus ja guardou e depois pelo `nexusServiceId` gravado no metadata, para que a
 * repeticao depois de uma resposta perdida nao crie um segundo tipo. O slug nao muda ao
 * renomear: o link publico de reserva continua valendo.
 */
export async function upsertNexusEventType(
  userId: number,
  input: NexusEventTypeInput
): Promise<{ eventTypeId: number; slug: string }> {
  const select = { id: true, slug: true } as const;
  let existing = input.eventTypeId
    ? await prisma.eventType.findFirst({ where: { id: input.eventTypeId, userId }, select })
    : null;
  if (!existing) {
    existing = await prisma.eventType.findFirst({
      where: { userId, metadata: { path: ["nexusServiceId"], equals: input.nexusServiceId } },
      select,
    });
  }
  const data = {
    title: input.title,
    length: input.lengthMinutes,
    description: input.description,
    hidden: input.hidden,
    position: POSITION_TOPO - input.position,
  };
  if (existing) {
    const updated = await prisma.eventType.update({ where: { id: existing.id }, data, select });
    return { eventTypeId: updated.id, slug: updated.slug };
  }
  const base = slugify(input.title) || "servico";
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    try {
      const created = await prisma.eventType.create({
        data: {
          ...data,
          slug,
          locations: [],
          metadata: { nexusServiceId: input.nexusServiceId },
          owner: { connect: { id: userId } },
          users: { connect: { id: userId } },
        },
        select,
      });
      return { eventTypeId: created.id, slug: created.slug };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new Error("nexus-event-types: slug indisponivel");
}
