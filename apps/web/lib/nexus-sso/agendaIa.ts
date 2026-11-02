// Criado: 2026-11-02 BRT. Operacoes que o agente de IA do Nexus faz na agenda do dono da subconta: ler horarios livres,
// reservar, listar, remarcar e cancelar. Servidor a servidor (rota /api/nexus/agenda-ia). So tipo de agendamento pessoal
// do proprio dono: tipo de outra conta responde como inexistente, igual ao createByOwner.
import { z } from "zod";

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "data invalida");
const timeZone = z.string().min(1).max(64).default("America/Sao_Paulo");
const phone = z.string().regex(/^\+[1-9][0-9]{7,14}$/);

export const nexusAgendaIaInputSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("slots"), eventTypeId: z.number().int().positive(), startTime: isoDate, endTime: isoDate, timeZone }).strict(),
  z
    .object({
      op: z.literal("book"),
      eventTypeId: z.number().int().positive(),
      start: isoDate,
      timeZone,
      attendee: z.object({ name: z.string().trim().min(1).max(200), email: z.string().email().max(254), phone: phone.optional() }).strict(),
      notes: z.string().max(2000).optional(),
    })
    .strict(),
  z.object({ op: z.literal("list"), email: z.string().email().max(254).optional(), phone: phone.optional() }).strict(),
  z.object({ op: z.literal("reschedule"), uid: z.string().min(8).max(64), start: isoDate, timeZone }).strict(),
  z.object({ op: z.literal("cancel"), uid: z.string().min(8).max(64), reason: z.string().max(500).optional() }).strict(),
]);
export type NexusAgendaIaInput = z.infer<typeof nexusAgendaIaInputSchema>;

export class NexusAgendaIaError extends Error {
  constructor(public readonly code: "not_found" | "slot_unavailable" | "failed", public readonly status: number) {
    super(code);
  }
}

export type AgendaIaBooking = { uid: string; startTime: string; endTime: string; status: string; title: string; eventTypeId: number | null; attendee: { name: string; email: string; phone?: string } | null };

export interface AgendaIaDeps {
  /** Dono do tipo de agendamento, ou null quando ele nao existe. */
  eventTypeOwner(eventTypeId: number): Promise<number | null>;
  slots(input: { eventTypeId: number; startTime: string; endTime: string; timeZone: string }): Promise<Record<string, { time: string }[]>>;
  createBooking(input: { ownerId: number; eventTypeId: number; start: string; timeZone: string; name: string; email: string; phone?: string; notes?: string; rescheduleUid?: string }): Promise<{ uid: string | null }>;
  cancelBooking(input: { ownerId: number; uid: string; reason?: string }): Promise<{ success: boolean }>;
  /** Reservas futuras do dono em que a pessoa participa, por e-mail ou telefone. */
  findBookings(input: { ownerId: number; email?: string; phone?: string; uid?: string; now: Date }): Promise<AgendaIaBooking[]>;
  now?: () => Date;
}

const MAX_RANGE_MS = 31 * 86_400_000;

export async function runNexusAgendaIaOp(ownerId: number, input: NexusAgendaIaInput, deps: AgendaIaDeps) {
  const now = (deps.now ?? (() => new Date()))();
  const owns = async (eventTypeId: number) => {
    if ((await deps.eventTypeOwner(eventTypeId)) !== ownerId) throw new NexusAgendaIaError("not_found", 404);
  };
  switch (input.op) {
    case "slots": {
      const start = Date.parse(input.startTime), end = Date.parse(input.endTime);
      if (end <= start || end - start > MAX_RANGE_MS) throw new NexusAgendaIaError("failed", 400);
      await owns(input.eventTypeId);
      const byDay = await deps.slots(input);
      const times = Object.values(byDay).flat().map((slot) => new Date(slot.time).toISOString());
      return { slots: Array.from(new Set(times)).filter((t) => Date.parse(t) > now.getTime()).sort() };
    }
    case "book": {
      await owns(input.eventTypeId);
      if (Date.parse(input.start) <= now.getTime()) throw new NexusAgendaIaError("slot_unavailable", 409);
      const booking = await create(deps, ownerId, input.eventTypeId, input);
      return { uid: booking.uid };
    }
    case "list":
      if (!input.email && !input.phone) throw new NexusAgendaIaError("failed", 400);
      return { bookings: await deps.findBookings({ ownerId, email: input.email, phone: input.phone, now }) };
    case "reschedule": {
      const [current] = await deps.findBookings({ ownerId, uid: input.uid, now: new Date(0) });
      if (!current || current.eventTypeId === null) throw new NexusAgendaIaError("not_found", 404);
      if (Date.parse(input.start) <= now.getTime()) throw new NexusAgendaIaError("slot_unavailable", 409);
      if (!current.attendee) throw new NexusAgendaIaError("not_found", 404);
      const booking = await create(deps, ownerId, current.eventTypeId, { start: input.start, timeZone: input.timeZone, attendee: current.attendee, rescheduleUid: input.uid });
      return { uid: booking.uid };
    }
    case "cancel": {
      const [current] = await deps.findBookings({ ownerId, uid: input.uid, now: new Date(0) });
      if (!current) throw new NexusAgendaIaError("not_found", 404);
      const done = await deps.cancelBooking({ ownerId, uid: input.uid, reason: input.reason });
      if (!done.success) throw new NexusAgendaIaError("failed", 502);
      return { uid: input.uid, status: "cancelled" };
    }
  }
}

async function create(
  deps: AgendaIaDeps,
  ownerId: number,
  eventTypeId: number,
  data: { start: string; timeZone: string; attendee: { name: string; email: string; phone?: string }; notes?: string; rescheduleUid?: string }
) {
  try {
    const booking = await deps.createBooking({
      ownerId, eventTypeId, start: data.start, timeZone: data.timeZone, name: data.attendee.name, email: data.attendee.email,
      phone: data.attendee.phone, notes: data.notes, rescheduleUid: data.rescheduleUid,
    });
    if (!booking.uid) throw new NexusAgendaIaError("failed", 502);
    return booking as { uid: string };
  } catch (e) {
    if (e instanceof NexusAgendaIaError) throw e;
    // O cal.com recusa horario ocupado ou fora da janela com erro de dominio (HttpError 409/400): vira horario indisponivel.
    const status = typeof (e as { statusCode?: unknown })?.statusCode === "number" ? (e as { statusCode: number }).statusCode : 0;
    if (status === 409 || status === 400) throw new NexusAgendaIaError("slot_unavailable", 409);
    throw new NexusAgendaIaError("failed", 502);
  }
}
