// @vitest-environment node

import {
  prismaMock,
  resetPrismaMock,
} from "@calcom/features/auth/signup/handlers/__tests__/mocks/prisma.mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.hoisted(() => vi.fn());
const logSpies = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));

vi.mock("@calcom/prisma", async () => {
  const { createPrismaMock } = await import(
    "@calcom/features/auth/signup/handlers/__tests__/mocks/prisma.mocks"
  );
  return createPrismaMock();
});
vi.mock("@calcom/lib/logger", () => ({
  default: { getSubLogger: () => logSpies, ...logSpies },
}));
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

import { resolveNexusUser } from "./provision";

beforeEach(() => {
  resetPrismaMock();
  createUser.mockReset();
  Object.values(logSpies).forEach((s) => s.mockClear());
  prismaMock.account.findUnique.mockResolvedValue(null as never);
  prismaMock.user.findFirst.mockResolvedValue(null as never);
  createUser.mockResolvedValue({ id: 7, email: "ana@example.com", name: "Ana Souza" });
});

describe("resolveNexusUser, conta nova", () => {
  it("o username sai do slug do nome do token", async () => {
    await resolveNexusUser({ sub: "s1", email: "ana.souza99@example.com", name: "Ana Souza" });
    expect(createUser.mock.calls[0][0].username).toBe("ana-souza");
  });

  it("sem nome no token, o username cai na parte do email antes do arroba", async () => {
    await resolveNexusUser({ sub: "s1", email: "ana@example.com", name: null });
    expect(createUser.mock.calls[0][0].username).toBe("ana");
  });

  it("nome tomado por outra conta ganha sufixo, como acontecia com o email", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(null as never) // emailTaken
      .mockResolvedValueOnce({ id: 1 } as never); // username "ana-souza" ja existe
    await resolveNexusUser({ sub: "s1", email: "ana@example.com", name: "Ana Souza" });
    expect(createUser.mock.calls[0][0].username).toMatch(/^ana-souza-[0-9a-f]{6}$/);
  });

  it("nasce com um tipo Reunião de 30 min, visivel, com dono e participante", async () => {
    await resolveNexusUser({ sub: "s1", email: "ana@example.com", name: "Ana Souza" });
    expect(prismaMock.eventType.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.eventType.create.mock.calls[0][0].data).toMatchObject({
      title: "Reunião de 30 min",
      slug: "reuniao-30min",
      length: 30,
      hidden: false,
      owner: { connect: { id: 7 } },
      users: { connect: { id: 7 } },
    });
  });

  it("liga a flag bookings-v3 so para o usuario criado", async () => {
    await resolveNexusUser({ sub: "s1", email: "ana@example.com", name: "Ana Souza" });
    expect(prismaMock.userFeatures.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.userFeatures.upsert.mock.calls[0][0]).toMatchObject({
      where: { userId_featureId: { userId: 7, featureId: "bookings-v3" } },
      create: { userId: 7, featureId: "bookings-v3", enabled: true },
      update: {},
    });
  });

  it("falha ao criar o tipo padrao nao derruba o login", async () => {
    prismaMock.eventType.create.mockRejectedValue(new Error("boom") as never);
    const user = await resolveNexusUser({ sub: "s1", email: "ana@example.com", name: "Ana Souza" });
    expect(user.id).toBe(7);
    expect(logSpies.error).toHaveBeenCalled();
    expect(prismaMock.userFeatures.upsert).toHaveBeenCalledTimes(1);
  });

  it("conta ja vinculada nao ganha tipo nem flag de novo", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      user: { id: 9, email: "ana@example.com", name: "Ana" },
    } as never);
    await resolveNexusUser({ sub: "s1", email: "ana@example.com", name: "Ana" });
    expect(createUser).not.toHaveBeenCalled();
    expect(prismaMock.eventType.create).not.toHaveBeenCalled();
    expect(prismaMock.userFeatures.upsert).not.toHaveBeenCalled();
  });
});
