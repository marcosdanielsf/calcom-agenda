// Criado: 2026-10-13 22:3x BRT. Reserva criada pelo dono da agenda a partir da grade (clique na célula vazia).
import { timeZoneSchema } from "@calcom/lib/dayjs/timeZone.schema";
import { z } from "zod";

export const ZCreateByOwnerInputSchema = z
  .object({
    eventTypeId: z.number().int().positive(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    timeZone: timeZoneSchema,
    attendee: z.object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().max(254),
      phoneNumber: z
        .string()
        .trim()
        .regex(/^\+[1-9]\d{7,14}$/, "agenda_new_booking_phone_invalid")
        .optional(),
    }),
    notes: z.string().trim().max(2000).optional(),
    /** Falso = sem e-mail de confirmação (reserva registrada depois do fato, por exemplo). Padrão: avisa. */
    notifyAttendee: z.boolean().optional(),
  })
  .refine((input) => new Date(input.end).getTime() > new Date(input.start).getTime(), {
    message: "agenda_new_booking_end_before_start",
    path: ["end"],
  });

export type TCreateByOwnerInputSchema = z.infer<typeof ZCreateByOwnerInputSchema>;
