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
const disconnectBodySchema = z.object({ nexusSub: nexusSubSchema });

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

const appleCredentialsOf = (userId: number) =>
  prisma.credential.findMany({
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

  const credentials = await appleCredentialsOf(userId);
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
    // So o tipo do erro: a mensagem do cliente CalDAV pode trazer a URL com o Apple ID.
    logger.error("Apple recusou a conta vinda do Nexus", {
      event: "nexus.apple_calendar.rejected",
      reason: reason instanceof Error ? reason.name : typeof reason,
    });
    return NextResponse.json({ code: "apple_rejected" }, { status: 422 });
  }

  // Mesmo Apple ID atualiza no lugar (mantem os calendarios selecionados), como o app oficial.
  const existing = (await appleCredentialsOf(user.id)).find(
    (credential) => usernameOf(credential.key) === username
  );
  if (existing) {
    await prisma.credential.update({ where: { id: existing.id }, data });
    return NextResponse.json({ credentialId: existing.id, created: false });
  }
  const created = await prisma.credential.create({
    data,
    select: { id: true },
  });
  return NextResponse.json({ credentialId: created.id, created: true });
}

async function deleteHandler(request: NextRequest) {
  const refused = refuse(request);
  if (refused) return refused;
  const parsed = disconnectBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });

  const userId = await findUserIdByNexusSub(parsed.data.nexusSub);
  if (userId === null) return NextResponse.json({ code: "user_not_found" }, { status: 404 });

  // SelectedCalendar e DestinationCalendar apontam para a credencial com onDelete: Cascade.
  const result = await prisma.credential.deleteMany({
    where: { userId, appId: APPLE_APP_ID },
  });
  return NextResponse.json({ deleted: result.count });
}

export const GET = defaultResponderForAppDir(getHandler);
export const POST = defaultResponderForAppDir(postHandler);
export const DELETE = defaultResponderForAppDir(deleteHandler);
