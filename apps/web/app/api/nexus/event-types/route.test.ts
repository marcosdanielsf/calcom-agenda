// @vitest-environment node

import { createHash } from "node:crypto";
import {
  createP2002Error,
  prismaMock,
  resetPrismaMock,
} from "@calcom/features/auth/signup/handlers/__tests__/mocks/prisma.mocks";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const logSpies = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
const createUser = vi.hoisted(() => vi.fn());

vi.mock("@calcom/prisma", async () => {
  const { createPrismaMock } = await import(
    "@calcom/features/auth/signup/handlers/__tests__/mocks/prisma.mocks"
  );
  return createPrismaMock();
});
vi.mock("@calcom/lib/logger", () => ({ default: { getSubLogger: () => logSpies, ...logSpies } }));
vi.mock("@calcom/lib/constants", () => ({ WEBAPP_URL: "https://agenda.socialfy.me" }));
vi.mock("@calcom/lib/server/username", () => ({
  isUsernameReservedDueToMigration: vi.fn().mockResolvedValue(false),
}));
vi.mock("@calcom/features/di/containers/UserRepository", () => ({
  getUserRepository: () => ({ create: createUser }),
}));
vi.mock("@calcom/prisma/enums", () => ({
  CreationSource: { WEBAPP: "WEBAPP" },
  UserPermissionRole: { USER: "USER" },
}));

import { POST } from "./route";

const ISS = "https://nexus.socialfy.me";
const AUD = "https://agenda.socialfy.me/api/nexus/event-types";
const SERVICO = "33333333-3333-4333-8333-333333333333";

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let publicPem: string;

const entrada = (extra: Record<string, unknown> = {}) => ({
  nexusServiceId: SERVICO,
  eventTypeId: null,
  title: "Dermaplaning",
  lengthMinutes: 60,
  description: "Esfoliacao",
  hidden: false,
  position: 2,
  ...extra,
});

const sha = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");

async function sign(body: string, claims: Record<string, unknown> = {}, key?: CryptoKey) {
  const now = Math.floor(Date.now() / 1000);
  const c = { aud: AUD, bsh: sha(body), jti: crypto.randomUUID(), ...claims };
  return new SignJWT({ email: "ana@example.com", name: "Ana", bsh: c.bsh })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuer(ISS)
    .setAudience(c.aud as string)
    .setSubject("nexus-user-1")
    .setIssuedAt(now)
    .setExpirationTime(now + 30)
    .setJti(c.jti as string)
    .sign(key ?? privateKey);
}

function req(body: string, token: string | null) {
  return new NextRequest("https://agenda.socialfy.me/api/nexus/event-types", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  });
}

async function okCall(extra: Record<string, unknown> = {}) {
  const body = JSON.stringify(entrada(extra));
  return POST(req(body, await sign(body)));
}

beforeAll(async () => {
  const a = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const b = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  privateKey = a.privateKey as CryptoKey;
  otherPrivateKey = b.privateKey as CryptoKey;
  publicPem = await exportSPKI(a.publicKey);
});

beforeEach(() => {
  resetPrismaMock();
  Object.values(logSpies).forEach((s) => s.mockClear());
  createUser.mockReset();
  vi.stubEnv("NEXUS_AGENDA_SSO_PUBLIC_KEY", publicPem);
  prismaMock.verificationToken.create.mockResolvedValue({} as never);
  prismaMock.account.findUnique.mockResolvedValue({
    user: { id: 42, email: "ana@example.com", name: "Ana" },
  } as never);
  prismaMock.eventType.findFirst.mockResolvedValue(null as never);
  prismaMock.eventType.create.mockResolvedValue({ id: 7, slug: "dermaplaning" } as never);
  prismaMock.eventType.update.mockResolvedValue({ id: 7, slug: "dermaplaning" } as never);
  prismaMock.user.findUnique.mockResolvedValue({ username: "ana" } as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/nexus/event-types, recusas", () => {
  it("sem a chave publica responde 503 sem tocar o banco", async () => {
    vi.stubEnv("NEXUS_AGENDA_SSO_PUBLIC_KEY", "");
    const res = await okCall();
    expect(res.status).toBe(503);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("sem Bearer, com outra chave ou com o destino do login unico responde 401", async () => {
    const body = JSON.stringify(entrada());
    expect((await POST(req(body, null))).status).toBe(401);
    expect((await POST(req(body, await sign(body, {}, otherPrivateKey)))).status).toBe(401);
    const doLogin = await sign(body, { aud: "https://agenda.socialfy.me" });
    expect((await POST(req(body, doLogin))).status).toBe(401);
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });

  it("corpo trocado depois de assinado responde 401", async () => {
    const assinado = JSON.stringify(entrada());
    const trocado = JSON.stringify(entrada({ lengthMinutes: 600 }));
    const res = await POST(req(trocado, await sign(assinado)));
    expect(res.status).toBe(401);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("corpo invalido responde 400 sem queimar o token", async () => {
    const body = JSON.stringify(entrada({ lengthMinutes: 0, extra: "x" }));
    const res = await POST(req(body, await sign(body)));
    expect(res.status).toBe(400);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("token reusado responde 401", async () => {
    prismaMock.verificationToken.create.mockRejectedValue(createP2002Error(["token"]) as never);
    const res = await okCall();
    expect(res.status).toBe(401);
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });

  it("email do dono ja usado por outra conta responde 409", async () => {
    prismaMock.account.findUnique.mockResolvedValue(null as never);
    prismaMock.user.findFirst.mockResolvedValue({ id: 99 } as never);
    const res = await okCall();
    expect(res.status).toBe(409);
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/nexus/event-types, gravacao", () => {
  it("cria o tipo na conta do dono, com o servico no metadata e a ordem invertida", async () => {
    const res = await okCall();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventTypeId: 7, slug: "dermaplaning", username: "ana" });
    const args = prismaMock.eventType.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data).toMatchObject({
      title: "Dermaplaning",
      length: 60,
      description: "Esfoliacao",
      hidden: false,
      position: 100000 - 2,
      slug: "dermaplaning",
      metadata: { nexusServiceId: SERVICO },
      owner: { connect: { id: 42 } },
      users: { connect: { id: 42 } },
    });
  });

  it("atualiza pelo id que o Nexus guardou, so se for do dono, e nao muda o slug", async () => {
    prismaMock.eventType.findFirst.mockResolvedValueOnce({ id: 7, slug: "dermaplaning" } as never);
    const res = await okCall({ eventTypeId: 7, title: "Dermaplaning Plus", lengthMinutes: 45, hidden: true });
    expect(res.status).toBe(200);
    const busca = prismaMock.eventType.findFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(busca.where).toEqual({ id: 7, userId: 42 });
    const args = prismaMock.eventType.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(args.data).toEqual({ title: "Dermaplaning Plus", length: 45, description: "Esfoliacao", hidden: true, position: 100000 - 2 });
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });

  it("sem id guardado, casa pelo servico antes de criar outro", async () => {
    prismaMock.eventType.findFirst.mockResolvedValueOnce({ id: 9, slug: "dermaplaning" } as never);
    const res = await okCall();
    expect(res.status).toBe(200);
    expect((await res.json()).eventTypeId).toBe(7);
    const busca = prismaMock.eventType.findFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(busca.where).toEqual({ userId: 42, metadata: { path: ["nexusServiceId"], equals: SERVICO } });
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
  });

  it("slug ocupado tenta outro", async () => {
    prismaMock.eventType.create
      .mockRejectedValueOnce(createP2002Error(["userId", "slug"]) as never)
      .mockResolvedValueOnce({ id: 8, slug: "dermaplaning-ab12" } as never);
    const res = await okCall();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventTypeId: 8, slug: "dermaplaning-ab12", username: "ana" });
    expect(prismaMock.eventType.create).toHaveBeenCalledTimes(2);
  });
});
