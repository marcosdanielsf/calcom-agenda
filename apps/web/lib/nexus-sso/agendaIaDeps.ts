// Criado: 2026-11-02 BRT. Ligacao real das operacoes da IA com o cal.com (slots, reserva, cancelamento, Prisma).
// Imports tardios: carregar o servico de reserva no topo puxaria a cadeia inteira de apps.
import prisma from "@calcom/prisma";
import type { AgendaIaBooking, AgendaIaDeps } from "./agendaIa";

export function createAgendaIaDeps(): AgendaIaDeps {
  return {
    async eventTypeOwner(eventTypeId) {
      const row = await prisma.eventType.findUnique({ where: { id: eventTypeId }, select: { userId: true } });
      return row?.userId ?? null;
    },
    async slots(input) {
      const { getAvailableSlotsService } = await import("@calcom/features/di/containers/AvailableSlots");
      const result = await getAvailableSlotsService().getAvailableSlots({
        ctx: undefined,
        input: { eventTypeId: input.eventTypeId, startTime: input.startTime, endTime: input.endTime, timeZone: input.timeZone, isTeamEvent: false },
      } as never);
      return (result as { slots: Record<string, { time: string }[]> }).slots;
    },
    async createBooking(input) {
      const { getRegularBookingService } = await import("@calcom/features/bookings/di/RegularBookingService.container");
      const { CreationSource } = await import("@calcom/prisma/enums");
      const booking = await getRegularBookingService().createBooking({
        bookingData: {
          eventTypeId: input.eventTypeId,
          start: input.start,
          timeZone: input.timeZone,
          language: "pt-BR",
          metadata: { nexusOrigin: "agenda_ia" },
          creationSource: CreationSource.WEBAPP,
          ...(input.rescheduleUid ? { rescheduleUid: input.rescheduleUid } : {}),
          responses: {
            name: input.name,
            email: input.email,
            guests: [],
            ...(input.phone ? { attendeePhoneNumber: input.phone } : {}),
            ...(input.notes ? { notes: input.notes } : {}),
          },
        } as never,
        // Sem skip: a IA respeita disponibilidade, limites e antecedencia como a pagina publica.
        bookingMeta: { userId: input.ownerId, hostname: "" },
      });
      return { uid: booking.uid ?? null };
    },
    async cancelBooking(input) {
      const { default: handleCancelBooking } = await import("@calcom/features/bookings/lib/handleCancelBooking");
      const result = await handleCancelBooking({
        bookingData: { uid: input.uid, cancellationReason: input.reason ?? "Cancelado pelo atendimento", cancelledBy: undefined } as never,
        userId: input.ownerId,
      });
      return { success: !!result.success };
    },
    async findBookings(input) {
      const phoneVariants = input.phone ? [input.phone, input.phone.replace(/^\+/, "")] : [];
      const rows = await prisma.booking.findMany({
        where: {
          userId: input.ownerId,
          ...(input.uid ? { uid: input.uid } : { status: { in: ["ACCEPTED", "PENDING"] }, endTime: { gte: input.now } }),
          ...(input.email || input.phone
            ? {
                attendees: {
                  some: {
                    OR: [
                      ...(input.email ? [{ email: { equals: input.email, mode: "insensitive" as const } }] : []),
                      ...(phoneVariants.length ? [{ phoneNumber: { in: phoneVariants } }] : []),
                    ],
                  },
                },
              }
            : {}),
        },
        orderBy: { startTime: "asc" },
        take: 20,
        select: {
          uid: true, startTime: true, endTime: true, status: true, title: true, eventTypeId: true,
          attendees: { select: { name: true, email: true, phoneNumber: true }, take: 1 },
        },
      });
      return rows.map((row): AgendaIaBooking => {
        const a = row.attendees[0];
        return {
          uid: row.uid, startTime: row.startTime.toISOString(), endTime: row.endTime.toISOString(), status: String(row.status).toLowerCase(),
          title: row.title, eventTypeId: row.eventTypeId,
          attendee: a ? { name: a.name, email: a.email, ...(a.phoneNumber ? { phone: a.phoneNumber } : {}) } : null,
        };
      });
    },
  };
}
