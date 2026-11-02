// Criado: 2026-11-02 BRT. Calendario de equipe que o Nexus administra: rodizio (o motor escolhe
// um atendente livre) e coletivo (todos os atendentes juntos). A escolha do atendente ja existe
// no motor; esta versao MIT so nao tinha como criar a equipe, entao a equipe e criada por aqui.
// Uma equipe por subconta. O slug e um hash, nada do Nexus fica legivel na pagina publica.
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { MembershipRole, SchedulingType, WebhookTriggerEvents } from "@calcom/prisma/enums";
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
    requestKey: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    lengthMinutes: z.number().int().min(1).max(1440),
    description: z.string().max(2000).nullable(),
    kind: z.enum(["round_robin", "collective"]),
    distribution: z.enum(["availability", "equal"]),
    hidden: z.boolean(),
    hosts: z.array(host).min(1).max(50),
  })
  .strict();

const scope = { tenantId: z.string().uuid(), workspaceKey: z.string().min(1).max(100) };

export const nexusTeamEventTypeInputSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("list"), ...scope }).strict(),
  z.object({ op: z.literal("upsert"), ...scope, teamName: z.string().trim().min(1).max(200), calendar }).strict(),
  z.object({ op: z.literal("remove"), ...scope, eventTypeId: z.number().int().positive() }).strict(),
]);

export type NexusTeamEventTypeInput = z.infer<typeof nexusTeamEventTypeInputSchema>;
type CalendarInput = z.infer<typeof calendar>;
type Scope = { tenantId: string; workspaceKey: string };

export type NexusTeamCalendar = {
  eventTypeId: number;
  title: string;
  slug: string;
  teamSlug: string;
  teamName: string;
  lengthMinutes: number;
  description: string | null;
  kind: "round_robin" | "collective";
  distribution: "availability" | "equal";
  hidden: boolean;
  hosts: { sub: string | null; email: string; name: string | null; priority: number }[];
};

export class NexusTeamWebhookUnconfiguredError extends Error {}

const WEBHOOK_TRIGGERS = [
  WebhookTriggerEvents.BOOKING_CREATED,
  WebhookTriggerEvents.BOOKING_REQUESTED,
  WebhookTriggerEvents.BOOKING_RESCHEDULED,
  WebhookTriggerEvents.BOOKING_CANCELLED,
  WebhookTriggerEvents.BOOKING_PAYMENT_INITIATED,
];

export function teamSlugFor({ tenantId, workspaceKey }: Scope): string {
  return `equipe-${createHash("sha256").update(`${tenantId}:${workspaceKey}`).digest("hex").slice(0, 16)}`;
}

/** Reserva de equipe so avisa webhook ligado ao tipo. O endereco diz ao Nexus de qual conta ela e. */
export function webhookFor(s: Scope): { subscriberUrl: string; secret: string } {
  const url = process.env.NEXUS_AGENDA_MOTOR_WEBHOOK_URL?.trim();
  const secret = process.env.NEXUS_AGENDA_TEAM_WEBHOOK_SECRET?.trim();
  if (!url || !secret) throw new NexusTeamWebhookUnconfiguredError();
  const target = new URL(url);
  target.searchParams.set("tenant", s.tenantId);
  target.searchParams.set("workspace", s.workspaceKey);
  // Segredo proprio da subconta: quem le a linha do webhook nao assina evento de outra conta.
  const derived = createHmac("sha256", secret).update(`agenda-webhook:${s.tenantId}:${s.workspaceKey}`).digest("hex");
  return { subscriberUrl: target.toString(), secret: derived };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

async function findTeam(s: Scope) {
  return prisma.team.findFirst({
    where: { slug: teamSlugFor(s), parentId: null },
    select: { id: true, slug: true, name: true },
  });
}

async function ensureTeam(s: Scope, name: string, ownerUserId: number) {
  const found = await findTeam(s);
  if (found) {
    if (found.name !== name) await prisma.team.update({ where: { id: found.id }, data: { name } });
    await prisma.membership.upsert({
      where: { userId_teamId: { userId: ownerUserId, teamId: found.id } },
      create: { userId: ownerUserId, teamId: found.id, role: MembershipRole.ADMIN, accepted: true },
      update: { accepted: true },
    });
    return found;
  }
  try {
    return await prisma.team.create({
      data: {
        name,
        slug: teamSlugFor(s),
        hideBranding: true,
        hideTeamProfileLink: true,
        members: { create: { userId: ownerUserId, role: MembershipRole.OWNER, accepted: true } },
      },
      select: { id: true, slug: true, name: true },
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const raced = await findTeam(s);
    if (raced) return raced;
    throw e;
  }
}

async function listCalendars(s: Scope): Promise<NexusTeamCalendar[]> {
  const team = await findTeam(s);
  if (!team?.slug) return [];
  const teamSlug = team.slug;
  const rows = await prisma.eventType.findMany({
    where: { teamId: team.id },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      length: true,
      description: true,
      hidden: true,
      schedulingType: true,
      isRRWeightsEnabled: true,
      hosts: {
        select: {
          priority: true,
          user: {
            select: {
              email: true,
              name: true,
              accounts: { where: { provider: "nexus" }, select: { providerAccountId: true } },
            },
          },
        },
      },
    },
  });
  return rows.map((row) => ({
    eventTypeId: row.id,
    title: row.title,
    slug: row.slug,
    teamSlug,
    teamName: team.name,
    lengthMinutes: row.length,
    description: row.description,
    kind: row.schedulingType === SchedulingType.COLLECTIVE ? "collective" : "round_robin",
    distribution: row.isRRWeightsEnabled ? "equal" : "availability",
    hidden: row.hidden,
    hosts: row.hosts.map((h) => ({
      sub: h.user.accounts[0]?.providerAccountId ?? null,
      email: h.user.email,
      name: h.user.name,
      priority: h.priority ?? 2,
    })),
  }));
}

async function resolveHosts(teamId: number, input: CalendarInput) {
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

/** Quem nao atende mais nenhum calendario da equipe perde o acesso a ela. */
async function pruneMembers(teamId: number) {
  // Pelo userId: host criado pela tela do motor nao tem memberId.
  const hosts = await prisma.host.findMany({
    where: { eventType: { teamId } },
    select: { userId: true },
    distinct: ["userId"],
  });
  await prisma.membership.deleteMany({
    where: { teamId, role: MembershipRole.MEMBER, userId: { notIn: hosts.map((h) => h.userId) } },
  });
}

async function updateCalendar(eventTypeId: number, hosts: Awaited<ReturnType<typeof resolveHosts>>, data: object) {
  // Quem continua atendendo fica com a linha: o rodizio usa a data de entrada para dividir igual.
  const keep = hosts.map((h) => h.userId);
  await prisma.$transaction([
    prisma.host.deleteMany({ where: { eventTypeId, userId: { notIn: keep } } }),
    ...hosts.map(({ userId, ...rest }) =>
      prisma.host.upsert({
        where: { userId_eventTypeId: { userId, eventTypeId } },
        create: { ...rest, userId, eventTypeId },
        update: { isFixed: rest.isFixed, priority: rest.priority, memberId: rest.memberId },
      })
    ),
    prisma.eventType.update({ where: { id: eventTypeId }, data }),
  ]);
}

async function upsertCalendar(s: Scope, teamName: string, ownerUserId: number, input: CalendarInput) {
  const webhook = webhookFor(s);
  const existingTeam = input.eventTypeId ? await findTeam(s) : null;
  if (input.eventTypeId) {
    const owned =
      existingTeam &&
      (await prisma.eventType.findFirst({
        where: { id: input.eventTypeId, teamId: existingTeam.id },
        select: { id: true },
      }));
    if (!owned) return null;
  }
  const team = await ensureTeam(s, teamName, ownerUserId);
  const data = {
    title: input.title,
    length: input.lengthMinutes,
    description: input.description,
    hidden: input.hidden,
    schedulingType: input.kind === "collective" ? SchedulingType.COLLECTIVE : SchedulingType.ROUND_ROBIN,
    isRRWeightsEnabled: input.kind === "round_robin" && input.distribution === "equal",
  };
  const hosts = await resolveHosts(team.id, input);
  if (input.eventTypeId) {
    await updateCalendar(input.eventTypeId, hosts, data);
    await pruneMembers(team.id);
    return { id: input.eventTypeId };
  }
  // A repeticao de um pedido cuja resposta se perdeu cai no calendario que ele ja criou.
  const findRepeated = () =>
    prisma.eventType.findFirst({
      where: { teamId: team.id, metadata: { path: ["nexusRequestKey"], equals: input.requestKey } },
      select: { id: true },
    });
  const repeated = await findRepeated();
  if (repeated) {
    await updateCalendar(repeated.id, hosts, data);
    return repeated;
  }
  const base = slugify(input.title) || "calendario";
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    try {
      return await prisma.eventType.create({
        data: {
          ...data,
          slug,
          locations: [],
          metadata: { nexusRequestKey: input.requestKey },
          team: { connect: { id: team.id } },
          hosts: { create: hosts },
          webhooks: {
            create: { ...webhook, id: randomUUID(), active: true, eventTriggers: WEBHOOK_TRIGGERS },
          },
        },
        select: { id: true },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // Dois pedidos iguais ao mesmo tempo: o outro ja criou.
      const raced = await findRepeated();
      if (raced) return raced;
    }
  }
  throw new Error("nexus-team-event-types: slug indisponivel");
}

async function removeCalendar(s: Scope, eventTypeId: number): Promise<boolean> {
  const team = await findTeam(s);
  if (!team) return false;
  const { count } = await prisma.eventType.deleteMany({ where: { id: eventTypeId, teamId: team.id } });
  if (count > 0) await pruneMembers(team.id);
  return count > 0;
}

/** Devolve a lista atualizada, ou null quando o calendario nao e desta subconta. */
export async function runNexusTeamEventTypeOp(
  ownerUserId: number | null,
  input: NexusTeamEventTypeInput
): Promise<NexusTeamCalendar[] | null> {
  const s = { tenantId: input.tenantId, workspaceKey: input.workspaceKey };
  if (input.op === "upsert") {
    if (ownerUserId === null) return null;
    if (!(await upsertCalendar(s, input.teamName, ownerUserId, input.calendar))) return null;
  } else if (input.op === "remove") {
    if (!(await removeCalendar(s, input.eventTypeId))) return null;
  }
  return listCalendars(s);
}
