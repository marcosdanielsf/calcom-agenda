// Atualizado: 2026-11-20 08:24 BRT. Snapshot autoritativo de recursos do Nexus no motor.
import { createHash } from "node:crypto";
import prisma from "@calcom/prisma";
import { Prisma } from "@calcom/prisma/client";
import { z } from "zod";

const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const sourceVersion = z.number().int().min(1).max(2_147_483_647);

const resourceSchema = z
  .object({
    externalResourceId: uuid,
    externalLocationId: uuid,
    name: z.string().trim().min(1).max(200),
    capacity: z.number().int().min(1).max(32_767),
    active: z.boolean(),
  })
  .strict();

const bindingSchema = z
  .object({
    externalServiceId: uuid,
    eventTypeId: z.number().int().positive(),
    externalResourceId: uuid,
    externalLocationId: uuid,
    active: z.boolean(),
  })
  .strict();

export const nexusResourceCapacitySyncInputSchema = z
  .object({
    version: sourceVersion,
    resources: z.array(resourceSchema).max(500),
    bindings: z.array(bindingSchema).max(2_000),
  })
  .strict()
  .superRefine((input, ctx) => {
    const resourceKeys = new Set<string>();
    input.resources.forEach((resource, index) => {
      const key = resourceKey(resource);
      if (resourceKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resources", index],
          message: "duplicate_resource",
        });
      }
      resourceKeys.add(key);
    });

    const bindingKeys = new Set<string>();
    const serviceBindingKeys = new Set<string>();
    input.bindings.forEach((binding, index) => {
      const key = `${binding.eventTypeId}:${resourceKey(binding)}`;
      const serviceKey = `${binding.externalServiceId}:${resourceKey(binding)}`;
      if (bindingKeys.has(key) || serviceBindingKeys.has(serviceKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bindings", index],
          message: "duplicate_binding",
        });
      }
      bindingKeys.add(key);
      serviceBindingKeys.add(serviceKey);
      if (!resourceKeys.has(resourceKey(binding))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bindings", index],
          message: "resource_not_in_snapshot",
        });
      }
    });
  });

export type NexusResourceCapacitySyncInput = z.infer<typeof nexusResourceCapacitySyncInputSchema>;
export type NexusResourceCapacityScope = {
  tenantId: string;
  workspaceKey: string;
  ownerUserId: number;
};

export type NexusResourceCapacityReadback = {
  version: number;
  resources: Array<{
    id: string;
    externalResourceId: string;
    externalLocationId: string;
    version: number;
    active: boolean;
  }>;
  bindings: Array<{
    id: string;
    eventTypeId: number;
    externalServiceId: string;
    externalResourceId: string;
    externalLocationId: string;
    version: number;
    active: boolean;
  }>;
};

export class NexusResourceCapacitySyncError extends Error {
  constructor(public readonly code: "stale_version" | "version_conflict" | "binding_not_found") {
    super(code);
  }
}

function resourceKey(input: { externalResourceId: string; externalLocationId: string }) {
  return `${input.externalResourceId}:${input.externalLocationId}`;
}

function payloadHash(input: NexusResourceCapacitySyncInput) {
  const resources = [...input.resources].sort((a, b) => resourceKey(a).localeCompare(resourceKey(b)));
  const bindings = [...input.bindings].sort((a, b) => {
    const left = `${a.eventTypeId}:${resourceKey(a)}`;
    const right = `${b.eventTypeId}:${resourceKey(b)}`;
    return left.localeCompare(right);
  });
  return createHash("sha256")
    .update(JSON.stringify({ version: input.version, resources, bindings }))
    .digest("hex");
}

function nexusServiceId(metadata: Prisma.JsonValue): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata.nexusServiceId;
  return typeof value === "string" ? value.toLowerCase() : null;
}

async function readback(
  tx: Prisma.TransactionClient,
  scope: NexusResourceCapacityScope,
  version: number
): Promise<NexusResourceCapacityReadback> {
  const resources = await tx.nexusBookingResourcePool.findMany({
    where: { tenantId: scope.tenantId, workspaceKey: scope.workspaceKey, ownerUserId: scope.ownerUserId },
    orderBy: [{ externalLocationId: "asc" }, { externalResourceId: "asc" }],
    select: {
      id: true,
      externalResourceId: true,
      externalLocationId: true,
      sourceVersion: true,
      active: true,
    },
  });
  const bindings = await tx.nexusEventTypeResourceBinding.findMany({
    where: { tenantId: scope.tenantId, workspaceKey: scope.workspaceKey, ownerUserId: scope.ownerUserId },
    orderBy: [{ eventTypeId: "asc" }, { resourcePoolId: "asc" }],
    select: {
      id: true,
      eventTypeId: true,
      externalServiceId: true,
      sourceVersion: true,
      active: true,
      resourcePool: { select: { externalResourceId: true, externalLocationId: true } },
    },
  });
  return {
    version,
    resources: resources.map((resource) => ({
      id: resource.id,
      externalResourceId: resource.externalResourceId,
      externalLocationId: resource.externalLocationId,
      version: resource.sourceVersion,
      active: resource.active,
    })),
    bindings: bindings.map((binding) => ({
      id: binding.id,
      eventTypeId: binding.eventTypeId,
      externalServiceId: binding.externalServiceId,
      externalResourceId: binding.resourcePool.externalResourceId,
      externalLocationId: binding.resourcePool.externalLocationId,
      version: binding.sourceVersion,
      active: binding.active,
    })),
  };
}

async function applySnapshot(
  scope: NexusResourceCapacityScope,
  input: NexusResourceCapacitySyncInput,
  hash: string
): Promise<NexusResourceCapacityReadback> {
  return prisma.$transaction(
    async (tx) => {
      const state = await tx.nexusResourceCapacitySyncState.findUnique({
        where: { tenantId_workspaceKey: { tenantId: scope.tenantId, workspaceKey: scope.workspaceKey } },
        select: { ownerUserId: true, sourceVersion: true, payloadHash: true },
      });
      if (state?.ownerUserId !== undefined && state.ownerUserId !== scope.ownerUserId) {
        throw new NexusResourceCapacitySyncError("binding_not_found");
      }
      if (state && input.version < state.sourceVersion) {
        throw new NexusResourceCapacitySyncError("stale_version");
      }
      if (state && input.version === state.sourceVersion) {
        if (state.payloadHash !== hash) throw new NexusResourceCapacitySyncError("version_conflict");
        return readback(tx, scope, state.sourceVersion);
      }

      const eventTypeIds = Array.from(new Set(input.bindings.map((binding) => binding.eventTypeId)));
      const eventTypes = eventTypeIds.length
        ? await tx.eventType.findMany({
            where: { id: { in: eventTypeIds }, userId: scope.ownerUserId },
            select: { id: true, metadata: true },
          })
        : [];
      const eventTypesById = new Map(eventTypes.map((eventType) => [eventType.id, eventType]));
      for (const binding of input.bindings) {
        const eventType = eventTypesById.get(binding.eventTypeId);
        if (!eventType || nexusServiceId(eventType.metadata) !== binding.externalServiceId) {
          throw new NexusResourceCapacitySyncError("binding_not_found");
        }
      }

      const resourceIdsByKey = new Map<string, string>();
      for (const resource of input.resources) {
        const saved = await tx.nexusBookingResourcePool.upsert({
          where: {
            tenantId_workspaceKey_externalResourceId_externalLocationId: {
              tenantId: scope.tenantId,
              workspaceKey: scope.workspaceKey,
              externalResourceId: resource.externalResourceId,
              externalLocationId: resource.externalLocationId,
            },
          },
          create: {
            tenantId: scope.tenantId,
            workspaceKey: scope.workspaceKey,
            ownerUserId: scope.ownerUserId,
            externalResourceId: resource.externalResourceId,
            externalLocationId: resource.externalLocationId,
            name: resource.name,
            capacity: resource.capacity,
            active: resource.active,
            sourceVersion: input.version,
          },
          update: {
            ownerUserId: scope.ownerUserId,
            name: resource.name,
            capacity: resource.capacity,
            active: resource.active,
            sourceVersion: input.version,
          },
          select: { id: true },
        });
        resourceIdsByKey.set(resourceKey(resource), saved.id);
      }

      const existingResources = await tx.nexusBookingResourcePool.findMany({
        where: { tenantId: scope.tenantId, workspaceKey: scope.workspaceKey, ownerUserId: scope.ownerUserId },
        select: { id: true, externalResourceId: true, externalLocationId: true },
      });
      const resourceSnapshotKeys = new Set(input.resources.map(resourceKey));
      const resourcesToDeactivate = existingResources
        .filter((resource) => !resourceSnapshotKeys.has(resourceKey(resource)))
        .map((resource) => resource.id);
      if (resourcesToDeactivate.length) {
        await tx.nexusBookingResourcePool.updateMany({
          where: { id: { in: resourcesToDeactivate } },
          data: { active: false, sourceVersion: input.version },
        });
      }

      const activeBindingKeys = new Set<string>();
      for (const binding of input.bindings) {
        const resourcePoolId = resourceIdsByKey.get(resourceKey(binding));
        if (!resourcePoolId) throw new NexusResourceCapacitySyncError("binding_not_found");
        const key = `${binding.eventTypeId}:${resourcePoolId}`;
        activeBindingKeys.add(key);
        await tx.nexusEventTypeResourceBinding.upsert({
          where: { eventTypeId_resourcePoolId: { eventTypeId: binding.eventTypeId, resourcePoolId } },
          create: {
            tenantId: scope.tenantId,
            workspaceKey: scope.workspaceKey,
            ownerUserId: scope.ownerUserId,
            externalServiceId: binding.externalServiceId,
            eventTypeId: binding.eventTypeId,
            resourcePoolId,
            units: 1,
            active: binding.active,
            sourceVersion: input.version,
          },
          update: {
            tenantId: scope.tenantId,
            workspaceKey: scope.workspaceKey,
            ownerUserId: scope.ownerUserId,
            externalServiceId: binding.externalServiceId,
            units: 1,
            active: binding.active,
            sourceVersion: input.version,
          },
        });
      }

      const existingBindings = await tx.nexusEventTypeResourceBinding.findMany({
        where: { tenantId: scope.tenantId, workspaceKey: scope.workspaceKey, ownerUserId: scope.ownerUserId },
        select: { id: true, eventTypeId: true, resourcePoolId: true },
      });
      const bindingsToDeactivate = existingBindings
        .filter((binding) => !activeBindingKeys.has(`${binding.eventTypeId}:${binding.resourcePoolId}`))
        .map((binding) => binding.id);
      if (bindingsToDeactivate.length) {
        await tx.nexusEventTypeResourceBinding.updateMany({
          where: { id: { in: bindingsToDeactivate } },
          data: { active: false, sourceVersion: input.version },
        });
      }

      await tx.nexusResourceCapacitySyncState.upsert({
        where: { tenantId_workspaceKey: { tenantId: scope.tenantId, workspaceKey: scope.workspaceKey } },
        create: {
          tenantId: scope.tenantId,
          workspaceKey: scope.workspaceKey,
          ownerUserId: scope.ownerUserId,
          sourceVersion: input.version,
          payloadHash: hash,
        },
        update: {
          ownerUserId: scope.ownerUserId,
          sourceVersion: input.version,
          payloadHash: hash,
        },
      });

      return readback(tx, scope, input.version);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}

export async function syncNexusResourceCapacity(
  rawScope: NexusResourceCapacityScope,
  rawInput: NexusResourceCapacitySyncInput
): Promise<NexusResourceCapacityReadback> {
  const scope = {
    tenantId: uuid.parse(rawScope.tenantId),
    workspaceKey: z.string().trim().min(1).max(100).parse(rawScope.workspaceKey),
    ownerUserId: z.number().int().positive().parse(rawScope.ownerUserId),
  };
  const input = nexusResourceCapacitySyncInputSchema.parse(rawInput);
  const hash = payloadHash(input);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await applySnapshot(scope, input, hash);
    } catch (error) {
      if (error instanceof NexusResourceCapacitySyncError) throw error;
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt === 1
      ) {
        throw error;
      }
    }
  }
  throw new NexusResourceCapacitySyncError("version_conflict");
}
