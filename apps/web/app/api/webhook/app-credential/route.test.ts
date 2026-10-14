// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  account: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  app: { findUnique: vi.fn() },
  credential: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
}));

vi.mock("@calcom/prisma", () => ({ default: db }));
vi.mock("@calcom/lib/constants", () => ({
  CREDENTIAL_SYNC_SECRET: "segredo-certo",
  CREDENTIAL_SYNC_SECRET_HEADER_NAME: "calcom-credential-sync-secret",
  APP_CREDENTIAL_SHARING_ENABLED: true,
}));
vi.mock("@calcom/lib/crypto", () => ({
  symmetricDecrypt: () => JSON.stringify({ access_token: "tok", expiry_date: 1 }),
}));
vi.mock("@calcom/app-store/appStoreMetaData", () => ({
  appStoreMetadata: { googlecalendar: { slug: "google-calendar", type: "google_calendar" } },
}));
vi.mock("@lib/nexus-sso/config", () => ({ NEXUS_SSO_PROVIDER: "nexus" }));

import { DELETE, POST } from "./route";

const ctx = { params: Promise.resolve({}) };
const call = (handler: typeof POST, method: string, body: unknown, secret = "segredo-certo") =>
  handler(
    new NextRequest("https://agenda.socialfy.me/api/webhook/app-credential", {
      method,
      headers: { "content-type": "application/json", "calcom-credential-sync-secret": secret },
      body: JSON.stringify(body),
    }),
    ctx
  );

const corpo = { nexusSub: "nexus-user-1", appSlug: "google-calendar", keys: "cifra" };

beforeEach(() => {
  vi.clearAllMocks();
  db.account.findUnique.mockResolvedValue({ userId: 7 });
  db.user.findUnique.mockResolvedValue({ id: 7 });
  db.app.findUnique.mockResolvedValue({ dirName: "googlecalendar" });
  db.credential.findFirst.mockResolvedValue(null);
  db.credential.create.mockResolvedValue({ id: 11 });
  db.credential.update.mockResolvedValue({ id: 2 });
  db.credential.deleteMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/webhook/app-credential com nexusSub", () => {
  it("cria a credencial e devolve userId e credentialId", async () => {
    const res = await call(POST, "POST", corpo);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ userId: 7, credentialId: 11 });
    expect(db.account.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_providerAccountId: { provider: "nexus", providerAccountId: "nexus-user-1" } },
      })
    );
    expect(db.credential.create).toHaveBeenCalledTimes(1);
  });

  it("atualiza a credencial existente no mesmo id, sem duplicar", async () => {
    db.credential.findFirst.mockResolvedValue({ id: 2 });
    const res = await call(POST, "POST", corpo);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ userId: 7, credentialId: 2 });
    expect(db.credential.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 } }));
    expect(db.credential.create).not.toHaveBeenCalled();
  });

  it("404 quando nao ha Account nexus", async () => {
    db.account.findUnique.mockResolvedValue(null);
    const res = await call(POST, "POST", corpo);
    expect(res.status).toBe(404);
    expect(db.credential.create).not.toHaveBeenCalled();
  });

  it("401 com segredo errado", async () => {
    const res = await call(POST, "POST", corpo, "errado");
    expect(res.status).toBe(401);
    expect(db.account.findUnique).not.toHaveBeenCalled();
  });

  it("400 quando vem userId e nexusSub juntos", async () => {
    const res = await call(POST, "POST", { ...corpo, userId: 7 });
    expect(res.status).toBe(400);
  });

  it("o caminho antigo com userId continua funcionando", async () => {
    const { nexusSub: _omit, ...semSub } = corpo;
    const res = await call(POST, "POST", { ...semSub, userId: 7 });
    expect(res.status).toBe(200);
    expect(db.account.findUnique).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/webhook/app-credential", () => {
  const delBody = { nexusSub: "nexus-user-1", appSlug: "google-calendar" };

  it("401 com segredo errado", async () => {
    const res = await call(DELETE, "DELETE", delBody, "errado");
    expect(res.status).toBe(401);
    expect(db.credential.deleteMany).not.toHaveBeenCalled();
  });

  it("apaga as credenciais do app e devolve a contagem", async () => {
    db.credential.deleteMany.mockResolvedValue({ count: 2 });
    const res = await call(DELETE, "DELETE", delBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });
    expect(db.credential.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, appId: "google-calendar" },
    });
  });

  it("404 sem Account nexus", async () => {
    db.account.findUnique.mockResolvedValue(null);
    const res = await call(DELETE, "DELETE", delBody);
    expect(res.status).toBe(404);
  });
});
