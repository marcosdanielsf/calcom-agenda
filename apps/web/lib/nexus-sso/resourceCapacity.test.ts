// Atualizado: 2026-11-21 05:38 BRT.
import { execFileSync } from "node:child_process";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  let state: { ownerUserId: number; sourceVersion: number; payloadHash: string } | null = null;
  const tx = {
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 0),
    nexusResourceCapacitySyncState: {
      findUnique: vi.fn(async () => state),
      upsert: vi.fn(async ({ create, update }: { create: typeof state; update: typeof state }) => {
        state = state ? update : create;
        return state;
      }),
    },
    eventType: { findMany: vi.fn(async () => []) },
    nexusBookingResourcePool: {
      upsert: vi.fn(async () => ({ id: "55555555-5555-4555-8555-555555555555" })),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    nexusEventTypeResourceBinding: {
      upsert: vi.fn(async () => ({ id: "66666666-6666-4666-8666-666666666666" })),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  return {
    tx,
    prisma: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) },
    createBooking: vi.fn(),
    reset: () => {
      state = null;
    },
  };
});

vi.mock("@calcom/prisma", () => ({ default: harness.prisma, prisma: harness.prisma }));
vi.mock("@calcom/prisma/client", () => ({
  Prisma: {
    join: (values: unknown[]) => values,
    PrismaClientKnownRequestError: class extends Error {},
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));
vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: vi.fn(async () => null),
}));
vi.mock("@calcom/features/bookings/di/RegularBookingService.container", () => ({
  getRegularBookingService: vi.fn(() => ({ createBooking: harness.createBooking })),
}));
vi.mock("@calcom/features/bot-detection", () => ({
  BotDetectionService: class {
    async checkBotDetection() {}
  },
}));
vi.mock("@calcom/features/eventtypes/repositories/eventTypeRepository", () => ({
  EventTypeRepository: class {},
}));
vi.mock("@calcom/features/flags/features.repository", () => ({
  FeaturesRepository: class {},
}));
vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: vi.fn(async () => undefined),
}));
vi.mock("@calcom/lib/server/checkCfTurnstileToken", () => ({
  checkCfTurnstileToken: vi.fn(async () => undefined),
}));
vi.mock("@calcom/lib/nexus-booking/server", () => ({
  usesNexusBooking: vi.fn(() => false),
  submitNexusBooking: vi.fn(),
}));

import process from "node:process";
import { nexusResourceCapacitySyncInputSchema, syncNexusResourceCapacity } from "./resourceCapacity";

const RESOURCE = "22222222-2222-4222-8222-222222222222";
const LOCATION = "33333333-3333-4333-8333-333333333333";
const SERVICE = "44444444-4444-4444-8444-444444444444";
const resource = {
  externalResourceId: RESOURCE,
  externalLocationId: LOCATION,
  name: "Sala",
  capacity: 2,
  active: true,
};
const binding = {
  externalServiceId: SERVICE,
  eventTypeId: 12,
  externalResourceId: RESOURCE,
  externalLocationId: LOCATION,
  active: true,
};
const scope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  workspaceKey: "location-a",
  ownerUserId: 42,
};

beforeEach(() => {
  harness.reset();
  vi.clearAllMocks();
});

describe("nexusResourceCapacitySyncInputSchema", () => {
  it("aceita snapshot completo e revisão mesmo quando o snapshot está vazio", () => {
    expect(nexusResourceCapacitySyncInputSchema.parse({ version: 8, resources: [], bindings: [] })).toEqual({
      version: 8,
      resources: [],
      bindings: [],
    });
    expect(
      nexusResourceCapacitySyncInputSchema.parse({ version: 9, resources: [resource], bindings: [binding] })
        .version
    ).toBe(9);
  });
  it("recusa duplicatas e qualquer binding sem recurso no mesmo snapshot", () => {
    expect(
      nexusResourceCapacitySyncInputSchema.safeParse({
        version: 1,
        resources: [resource, resource],
        bindings: [],
      }).success
    ).toBe(false);
    expect(
      nexusResourceCapacitySyncInputSchema.safeParse({ version: 1, resources: [], bindings: [binding] })
        .success
    ).toBe(false);
    expect(
      nexusResourceCapacitySyncInputSchema.safeParse({
        version: 1,
        resources: [],
        bindings: [{ ...binding, active: false }],
      }).success
    ).toBe(false);
  });
  it("recusa versão, capacidade e ids fora do contrato", () => {
    expect(
      nexusResourceCapacitySyncInputSchema.safeParse({ version: 0, resources: [resource], bindings: [] })
        .success
    ).toBe(false);
    expect(
      nexusResourceCapacitySyncInputSchema.safeParse({
        version: 1,
        resources: [{ ...resource, capacity: 0 }],
        bindings: [],
      }).success
    ).toBe(false);
    expect(
      nexusResourceCapacitySyncInputSchema.safeParse({
        version: 1,
        resources: [{ ...resource, externalLocationId: "x" }],
        bindings: [],
      }).success
    ).toBe(false);
  });
});

describe("syncNexusResourceCapacity", () => {
  it("aplica versão maior, repete a mesma e recusa versão antiga ou divergente", async () => {
    const emptySnapshot = { version: 2, resources: [], bindings: [] };

    await expect(syncNexusResourceCapacity(scope, emptySnapshot)).resolves.toEqual({
      version: 2,
      resources: [],
      bindings: [],
    });
    await expect(syncNexusResourceCapacity(scope, emptySnapshot)).resolves.toEqual({
      version: 2,
      resources: [],
      bindings: [],
    });
    expect(harness.tx.nexusResourceCapacitySyncState.upsert).toHaveBeenCalledTimes(1);

    await expect(syncNexusResourceCapacity(scope, { ...emptySnapshot, version: 1 })).rejects.toMatchObject({
      code: "stale_version",
    });
    await expect(
      syncNexusResourceCapacity(scope, {
        ...emptySnapshot,
        resources: [{ ...resource, active: false }],
      })
    ).rejects.toMatchObject({ code: "version_conflict" });
  });

  it("reconcilia reservas futuras antes de confirmar o ACK da versão", async () => {
    harness.tx.$queryRaw.mockResolvedValueOnce([
      { id: binding.eventTypeId, userId: scope.ownerUserId, metadata: { nexusServiceId: SERVICE } },
    ]);

    await expect(
      syncNexusResourceCapacity(scope, { version: 1, resources: [resource], bindings: [binding] })
    ).resolves.toMatchObject({ version: 1 });

    expect(harness.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(harness.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      harness.tx.nexusResourceCapacitySyncState.upsert.mock.invocationCallOrder[0]
    );
  });

  it("não confirma o ACK quando reserva preexistente não identifica uma única unidade", async () => {
    harness.tx.$queryRaw.mockResolvedValueOnce([
      { id: binding.eventTypeId, userId: scope.ownerUserId, metadata: { nexusServiceId: SERVICE } },
    ]);
    harness.tx.$executeRaw.mockRejectedValueOnce(
      new Error("NEXUS_RESOURCE_EXISTING_BOOKING_LOCATION_REQUIRED")
    );

    await expect(
      syncNexusResourceCapacity(scope, { version: 1, resources: [resource], bindings: [binding] })
    ).rejects.toMatchObject({ code: "existing_booking_location_required" });
    expect(harness.tx.nexusResourceCapacitySyncState.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/book/event com capacidade real", () => {
  it.skipIf(!process.env.NEXUS_CAPACITY_PG_CONTAINER && !process.env.NEXUS_CAPACITY_PG_SOCKET)(
    "preserva metadata[nexusLocationId] e aloca o pool da unidade escolhida",
    async () => {
      const container = process.env.NEXUS_CAPACITY_PG_CONTAINER;
      const socket = process.env.NEXUS_CAPACITY_PG_SOCKET;
      const port = process.env.NEXUS_CAPACITY_PG_PORT ?? "15464";
      const psql = (sql: string, output = false) => {
        if (container) {
          return execFileSync(
            "docker",
            [
              "exec",
              ...(output ? [] : ["-i"]),
              container,
              "psql",
              ...(output ? ["-At"] : []),
              "-v",
              "ON_ERROR_STOP=1",
              "-U",
              "postgres",
              "-d",
              "capacity",
              "-c",
              sql,
            ],
            output ? { encoding: "utf8" } : undefined
          );
        }
        if (!socket) throw new Error("NEXUS_CAPACITY_PG_SOCKET ausente");
        return execFileSync(
          "psql",
          [
            "-h",
            socket,
            "-p",
            port,
            ...(output ? ["-At"] : []),
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "capacity",
            "-c",
            sql,
          ],
          output ? { encoding: "utf8" } : undefined
        );
      };

      harness.createBooking.mockImplementationOnce(async ({ bookingData }) => {
        const metadata = JSON.stringify(bookingData.metadata).replaceAll("'", "''");
        const sql = `INSERT INTO "Booking" ("uid","eventTypeId","startTime","endTime","status","metadata") VALUES ('route-metadata',${bookingData.eventTypeId},'${bookingData.start}','${bookingData.end}','accepted','${metadata}') RETURNING "uid";`;
        psql(sql);
        return { uid: "route-metadata", metadata: bookingData.metadata };
      });

      const locationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002";
      const { default: bookEvent } = await import("@calcom/web/pages/api/book/event");
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        url: "/api/book/event",
        headers: { host: "agenda.example.test" },
        body: {
          eventTypeId: 3,
          start: "2031-01-01T09:00:00.000Z",
          end: "2031-01-01T10:00:00.000Z",
          metadata: { nexusLocationId: locationId },
        },
      });

      await bookEvent(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toMatchObject({
        uid: "route-metadata",
        metadata: { nexusLocationId: locationId },
      });
      const result = String(
        psql(
          `SELECT b."metadata"->>'nexusLocationId'||'|'||p."externalLocationId" FROM "Booking" b JOIN "NexusBookingResourceAllocation" a ON a."bookingId"=b."id" JOIN "NexusBookingResourcePool" p ON p."id"=a."resourcePoolId" WHERE b."uid"='route-metadata';`,
          true
        )
      ).trim();
      expect(result).toBe(`${locationId}|${locationId}`);
    }
  );
});
