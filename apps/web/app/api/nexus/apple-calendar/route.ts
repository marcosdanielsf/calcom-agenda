// Criado: 2026-10-15 BRT. Porta unica: a conta Apple (iCloud) do usuario e conectada pelo Nexus, nunca
// pela loja do motor (plano docs/plans/2026-10-15-0920-nexus-porta-unica-integracoes.md no Nexus).
//
// O Nexus manda o Apple ID e a senha de app uma vez. A validacao (listCalendars) e a credencial seguem o
// formato de packages/app-store/applecalendar/api/add.ts: texto cifrado com a chave do proprio motor,
// que nunca sai daqui. A senha nunca entra em log nem volta em resposta.
// Autoridade: o mesmo header do webhook app-credential. Usuario: Account do login unico do Nexus.

import { timingSafeEqual } from "node:crypto";
import process from "node:process";
import { BuildCalendarService } from "@calcom/app-store/applecalendar/lib";
import {
  APP_CREDENTIAL_SHARING_ENABLED,
  CREDENTIAL_SYNC_SECRET,
  CREDENTIAL_SYNC_SECRET_HEADER_NAME,
} from "@calcom/lib/constants";
import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import { NEXUS_SSO_PROVIDER } from "@lib/nexus-sso/config";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import z from "zod";

const APPLE_APP_ID = "apple-calendar";
const APPLE_TYPE = "apple_calendar";

const nexusSubSchema = z.string().min(1).max(200);
const connectBodySchema = z.object({
  nexusSub: nexusSubSchema,
  username: z.string().trim().min(3).max(320),
  password: z.string().min(1).max(128),
});
const disconnectBodySchema = z.object({
  nexusSub: nexusSubSchema,
  // Sem id desconecta todas as contas Apple do usuario; com id, so aquela.
  credentialId: z.number().int().positive().optional(),
});

// So recusa de login vira "a Apple nao aceitou": rede, DNS e 5xx do iCloud nao podem levar o cliente
// a revogar uma senha certa. O tsdav lanca "Invalid credentials" no 401 da descoberta da conta.
const APPLE_REFUSED = /invalid credentials|unauthori[sz]ed|forbidden|\b40[13]\b/i;
// Chave do lock de transacao que serializa a gravacao da conta Apple por usuario.
const APPLE_LOCK_NAMESPACE = 4127;

// Mesma checagem do webhook app-credential (comparacao em tempo constante).
const secretIsValid = (request: NextRequest): boolean => {
  const expected = CREDENTIAL_SYNC_SECRET;
  const received = request.headers.get(CREDENTIAL_SYNC_SECRET_HEADER_NAME);
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const findUserIdByNexusSub = async (nexusSub: string): Promise<number | null> => {
  const link = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: NEXUS_SSO_PROVIDER,
        providerAccountId: nexusSub,
      },
    },
    select: { userId: true },
  });
  return link?.userId ?? null;
};

const encryptionKey = () => process.env.CALENDSO_ENCRYPTION_KEY || "";

const usernameOf = (key: unknown): string | null => {
  try {
    const parsed = JSON.parse(symmetricDecrypt(String(key ?? ""), encryptionKey()));
    return typeof parsed?.username === "string" ? parsed.username : null;
  } catch {
    return null;
  }
};

const appleCredentialsOf = (db: { credential: typeof prisma.credential }, userId: number) =>
  db.credential.findMany({
    where: { userId, type: APPLE_TYPE },
    select: { id: true, key: true, invalid: true },
    orderBy: { id: "asc" },
  });

// Recusa comum as tres rotas: sync desligado (403) ou segredo errado (401), antes de ler o banco.
const refuse = (request: NextRequest): NextResponse | null => {
  if (!APP_CREDENTIAL_SHARING_ENABLED) {
    return NextResponse.json({ code: "credential_sync_disabled" }, { status: 403 });
  }
  if (!secretIsValid(request)) {
    return NextResponse.json({ code: "invalid_secret" }, { status: 401 });
  }
  return null;
};

async function getHandler(request: NextRequest) {
  const refused = refuse(request);
  if (refused) return refused;
  const parsed = nexusSubSchema.safeParse(request.nextUrl.searchParams.get("nexusSub") ?? "");
  if (!parsed.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });

  const userId = await findUserIdByNexusSub(parsed.data);
  if (userId === null) return NextResponse.json({ code: "user_not_found" }, { status: 404 });

  const credentials = await appleCredentialsOf(prisma, userId);
  return NextResponse.json({
    connected: credentials.length > 0,
    accounts: credentials.map((credential) => ({
      credentialId: credential.id,
      username: usernameOf(credential.key),
      invalid: Boolean(credential.invalid),
    })),
  });
}

async function postHandler(request: NextRequest) {
  const refused = refuse(request);
  if (refused) return refused;
  const parsed = connectBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  const { nexusSub, username, password } = parsed.data;

  const userId = await findUserIdByNexusSub(nexusSub);
  const user =
    userId === null
      ? null
      : await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true },
        });
  if (!user) return NextResponse.json({ code: "user_not_found" }, { status: 404 });

  const data = {
    type: APPLE_TYPE,
    key: symmetricEncrypt(JSON.stringify({ username, password }), encryptionKey()),
    userId: user.id,
    teamId: null,
    appId: APPLE_APP_ID,
    invalid: false,
  };

  try {
    const dav = BuildCalendarService({
      id: 0,
      ...data,
      user: { email: user.email },
      delegationCredentialId: null,
      encryptedKey: null,
    });
    await dav?.listCalendars();
  } catch (reason) {
    const refused = reason instanceof Error && APPLE_REFUSED.test(reason.message);
    // So a classificacao e o tipo do erro: a mensagem do cliente CalDAV pode trazer a URL com o Apple ID.
    logger.error("Conta Apple vinda do Nexus nao validou", {
      event: refused ? "nexus.apple_calendar.rejected" : "nexus.apple_calendar.unreachable",
      reason: reason instanceof Error ? reason.name : typeof reason,
    });
    return refused
      ? NextResponse.json({ code: "apple_rejected" }, { status: 422 })
      : NextResponse.json({ code: "apple_unavailable" }, { status: 502 });
  }

  // Mesmo Apple ID (sem diferenca de caixa) atualiza no lugar e mantem os calendarios selecionados,
  // como o app oficial. O lock por usuario impede que dois pedidos juntos criem duas linhas.
  const sameAppleId = (key: unknown) => usernameOf(key)?.toLowerCase() === username.toLowerCase();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${APPLE_LOCK_NAMESPACE}::int, ${user.id}::int)`;
    const existing = (await appleCredentialsOf(tx, user.id)).find((credential) =>
      sameAppleId(credential.key)
    );
    if (existing) {
      await tx.credential.update({ where: { id: existing.id }, data });
      return { credentialId: existing.id, created: false };
    }
    const created = await tx.credential.create({ data, select: { id: true } });
    return { credentialId: created.id, created: true };
  });
  return NextResponse.json(result);
}

async function deleteHandler(request: NextRequest) {
  const refused = refuse(request);
  if (refused) return refused;
  const parsed = disconnectBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });

  const userId = await findUserIdByNexusSub(parsed.data.nexusSub);
  if (userId === null) return NextResponse.json({ code: "user_not_found" }, { status: 404 });

  // SelectedCalendar e DestinationCalendar apontam para a credencial com onDelete: Cascade.
  const { credentialId } = parsed.data;
  const result = await prisma.credential.deleteMany({
    where: { userId, appId: APPLE_APP_ID, ...(credentialId ? { id: credentialId } : {}) },
  });
  return NextResponse.json({ deleted: result.count });
}

export const GET = defaultResponderForAppDir(getHandler);
export const POST = defaultResponderForAppDir(postHandler);
export const DELETE = defaultResponderForAppDir(deleteHandler);
