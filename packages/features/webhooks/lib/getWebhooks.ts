import { withReporting } from "@calcom/lib/sentryWrapper";
import defaultPrisma from "@calcom/prisma";
import type { PrismaClient } from "@calcom/prisma";
import type { WebhookTriggerEvents } from "@calcom/prisma/enums";

import type { WebhookSubscriber } from "./dto/types";
import { WebhookOutputMapper } from "./infrastructure/mappers/WebhookOutputMapper";

export type GetSubscriberOptions = {
  userId?: number | null;
  eventTypeId?: number | null;
  triggerEvent: WebhookTriggerEvents;
  teamId?: number | number[] | null;
  orgId?: number | null;
  oAuthClientId?: string | null;
};

const getWebhooks = async (
  options: GetSubscriberOptions,
  prisma: PrismaClient = defaultPrisma
): Promise<WebhookSubscriber[]> => {
  const teamId = options.teamId;
  const userId = options.userId ?? 0;
  const eventTypeId = options.eventTypeId ?? 0;
  const teamIds = Array.isArray(teamId) ? teamId : [teamId ?? 0];
  const orgId = options.orgId ?? 0;
  const oAuthClientId = options.oAuthClientId ?? "";

  const managedChildEventType = await prisma.eventType.findFirst({
    where: {
      id: eventTypeId,
      parentId: {
        not: null,
      },
    },
    select: {
      parentId: true,
    },
  });

  const managedParentEventTypeId = managedChildEventType?.parentId ?? 0;

  // if we have userId and teamId it is a managed event type and should trigger for team and user
  const allWebhooks = await prisma.webhook.findMany({
    where: {
      OR: [
        {
          platform: true,
        },
        {
          userId,
        },
        {
          eventTypeId,
        },
        {
          eventTypeId: managedParentEventTypeId,
        },
        {
          teamId: {
            in: [...teamIds, orgId],
          },
        },
        { platformOAuthClientId: oAuthClientId },
      ],
      AND: {
        eventTriggers: {
          has: options.triggerEvent,
        },
        active: {
          equals: true,
        },
      },
    },
    select: {
      id: true,
      subscriberUrl: true,
      payloadTemplate: true,
      appId: true,
      secret: true,
      time: true,
      timeUnit: true,
      eventTriggers: true,
      version: true,
    },
  });

  // Webhook de usuario e de tipo de evento apontando para o mesmo destino, com o mesmo segredo e
  // modelo, entregariam o mesmo aviso duas vezes. Entrega identica vira uma so.
  const seen = new Set<string>();
  const unique = allWebhooks.filter((w) => {
    const key = JSON.stringify([w.subscriberUrl, w.secret, w.payloadTemplate, w.appId, w.version]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.map(WebhookOutputMapper.toSubscriberPartial);
};

export default withReporting(getWebhooks, "getWebhooks");
