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
const sync = vi.hoisted(() => vi.fn());

vi.mock("@calcom/prisma", async () => {
  const { createPrismaMock } = await import(
    "@calcom/features/auth/signup/handlers/__tests__/mocks/prisma.mocks"
  );
  return createPrismaMock();
});
vi.mock("@calcom/lib/logger", () => ({ default: { getSubLogger: () => logSpies, ...logSpies } }));
vi.mock("@calcom/lib/constants", () => ({ WEBAPP_URL: "https://agenda.socialfy.me" }));
vi.mock("@calcom/lib/server/username", () => ({ isUsernameReservedDueToMigration: vi.fn().mockResolvedValue(false) }));
vi.mock("@calcom/features/di/containers/UserRepository", () => ({
  getUserRepository: () => ({ create: createUser }),
}));
vi.mock("@lib/nexus-sso/resourceCapacity", async (importOriginal) => {
  const original = await importOriginal<typeof import("@lib/nexus-sso/resourceCapacity")>();
  return { ...original, syncNexusResourceCapacity: sync };
});

import { NexusResourceCapacitySyncError } from "@lib/nexus-sso/resourceCapacity";
import { PUT } from "./route";

const ISSUER = "https://nexus.socialfy.me";
const AUDIENCE = "https://agenda.socialfy.me/api/nexus/resource-capacity/sync";
const TENANT = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "loc_abc";
const RESOURCE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "33333333-3333-4333-8333-333333333333";
const SERVICE = "44444444-4444-4444-8444-444444444444";
const MOTOR_RESOURCE = "55555555-5555-4555-8555-555555555555";
const MOTOR_BINDING = "66666666-6666-4666-8666-666666666666";

const ack = {
  version: 7,
  resources: [{
    id: MOTOR_RESOURCE,
    externalResourceId: RESOURCE,
    externalLocationId: LOCATION,
    version: 7,
    active: true,
  }],
  bindings: [{
    id: MOTOR_BINDING,
    eventTypeId: 12,
    externalServiceId: SERVICE,
    externalResourceId: RESOURCE,
    externalLocationId: LOCATION,
    version: 7,
    active: true,
  }],
};

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let publicPem: string;

const input = (extra: Record<string, unknown> = {}) => ({
  version: 7,
  resources: [{ externalResourceId: RESOURCE, externalLocationId: LOCATION, name: "Sala 1", capacity: 2, active: true }],
  bindings: [{ externalServiceId: SERVICE, eventTypeId: 12, externalResourceId: RESOURCE, externalLocationId: LOCATION, active: true }],
  ...extra,
});
const sha = (body: string) => createHash("sha256").update(body, "utf8").digest("hex");

async function sign(body: string, claims: Record<string, unknown> = {}, key?: CryptoKey) {
  const now = Math.floor(Date.now() / 1000);
  const values = { aud: AUDIENCE, jti: crypto.randomUUID(), tenantId: TENANT, workspaceKey: WORKSPACE, ...claims };
  return new SignJWT({
    email: "ana@example.com",
    name: "Ana",
    bsh: sha(body),
    tenantId: values.tenantId,
    workspaceKey: values.workspaceKey,
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(values.aud as string)
    .setSubject("nexus-user-1")
    .setIssuedAt(now)
    .setExpirationTime(now + 30)
    .setJti(values.jti as string)
    .sign(key ?? privateKey);
}

function request(body: string, token: string | null) {
  return new NextRequest(`https://agenda.socialfy.me/api/nexus/resource-capacity/sync`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  });
}

async function call(value: Record<string, unknown> = input(), claims: Record<string, unknown> = {}) {
  const body = JSON.stringify(value);
  return PUT(request(body, await sign(body, claims)));
}

beforeAll(async () => {
  const first = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const second = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  privateKey = first.privateKey as CryptoKey;
  otherPrivateKey = second.privateKey as CryptoKey;
  publicPem = await exportSPKI(first.publicKey);
});

beforeEach(() => {
  resetPrismaMock();
  Object.values(logSpies).forEach((spy) => spy.mockClear());
  createUser.mockReset();
  sync.mockReset();
  vi.stubEnv("NEXUS_AGENDA_SSO_PUBLIC_KEY", publicPem);
  prismaMock.verificationToken.create.mockResolvedValue({} as never);
  prismaMock.account.findUnique.mockResolvedValue({ user: { id: 42, email: "ana@example.com", name: "Ana" } } as never);
  sync.mockResolvedValue(ack);
});

afterEach(() => vi.unstubAllEnvs());

describe("PUT /api/nexus/resource-capacity/sync", () => {
  it("sincroniza no escopo assinado e nunca recebe escopo do corpo", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(ack);
    expect(sync).toHaveBeenCalledWith(
      { tenantId: TENANT, workspaceKey: WORKSPACE, ownerUserId: 42 },
      input()
    );
  });

  it("recusa token ausente, chave errada, audience errada e corpo trocado", async () => {
    const body = JSON.stringify(input());
    expect((await PUT(request(body, null))).status).toBe(401);
    expect((await PUT(request(body, await sign(body, {}, otherPrivateKey)))).status).toBe(401);
    expect((await PUT(request(body, await sign(body, { aud: "https://agenda.socialfy.me/api/nexus/event-types" })))).status).toBe(401);
    expect((await PUT(request(JSON.stringify(input({ bindings: [] })), await sign(body)))).status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("exige tenant e workspace no token, mas os rejeita no corpo", async () => {
    expect((await call(input(), { tenantId: undefined, workspaceKey: undefined })).status).toBe(401);
    expect((await call(input(), { workspaceKey: undefined })).status).toBe(401);
    expect((await call({ ...input(), tenantId: TENANT })).status).toBe(400);
    expect(sync).not.toHaveBeenCalled();
  });

  it("valida o corpo antes de consumir o jti", async () => {
    const response = await call({ resources: [], bindings: [], extra: true });
    expect(response.status).toBe(400);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("token reutilizado responde 401 sem chamar o storage", async () => {
    prismaMock.verificationToken.create.mockRejectedValue(createP2002Error(["token"]) as never);
    expect((await call()).status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("nao revela binding de outro dono e diferencia conflitos de versao", async () => {
    sync.mockRejectedValueOnce(new NexusResourceCapacitySyncError("binding_not_found"));
    expect((await call()).status).toBe(404);
    sync.mockRejectedValueOnce(new NexusResourceCapacitySyncError("stale_version"));
    expect((await call()).status).toBe(409);
    sync.mockRejectedValueOnce(new NexusResourceCapacitySyncError("version_conflict"));
    expect((await call()).status).toBe(409);
  });

  it("limita o payload antes de consumir o jti", async () => {
    const body = JSON.stringify({ resources: [], bindings: [], pad: "x".repeat(260 * 1024) });
    const response = await PUT(request(body, await sign(body)));
    expect(response.status).toBe(413);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("falha inesperada responde 500 sem registrar corpo nem token", async () => {
    sync.mockRejectedValue(new Error("db indisponivel"));
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "agenda_resource_capacity_error" });
    expect(logSpies.error).toHaveBeenCalledWith("falha ao sincronizar capacidade", { message: "db indisponivel" });
  });
});
