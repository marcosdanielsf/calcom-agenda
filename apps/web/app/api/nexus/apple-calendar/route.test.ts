// @vitest-environment node
// Criado: 2026-10-15 BRT. Porta unica: conta Apple (iCloud) conectada pelo Nexus.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  account: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  credential: {
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const dav = vi.hoisted(() => ({ listCalendars: vi.fn(), build: vi.fn() }));
const log = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }));
const flags = vi.hoisted(() => ({ sharing: true }));

vi.mock("@calcom/prisma", () => ({ default: db }));
vi.mock("@calcom/lib/constants", () => ({
  CREDENTIAL_SYNC_SECRET: "segredo-certo",
  CREDENTIAL_SYNC_SECRET_HEADER_NAME: "calcom-credential-sync-secret",
  get APP_CREDENTIAL_SHARING_ENABLED() {
    return flags.sharing;
  },
}));
vi.mock("@calcom/lib/crypto", () => ({
  symmetricEncrypt: (text: string) => `cifra:${text}`,
  symmetricDecrypt: (text: string) => text.replace(/^cifra:/, ""),
}));
vi.mock("@calcom/app-store/applecalendar/lib", () => ({
  BuildCalendarService: (credential: unknown) => {
    dav.build(credential);
    return { listCalendars: dav.listCalendars };
  },
}));
vi.mock("@calcom/lib/logger", () => ({ default: log }));
vi.mock("app/api/defaultResponderForAppDir", () => ({
  defaultResponderForAppDir: (handler: unknown) => handler,
}));
vi.mock("@lib/nexus-sso/config", () => ({ NEXUS_SSO_PROVIDER: "nexus" }));

import { DELETE, GET, POST } from "./route";

const BASE = "https://agenda.socialfy.me/api/nexus/apple-calendar";
const ctx = { params: Promise.resolve({}) };
const send = (handler: typeof POST, method: string, body: unknown, secret = "segredo-certo") =>
  handler(
    new NextRequest(BASE, {
      method,
      headers: {
        "content-type": "application/json",
        "calcom-credential-sync-secret": secret,
      },
      body: JSON.stringify(body),
    }),
    ctx
  );
const read = (query: string, secret = "segredo-certo") =>
  GET(
    new NextRequest(`${BASE}?${query}`, {
      headers: { "calcom-credential-sync-secret": secret },
    }),
    ctx
  );

const corpo = {
  nexusSub: "nexus-user-1",
  username: "cliente@icloud.com",
  password: "abcd-efgh-ijkl-mnop",
};
const chave = (username: string, password = "outra") => `cifra:${JSON.stringify({ username, password })}`;

beforeEach(() => {
  vi.clearAllMocks();
  flags.sharing = true;
  db.account.findUnique.mockResolvedValue({ userId: 7 });
  db.user.findUnique.mockResolvedValue({ id: 7, email: "dono@clinica.com" });
  db.credential.findMany.mockResolvedValue([]);
  db.credential.create.mockResolvedValue({ id: 21 });
  db.credential.update.mockResolvedValue({ id: 5 });
  db.credential.deleteMany.mockResolvedValue({ count: 1 });
  dav.listCalendars.mockResolvedValue([{ name: "Casa" }]);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe("POST /api/nexus/apple-calendar", () => {
  it("valida na Apple antes de gravar e cria a credencial no formato do app oficial", async () => {
    const res = await send(POST, "POST", corpo);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ credentialId: 21, created: true });
    expect(dav.listCalendars).toHaveBeenCalledTimes(1);
    expect(db.credential.create).toHaveBeenCalledWith({
      data: {
        type: "apple_calendar",
        key: chave("cliente@icloud.com", "abcd-efgh-ijkl-mnop"),
        userId: 7,
        teamId: null,
        appId: "apple-calendar",
        invalid: false,
      },
      select: { id: true },
    });
  });

  it("mesmo Apple ID atualiza a credencial no lugar, sem duplicar", async () => {
    db.credential.findMany.mockResolvedValue([
      { id: 4, key: chave("outro@icloud.com") },
      { id: 5, key: chave("cliente@icloud.com") },
    ]);
    const res = await send(POST, "POST", corpo);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ credentialId: 5, created: false });
    expect(db.credential.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }));
    expect(db.credential.create).not.toHaveBeenCalled();
  });

  it("422 quando a Apple recusa, sem gravar e sem a senha no log", async () => {
    dav.listCalendars.mockRejectedValue(new Error("401 Unauthorized"));
    const res = await send(POST, "POST", corpo);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "apple_rejected" });
    expect(db.credential.create).not.toHaveBeenCalled();
    expect(db.credential.update).not.toHaveBeenCalled();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("abcd-efgh-ijkl-mnop");
  });

  it("401 com segredo errado, antes de qualquer leitura", async () => {
    const res = await send(POST, "POST", corpo, "errado");
    expect(res.status).toBe(401);
    expect(db.account.findUnique).not.toHaveBeenCalled();
  });

  it("403 com o credential sync desligado", async () => {
    flags.sharing = false;
    const res = await send(POST, "POST", corpo);
    expect(res.status).toBe(403);
    expect(db.account.findUnique).not.toHaveBeenCalled();
  });

  it("404 quando o usuario do Nexus nao tem conta no motor", async () => {
    db.account.findUnique.mockResolvedValue(null);
    const res = await send(POST, "POST", corpo);
    expect(res.status).toBe(404);
    expect(dav.listCalendars).not.toHaveBeenCalled();
  });

  it("400 sem senha", async () => {
    const res = await send(POST, "POST", {
      nexusSub: "nexus-user-1",
      username: "cliente@icloud.com",
    });
    expect(res.status).toBe(400);
    expect(dav.listCalendars).not.toHaveBeenCalled();
  });
});

describe("POST /api/nexus/apple-calendar, revisao", () => {
  it("o 401 da Apple (Invalid credentials do cliente CalDAV) vira 422", async () => {
    dav.listCalendars.mockRejectedValue(new Error("Invalid credentials"));
    const res = await send(POST, "POST", corpo);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "apple_rejected" });
  });

  it("falha de rede ou do iCloud vira 502 apple_unavailable, nunca senha recusada", async () => {
    dav.listCalendars.mockRejectedValue(new Error("getaddrinfo ENOTFOUND caldav.icloud.com"));
    const res = await send(POST, "POST", corpo);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ code: "apple_unavailable" });
    expect(db.credential.create).not.toHaveBeenCalled();
  });

  it("Apple ID gravado com outra caixa atualiza no lugar, sob lock por usuario", async () => {
    db.credential.findMany.mockResolvedValue([{ id: 5, key: chave("Cliente@iCloud.com") }]);
    const res = await send(POST, "POST", corpo);
    expect(await res.json()).toEqual({ credentialId: 5, created: false });
    expect(db.credential.create).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/nexus/apple-calendar", () => {
  it("lista as contas Apple conectadas com o Apple ID e sem a senha", async () => {
    db.credential.findMany.mockResolvedValue([{ id: 5, invalid: false, key: chave("cliente@icloud.com") }]);
    const res = await read("nexusSub=nexus-user-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      connected: true,
      accounts: [{ credentialId: 5, username: "cliente@icloud.com", invalid: false }],
    });
    expect(JSON.stringify(body)).not.toContain("outra");
  });

  it("sem conta Apple responde desconectado", async () => {
    const res = await read("nexusSub=nexus-user-1");
    expect(await res.json()).toEqual({ connected: false, accounts: [] });
  });

  it("401 com segredo errado", async () => {
    const res = await read("nexusSub=nexus-user-1", "errado");
    expect(res.status).toBe(401);
  });

  it("400 sem nexusSub", async () => {
    const res = await read("");
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/nexus/apple-calendar", () => {
  it("apaga so as credenciais Apple do usuario", async () => {
    db.credential.deleteMany.mockResolvedValue({ count: 1 });
    const res = await send(DELETE, "DELETE", { nexusSub: "nexus-user-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 1 });
    expect(db.credential.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, appId: "apple-calendar" },
    });
  });

  it("com credentialId apaga so aquela conta", async () => {
    const res = await send(DELETE, "DELETE", { nexusSub: "nexus-user-1", credentialId: 5 });
    expect(res.status).toBe(200);
    expect(db.credential.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, appId: "apple-calendar", id: 5 },
    });
  });

  it("401 com segredo errado", async () => {
    const res = await send(DELETE, "DELETE", { nexusSub: "nexus-user-1" }, "errado");
    expect(res.status).toBe(401);
    expect(db.credential.deleteMany).not.toHaveBeenCalled();
  });
});
