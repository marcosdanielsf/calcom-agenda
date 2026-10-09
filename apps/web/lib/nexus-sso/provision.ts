import { randomBytes } from "node:crypto";
import { getUserRepository } from "@calcom/features/di/containers/UserRepository";
import logger from "@calcom/lib/logger";
import { isUsernameReservedDueToMigration } from "@calcom/lib/server/username";
import slugify from "@calcom/lib/slugify";
import prisma from "@calcom/prisma";
import { CreationSource, UserPermissionRole } from "@calcom/prisma/enums";
import { NEXUS_SSO_JTI_IDENTIFIER, NEXUS_SSO_PROVIDER } from "./config";

const log = logger.getSubLogger({ prefix: ["nexus-sso"] });

export class NexusSsoJtiReusedError extends Error {}
export class NexusSsoEmailConflictError extends Error {}

export type NexusSsoUser = { id: number; email: string; name: string | null };

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

export async function consumeJti(jti: string, expSeconds: number): Promise<void> {
  try {
    await prisma.verificationToken.create({
      data: {
        identifier: NEXUS_SSO_JTI_IDENTIFIER,
        token: jti,
        expires: new Date(expSeconds * 1000),
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new NexusSsoJtiReusedError();
    throw e;
  }
}

const findLinkedUser = async (sub: string): Promise<NexusSsoUser | null> => {
  const link = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: { provider: NEXUS_SSO_PROVIDER, providerAccountId: sub },
    },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  return link?.user ?? null;
};

const emailTaken = async (email: string): Promise<boolean> =>
  !!(await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  }));

// O endereco publico (/<username>) sai do nome da pessoa; sem nome, cai na parte do email antes do arroba.
async function pickUsername(name: string | null, email: string, attempt: number): Promise<string> {
  const base = slugify(name ?? "") || slugify(email.split("@")[0] ?? "") || "usuario";
  for (let i = attempt; i < attempt + 5; i++) {
    const candidate = i === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    const taken =
      (await isUsernameReservedDueToMigration(candidate)) ||
      !!(await prisma.user.findFirst({ where: { username: candidate }, select: { id: true } }));
    if (!taken) return candidate;
  }
  return `${base}-${randomBytes(6).toString("hex")}`;
}

export const DEFAULT_EVENT_TYPE = { title: "Reunião de 30 min", slug: "reuniao-30min", length: 30 } as const;
export const BOOKINGS_V3_FEATURE = "bookings-v3";

// Conta nova ja nasce com um tipo de agendamento para compartilhar e com a lista de reservas nova.
// Falha aqui nao derruba o login: a conta existe e a pessoa cria o tipo pela tela.
async function seedNewUser(userId: number): Promise<void> {
  try {
    await prisma.eventType.create({
      data: {
        title: DEFAULT_EVENT_TYPE.title,
        slug: DEFAULT_EVENT_TYPE.slug,
        length: DEFAULT_EVENT_TYPE.length,
        hidden: false,
        locations: [],
        owner: { connect: { id: userId } },
        users: { connect: { id: userId } },
      },
      select: { id: true },
    });
  } catch (e) {
    log.error("nao criou o tipo de agendamento padrao", { userId, error: String(e) });
  }
  try {
    await prisma.userFeatures.upsert({
      where: { userId_featureId: { userId, featureId: BOOKINGS_V3_FEATURE } },
      create: { userId, featureId: BOOKINGS_V3_FEATURE, enabled: true, assignedBy: NEXUS_SSO_PROVIDER },
      update: {},
    });
  } catch (e) {
    log.error("nao ligou a flag de reservas v3", { userId, error: String(e) });
  }
}

export async function resolveNexusUser(input: {
  sub: string;
  email: string;
  name: string | null;
}): Promise<NexusSsoUser> {
  const linked = await findLinkedUser(input.sub);
  if (linked) {
    if (linked.email.toLowerCase() !== input.email.toLowerCase()) {
      log.warn("email do token diverge do email gravado, sem sincronizar", { userId: linked.id });
    }
    return linked;
  }

  const email = input.email.toLowerCase();
  if (await emailTaken(email)) throw new NexusSsoEmailConflictError();

  const userRepository = getUserRepository();
  for (let attempt = 0; attempt < 3; attempt++) {
    const username = await pickUsername(input.name, email, attempt);
    try {
      // Criacao aninhada: usuario, horario padrao e Account entram na mesma escrita atomica.
      const created = await userRepository.create({
        username,
        email,
        name: input.name ?? email.split("@")[0],
        organizationId: null,
        creationSource: CreationSource.WEBAPP,
        locked: false,
        role: UserPermissionRole.USER,
        emailVerified: new Date(),
        completedOnboarding: true,
        timeZone: "America/Sao_Paulo",
        locale: "pt-BR",
        accounts: {
          create: { type: "oauth", provider: NEXUS_SSO_PROVIDER, providerAccountId: input.sub },
        },
      });
      await seedNewUser(created.id);
      return { id: created.id, email: created.email, name: created.name };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const raced = await findLinkedUser(input.sub);
      if (raced) return raced;
      if (await emailTaken(email)) throw new NexusSsoEmailConflictError();
      // colisao de username: tenta outro
    }
  }
  throw new Error("nexus-sso: nao foi possivel provisionar usuario");
}
