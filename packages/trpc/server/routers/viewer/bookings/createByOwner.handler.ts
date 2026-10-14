// Criado: 2026-10-13 22:3x BRT. O dono do tipo de agendamento (tipo pessoal) cria uma reserva de dentro
// da agenda, como no Google Agenda: sem trava de disponibilidade, de limite de reservas nem de antecedência.
// O cliente recebe os mesmos e-mails e o evento vai para o calendário conectado como qualquer reserva.
import type { CreateRegularBookingData } from "@calcom/features/bookings/lib/dto/types";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { usesNexusBooking } from "@calcom/lib/nexus-booking/server";
import { prisma } from "@calcom/prisma";
import { CreationSource } from "@calcom/prisma/enums";
import { TRPCError } from "@trpc/server";
import type { TrpcSessionUser } from "../../../types";
import type { TCreateByOwnerInputSchema } from "./createByOwner.schema";

type CreateByOwnerOptions = {
  ctx: {
    user: Pick<NonNullable<TrpcSessionUser>, "id" | "locale">;
    req?: { headers?: { host?: string } };
  };
  input: TCreateByOwnerInputSchema;
};

export const NEXUS_OWNER_BOOKING_ORIGIN = "agenda_grid";

export async function createByOwnerHandler({ ctx, input }: CreateByOwnerOptions) {
  // Com o motor em modo Nexus a reserva pública vai para o Nexus; esta rota só sabe gravar no motor nativo.
  if (usesNexusBooking()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "agenda_new_booking_unavailable_in_nexus_mode",
    });
  }
  await checkRateLimitAndThrowError({ rateLimitingType: "core", identifier: `createByOwner:${ctx.user.id}` });

  // Só tipo pessoal do próprio usuário: em tipo de equipe o serviço sortearia outro anfitrião com a
  // disponibilidade pulada, e a reserva sumiria da grade de quem criou.
  const eventType = await prisma.eventType.findUnique({
    where: { id: input.eventTypeId },
    select: { id: true, userId: true },
  });
  // Tipo de outra conta responde como inexistente: não revela que o id existe.
  if (!eventType || eventType.userId !== ctx.user.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "event_type_not_found" });
  }

  const { attendee, notes } = input;
  const bookingData: CreateRegularBookingData & { responses: Record<string, unknown> } = {
    eventTypeId: input.eventTypeId,
    start: input.start,
    end: input.end,
    timeZone: input.timeZone,
    language: ctx.user.locale ?? "pt-BR",
    metadata: { nexusOrigin: NEXUS_OWNER_BOOKING_ORIGIN },
    creationSource: CreationSource.WEBAPP,
    noEmail: input.notifyAttendee === false,
    responses: {
      name: attendee.name,
      email: attendee.email,
      guests: [],
      ...(attendee.phoneNumber ? { attendeePhoneNumber: attendee.phoneNumber } : {}),
      ...(notes ? { notes } : {}),
    },
  };

  // Import tardio: carregar o serviço de reserva no topo puxaria a cadeia inteira de apps ao montar o router.
  const { getRegularBookingService } = await import(
    "@calcom/features/bookings/di/RegularBookingService.container"
  );
  const booking = await getRegularBookingService().createBooking({
    bookingData,
    bookingMeta: {
      userId: ctx.user.id,
      hostname: ctx.req?.headers?.host ?? "",
      skipAvailabilityCheck: true,
      skipEventLimitsCheck: true,
      isOwnerBooking: true,
    },
  });

  return { uid: booking.uid ?? null, id: booking.id ?? null };
}
