import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import z from "zod";

import { appStoreMetadata } from "@calcom/app-store/appStoreMetaData";
import { CREDENTIAL_SYNC_SECRET, CREDENTIAL_SYNC_SECRET_HEADER_NAME } from "@calcom/lib/constants";
import { APP_CREDENTIAL_SHARING_ENABLED } from "@calcom/lib/constants";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import prisma from "@calcom/prisma";
import { NEXUS_SSO_PROVIDER } from "@lib/nexus-sso/config";

const appCredentialWebhookRequestBodySchema = z
  .object({
    // UserId of the cal.com user (caminho oficial do credential sync)
    userId: z.number().int().optional(),
    // `sub` do login unico do Nexus (users.id do Nexus), resolvido pela tabela Account
    nexusSub: z.string().min(1).optional(),
    appSlug: z.string(),
    // Keys should be AES256 encrypted with the CALCOM_APP_CREDENTIAL_ENCRYPTION_KEY
    keys: z.string(),
  })
  .refine((body) => (body.userId === undefined) !== (body.nexusSub === undefined), {
    message: "Envie userId ou nexusSub, nao os dois",
  });

const appCredentialDeleteRequestBodySchema = z.object({
  nexusSub: z.string().min(1),
  appSlug: z.string(),
});

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
      provider_providerAccountId: { provider: NEXUS_SSO_PROVIDER, providerAccountId: nexusSub },
    },
    select: { userId: true },
  });
  return link?.userId ?? null;
};

async function postHandler(request: NextRequest) {
  if (!APP_CREDENTIAL_SHARING_ENABLED) {
    return NextResponse.json({ message: "Credential sharing is not enabled" }, { status: 403 });
  }

  if (!secretIsValid(request)) {
    return NextResponse.json({ message: "Invalid credential sync secret" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const reqBodyParsed = appCredentialWebhookRequestBodySchema.safeParse(body);

    if (!reqBodyParsed.success) {
      return NextResponse.json({ error: reqBodyParsed.error.issues }, { status: 400 });
    }

    const reqBody = reqBodyParsed.data;

    const userId =
      reqBody.nexusSub !== undefined
        ? await findUserIdByNexusSub(reqBody.nexusSub)
        : (reqBody.userId ?? null);
    const user = userId === null ? null : await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const app = await prisma.app.findUnique({
      where: { slug: reqBody.appSlug },
      select: { dirName: true },
    });

    if (!app) {
      return NextResponse.json({ message: "App not found" }, { status: 404 });
    }

    const appMetadata = appStoreMetadata[app.dirName as keyof typeof appStoreMetadata];

    if (!appMetadata) {
      return NextResponse.json(
        { message: "App not found. Ensure that you have the correct app slug" },
        { status: 404 }
      );
    }

    const keys = JSON.parse(
      symmetricDecrypt(reqBody.keys, process.env.CALCOM_APP_CREDENTIAL_ENCRYPTION_KEY || "")
    );

    // INFO: Can't use prisma upsert as we don't know the id of the credential.
    // Atualiza no lugar (mesmo id) para nao perder os calendarios selecionados.
    const appCredential = await prisma.credential.findFirst({
      where: {
        userId: user.id,
        appId: appMetadata.slug,
      },
      select: {
        id: true,
      },
      orderBy: { id: "asc" },
    });

    if (appCredential) {
      await prisma.credential.update({
        where: {
          id: appCredential.id,
        },
        data: {
          key: keys,
        },
      });
      return NextResponse.json({
        message: `Credentials updated for userId: ${user.id}`,
        userId: user.id,
        credentialId: appCredential.id,
      });
    }
    const created = await prisma.credential.create({
      data: {
        key: keys,
        userId: user.id,
        appId: appMetadata.slug,
        type: appMetadata.type,
      },
      select: { id: true },
    });
    return NextResponse.json({
      message: `Credentials created for userId: ${user.id}`,
      userId: user.id,
      credentialId: created.id,
    });
  } catch (error) {
    console.error("Error processing app credential webhook:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

async function deleteHandler(request: NextRequest) {
  if (!APP_CREDENTIAL_SHARING_ENABLED) {
    return NextResponse.json({ message: "Credential sharing is not enabled" }, { status: 403 });
  }

  if (!secretIsValid(request)) {
    return NextResponse.json({ message: "Invalid credential sync secret" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = appCredentialDeleteRequestBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const userId = await findUserIdByNexusSub(parsed.data.nexusSub);
    if (userId === null) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // SelectedCalendar e DestinationCalendar apontam para a credencial com onDelete: Cascade.
    const result = await prisma.credential.deleteMany({
      where: { userId, appId: parsed.data.appSlug },
    });
    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("Error processing app credential delete webhook:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export const POST = defaultResponderForAppDir(postHandler);
export const DELETE = defaultResponderForAppDir(deleteHandler);
