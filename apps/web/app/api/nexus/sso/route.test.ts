// @vitest-environment node

import {
  createP2002Error,
  prismaMock,
  resetPrismaMock,
} from "@calcom/features/auth/signup/handlers/__tests__/mocks/prisma.mocks";
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logSpies = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
const createUser = vi.hoisted(() => vi.fn());

vi.mock("@calcom/prisma", async () => {
  const { createPrismaMock } = await import(
    "@calcom/features/auth/signup/handlers/__tests__/mocks/prisma.mocks"
  );
  return createPrismaMock();
});
vi.mock("@calcom/lib/logger", () => ({
  default: { getSubLogger: () => logSpies, ...logSpies },
}));
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
const AUD = "https://agenda.socialfy.me";
const SECRET = "segredo-de-sessao-de-teste-com-tamanho-ok";

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let publicPem: string;

type Claims = Partial<{
  iss: string;
  aud: string;
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
  jti: string | null;
}>;

async function sign(claims: Claims = {}, opts: { key?: CryptoKey; alg?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const c = { sub: "nexus-user-1", email: "Ana@Example.com", name: "Ana", ...claims };
  const jwt = new SignJWT({ email: c.email, name: c.name })
    .setProtectedHeader({ alg: (opts.alg ?? "EdDSA") as "EdDSA", typ: "JWT" })
    .setIssuer(c.iss ?? ISS)
    .setAudience(c.aud ?? AUD)
    .setIssuedAt(c.iat ?? now)
    .setExpirationTime(c.exp ?? now + 30);
  if (c.sub) jwt.setSubject(c.sub);
  if (c.jti !== null) jwt.setJti(c.jti ?? crypto.randomUUID());
  return jwt.sign(opts.key ?? privateKey);
}

function req(fields: Record<string, string>, headers: Record<string, string> = { origin: ISS }) {
  return new NextRequest("https://agenda.socialfy.me/api/nexus/sso", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

const call = (r: NextRequest) => POST(r, { params: Promise.resolve({}) });

async function okReq(extra: Record<string, string> = {}, claims: Claims = {}) {
  return req({ token: await sign(claims), dest: "event-types", theme: "dark", ...extra });
}

function linkNone() {
  prismaMock.account.findUnique.mockResolvedValue(null as never);
  prismaMock.user.findFirst.mockResolvedValue(null as never);
}

beforeEach(async () => {
  resetPrismaMock();
  Object.values(logSpies).forEach((s) => s.mockClear());
  createUser.mockReset();
  vi.stubEnv("NEXTAUTH_SECRET", SECRET);
  vi.stubEnv("NEXUS_AGENDA_SSO_PUBLIC_KEY", publicPem);
  vi.stubEnv("NEXUS_AGENDA_LOCAL_PARENT_ORIGIN", "");
  vi.stubEnv("NODE_ENV", "test");
  prismaMock.verificationToken.create.mockResolvedValue({} as never);
  linkNone();
  createUser.mockResolvedValue({ id: 42, email: "ana@example.com", name: "Ana" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

import { beforeAll } from "vitest";

beforeAll(async () => {
  const a = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const b = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  privateKey = a.privateKey as CryptoKey;
  otherPrivateKey = b.privateKey as CryptoKey;
  publicPem = await exportSPKI(a.publicKey);
});

describe("POST /api/nexus/sso, recusas", () => {
  it("sem a env da chave publica responde 503 agenda_sso_unavailable", async () => {
    vi.stubEnv("NEXUS_AGENDA_SSO_PUBLIC_KEY", "");
    const res = await call(await okReq());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "agenda_sso_unavailable" });
  });

  it("Origin errado ou ausente responde 403 sem tocar o banco", async () => {
    const bad = await call(
      req({ token: await sign(), dest: "event-types", theme: "light" }, { origin: "https://evil.example" })
    );
    expect(bad.status).toBe(403);
    const none = await call(req({ token: await sign(), dest: "event-types", theme: "light" }, {}));
    expect(none.status).toBe(403);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("origem loopback so vale fora de producao", async () => {
    vi.stubEnv("NEXUS_AGENDA_LOCAL_PARENT_ORIGIN", "http://localhost:5173");
    const local = await call(
      req({ token: await sign(), dest: "event-types", theme: "light" }, { origin: "http://localhost:5173" })
    );
    expect(local.status).toBe(303);
    vi.stubEnv("NODE_ENV", "production");
    const prod = await call(
      req({ token: await sign(), dest: "event-types", theme: "light" }, { origin: "http://localhost:5173" })
    );
    expect(prod.status).toBe(403);
  });

  it("assinatura forjada, alg HS256, alg none, iss, aud, vencido, ttl>60 e sem jti viram 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const forged = await sign({}, { key: otherPrivateKey });
    const hs = await new SignJWT({ email: "a@b.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setSubject("x")
      .setJti("j1")
      .setIssuedAt()
      .setExpirationTime("30s")
      .sign(new TextEncoder().encode(publicPem));
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({
      iss: ISS,
      aud: AUD,
      sub: "x",
      email: "a@b.com",
      jti: "j2",
      iat: now,
      exp: now + 30,
    })}.`;
    const tokens = [
      forged,
      hs,
      none,
      await sign({ iss: "https://outro.example" }),
      await sign({ aud: "https://outra.example" }),
      await sign({ iat: now - 120, exp: now - 60 }),
      await sign({ iat: now, exp: now + 61 }),
      await sign({ jti: null }),
      await sign({ sub: "" }),
      await sign({ email: "" }),
      "lixo",
    ];
    for (const token of tokens) {
      const res = await call(req({ token, dest: "event-types", theme: "light" }));
      expect(res.status).toBe(401);
      expect(JSON.stringify(await res.json())).not.toContain(token);
    }
    expect(createUser).not.toHaveBeenCalled();
  });

  it("jti reusado (P2002 no consumo) responde 401", async () => {
    prismaMock.verificationToken.create.mockRejectedValue(createP2002Error(["token"]) as never);
    const res = await call(await okReq());
    expect(res.status).toBe(401);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("consome o jti com identifier nexus-sso e expires do token", async () => {
    const now = Math.floor(Date.now() / 1000);
    await call(await okReq({}, { jti: "jti-fixo", iat: now, exp: now + 40 }));
    expect(prismaMock.verificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { identifier: "nexus-sso", token: "jti-fixo", expires: new Date((now + 40) * 1000) },
      })
    );
  });

  it("dest fora do mapa responde 400 sem queimar o jti", async () => {
    const res = await call(await okReq({ dest: "https://evil.example/x" }));
    expect(res.status).toBe(400);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("email de conta nao vinculada responde 409 sem criar nada", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 7 } as never);
    const res = await call(await okReq());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "agenda_email_conflict" });
    expect(createUser).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("POST /api/nexus/sso, sucesso", () => {
  it("cria o usuario uma vez, com Account nexus, e devolve 303 com cookie", async () => {
    const res = await call(await okReq());
    expect(res.status).toBe(303);
    expect(createUser).toHaveBeenCalledTimes(1);
    const data = createUser.mock.calls[0][0];
    expect(data).toMatchObject({
      email: "ana@example.com",
      name: "Ana",
      role: "USER",
      completedOnboarding: true,
      timeZone: "America/Sao_Paulo",
      locale: "pt-BR",
      organizationId: null,
      accounts: { create: { type: "oauth", provider: "nexus", providerAccountId: "nexus-user-1" } },
    });
    expect(data.emailVerified).toBeInstanceOf(Date);
    expect(data.hashedPassword).toBeUndefined();
    expect(data.username).toMatch(/^ana/);
    expect(res.headers.get("location")).toBe("https://agenda.socialfy.me/event-types?shell=nexus&theme=dark");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("tema invalido vira light e cada dest cai na rota certa", async () => {
    const map: Record<string, string> = {
      "event-types": "/event-types",
      bookings: "/bookings/upcoming",
      availability: "/availability",
      apps: "/settings/my-account/calendars",
      settings: "/settings/my-account/profile",
    };
    for (const [dest, route] of Object.entries(map)) {
      const res = await call(await okReq({ dest, theme: "neon" }));
      expect(res.headers.get("location")).toBe(`https://agenda.socialfy.me${route}?shell=nexus&theme=light`);
    }
  });

  it("cookie de sessao tem nome, flags e maxAge de 8 h, e o token tem sub numerico e email gravado", async () => {
    const res = await call(await okReq());
    const cookie = res.cookies.get("__Secure-next-auth.session-token");
    expect(cookie).toBeDefined();
    const raw = res.headers.get("set-cookie") ?? "";
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/Max-Age=28800/i);
    expect(raw).toMatch(/Path=\//i);
    expect(raw).not.toMatch(/Domain=/i);
    const decoded = await decode({ token: cookie?.value, secret: SECRET });
    expect(decoded).toMatchObject({ sub: "42", email: "ana@example.com", name: "Ana" });
    const ttl = (decoded?.exp as number) - (decoded?.iat as number);
    expect(ttl).toBe(8 * 60 * 60);
  });

  it("vinculo existente e reaproveitado e o email gravado vai na sessao", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      user: { id: 9, email: "gravado@example.com", name: "Gravado" },
    } as never);
    const res = await call(await okReq());
    expect(res.status).toBe(303);
    expect(createUser).not.toHaveBeenCalled();
    const decoded = await decode({
      token: res.cookies.get("__Secure-next-auth.session-token")?.value,
      secret: SECRET,
    });
    expect(decoded).toMatchObject({ sub: "9", email: "gravado@example.com" });
    expect(logSpies.warn).toHaveBeenCalled();
  });

  it("corrida: P2002 na criacao relê o vinculo e nao duplica usuario", async () => {
    prismaMock.account.findUnique
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce({ user: { id: 11, email: "ana@example.com", name: "Ana" } } as never);
    createUser.mockRejectedValueOnce(createP2002Error(["provider", "providerAccountId"]));
    const res = await call(await okReq());
    expect(res.status).toBe(303);
    expect(createUser).toHaveBeenCalledTimes(1);
    const decoded = await decode({
      token: res.cookies.get("__Secure-next-auth.session-token")?.value,
      secret: SECRET,
    });
    expect(decoded?.sub).toBe("11");
  });

  it("corrida: P2002 por email de outra conta vira 409", async () => {
    prismaMock.account.findUnique.mockResolvedValue(null as never);
    let emailChecks = 0;
    prismaMock.user.findFirst.mockImplementation((async (args: { where: { email?: unknown } }) => {
      if (!args.where.email) return null;
      emailChecks += 1;
      return emailChecks === 1 ? null : { id: 5 };
    }) as never);
    createUser.mockRejectedValueOnce(createP2002Error(["email"]));
    const res = await call(await okReq());
    expect(res.status).toBe(409);
  });

  it("aceita chave publica em uma linha com \\n literal e PEM multilinha", async () => {
    vi.stubEnv("NEXUS_AGENDA_SSO_PUBLIC_KEY", publicPem.trim().replace(/\n/g, "\\n"));
    expect((await call(await okReq())).status).toBe(303);
    vi.stubEnv("NEXUS_AGENDA_SSO_PUBLIC_KEY", publicPem);
    expect((await call(await okReq())).status).toBe(303);
  });

  it("o token e o corpo nunca aparecem em log", async () => {
    const token = await sign({ jti: "jti-log" });
    await call(req({ token, dest: "event-types", theme: "light" }));
    await call(req({ token: "x.y.z", dest: "event-types", theme: "light" }));
    prismaMock.verificationToken.create.mockRejectedValueOnce(new Error("boom"));
    await call(req({ token: await sign(), dest: "event-types", theme: "light" }));
    const logged = JSON.stringify(Object.values(logSpies).flatMap((s) => s.mock.calls));
    expect(logged).not.toContain(token);
    expect(logged).not.toContain("x.y.z");
    expect(logged).not.toContain("token=");
  });
});
