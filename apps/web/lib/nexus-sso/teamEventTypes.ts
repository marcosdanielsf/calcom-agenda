// Criado: 2026-11-02 BRT. Calendario de equipe que o Nexus administra: rodizio (o motor escolhe
// um atendente livre) e coletivo (todos os atendentes juntos). A escolha do atendente ja existe
// no motor; esta versao MIT so nao tinha como criar a equipe, entao a equipe e criada por aqui.
// Cada conta do Nexus tem uma equipe, marcada em metadata.nexusTenantId.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import { z } from "zod";
import { resolveNexusUser } from "./provision";

const host = z
  .object({
    sub: z.string().min(1).max(100),
    email: z.string().email().max(320),
    name: z.string().max(200).nullable(),
    priority: z.number().int().min(0).max(4),
  })
  .strict();

const calendar = z
  .object({
    eventTypeId: z.number().int().positive().nullable(),
    title: z.string().trim().min(1).max(200),
    lengthMinutes: z.number().int().min(1).max(1440),
    description: z.string().max(2000).nullable(),
    kind: z.enum(["round_robin", "collective"]),
    distribution: z.enum(["availability", "equal"]),
    hidden: z.boolean(),
    hosts: z.array(host).min(1).max(50),
  })
  .strict();

export const nexusTeamEventTypeInputSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("list"), tenantId: z.string().uuid() }).strict(),
  z
    .object({ op: z.literal("upsert"), tenantId: z.string().uuid(), teamName: z.string().min(1).max(200), calendar })
    .strict(),
  z.object({ op: z.literal("remove"), tenantId: z.string().uuid(), eventTypeId: z.number().int().positive() }).strict(),
]);

export type NexusTeamEventTypeInput = z.infer<typeof nexusTeamEventTypeInputSchema>;
type CalendarInput = z.infer<typeof calendar>;

export type NexusTeamCalendar = {
  eventTypeId: number;
  title: string;
  slug: string;
  teamSlug: string;
  lengthMinutes: number;
  description: string | null;
  kind: "round_robin" | "collective";
  distribution: "availability" | "equal";
  hidden: boolean;
  hosts: { email: string; name: string | null; priority: number }[];
};

/** Slug publico estavel, sem expor o id da conta. */
export function teamSlugForTenant(tenantId: string): string {
  return `equipe-${createHash("sha256").update(tenantId).digest("hex").slice(0, 12)}`;
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

async function findTenantTeam(tenantId: string) {
  return prisma.team.findFirst({
    where: { slug: teamSlugForTenant(tenantId), metadata: { path: ["nexusTenantId"], equals: tenantId } },
    select: { id: true, slug: true },
  });
}

async function ensureTenantTeam(tenantId: string, teamName: string, ownerUserId: number) {
  const found = await findTenantTeam(tenantId);
  if (found) return found;
  try {
    const created = await prisma.team.create({
      data: {
        name: teamName,
        slug: teamSlugForTenant(tenantId),
        hideBranding: true,
        metadata: { nexusTenantId: tenantId },
        members: { create: { userId: ownerUserId, role: MembershipRole.OWNER, accepted: true } },
      },
      select: { id: true, slug: true },
    });
    // Reserva de equipe so avisa webhook da equipe: sem esta copia o Nexus nunca ficaria sabendo.
    const hooks = await prisma.webhook.findMany({
      where: { userId: ownerUserId, active: true, eventTypeId: null },
      select: { subscriberUrl: true, payloadTemplate: true, eventTriggers: true, secret: true },
    });
    for (const hook of hooks) {
      await prisma.webhook.create({ data: { ...hook, id: randomUUID(), teamId: created.id } });
    }
    return created;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const raced = await findTenantTeam(tenantId);
    if (raced) return raced;
    throw e;
  }
}

const eventTypeSelect = {
  id: true,
  title: true,
  slug: true,
  length: true,
  description: true,
  hidden: true,
  schedulingType: true,
  isRRWeightsEnabled: true,
  hosts: { select: { priority: true, user: { select: { email: true, name: true } } } },
} as const;

async function listCalendars(tenantId: string): Promise<NexusTeamCalendar[]> {
  const team = await findTenantTeam(tenantId);
  if (!team?.slug) return [];
  const rows = await prisma.eventType.findMany({
    where: { teamId: team.id },
    orderBy: { id: "asc" },
    select: eventTypeSelect,
  });
  const teamSlug = team.slug;
  return rows.map((row) => ({
    eventTypeId: row.id,
    title: row.title,
    slug: row.slug,
    teamSlug,
    lengthMinutes: row.length,
    description: row.description,
    kind: row.schedulingType === SchedulingType.COLLECTIVE ? "collective" : "round_robin",
    distribution: row.isRRWeightsEnabled ? "equal" : "availability",
    hidden: row.hidden,
    hosts: row.hosts.map((h) => ({ email: h.user.email, name: h.user.name, priority: h.priority ?? 2 })),
  }));
}

async function hostRows(teamId: number, input: CalendarInput) {
  const rows = [];
  for (const person of input.hosts) {
    const user = await resolveNexusUser({ sub: person.sub, email: person.email, name: person.name });
    const member = await prisma.membership.upsert({
      where: { userId_teamId: { userId: user.id, teamId } },
      create: { userId: user.id, teamId, role: MembershipRole.MEMBER, accepted: true },
      update: { accepted: true },
      select: { id: true },
    });
    rows.push({
      userId: user.id,
      memberId: member.id,
      isFixed: input.kind === "collective",
      priority: person.priority,
      weight: 100,
    });
  }
  return rows;
}

async function upsertCalendar(tenantId: string, teamName: string, ownerUserId: number, input: CalendarInput) {
  const team = await ensureTenantTeam(tenantId, teamName, ownerUserId);
  const hosts = await hostRows(team.id, input);
  const data = {
    title: input.title,
    length: input.lengthMinutes,
    description: input.description,
    hidden: input.hidden,
    schedulingType: input.kind === "collective" ? SchedulingType.COLLECTIVE : SchedulingType.ROUND_ROBIN,
    isRRWeightsEnabled: input.kind === "round_robin" && input.distribution === "equal",
  };
  if (input.eventTypeId) {
    // O teamId no filtro impede uma conta de editar calendario de outra.
    const owned = await prisma.eventType.findFirst({
      where: { id: input.eventTypeId, teamId: team.id },
      select: { id: true },
    });
    if (!owned) return null;
    return prisma.eventType.update({
      where: { id: owned.id },
      data: { ...data, hosts: { deleteMany: {}, create: hosts } },
      select: { id: true },
    });
  }
  const base = slugify(input.title) || "calendario";
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    try {
      return await prisma.eventType.create({
        data: { ...data, slug, locations: [], team: { connect: { id: team.id } }, hosts: { create: hosts } },
        select: { id: true },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new Error("nexus-team-event-types: slug indisponivel");
}

async function removeCalendar(tenantId: string, eventTypeId: number): Promise<boolean> {
  const team = await findTenantTeam(tenantId);
  if (!team) return false;
  const { count } = await prisma.eventType.deleteMany({ where: { id: eventTypeId, teamId: team.id } });
  return count > 0;
}

/** Devolve a lista atualizada, ou null quando o calendario nao e desta conta. */
export async function runNexusTeamEventTypeOp(
  ownerUserId: number,
  input: NexusTeamEventTypeInput
): Promise<NexusTeamCalendar[] | null> {
  if (input.op === "upsert") {
    const saved = await upsertCalendar(input.tenantId, input.teamName, ownerUserId, input.calendar);
    if (!saved) return null;
  } else if (input.op === "remove") {
    if (!(await removeCalendar(input.tenantId, input.eventTypeId))) return null;
  }
  return listCalendars(input.tenantId);
}

