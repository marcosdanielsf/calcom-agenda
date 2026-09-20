// Updated: 2026-09-09 08:06 BRT. Server-only authority; no browser tenant/calendar/token.
import { z } from "zod";
import { HttpError } from "../http-error";

const bindingSchema = z.object({
  eventTypeId: z.number().int().positive(),
  username: z.string().min(1),
  slug: z.string().min(1),
  durationMinutes: z.number().int().min(1).max(480),
  token: z.string().regex(/^[A-Za-z0-9_-]{32,200}$/),
}).strict();
type Binding = z.infer<typeof bindingSchema>;
type Selector = { eventTypeId?: number; eventTypeSlug?: string; usernameList?: string[] };
type Environment = Record<string, string | undefined>;
export type AgendaOutcome = { agendaStatus: "confirmed" | "processing" };
export type AgendaStatusOutcome = { agendaStatus: "confirmed" | "processing" | "rejected" };

function fail(statusCode: number, message = "Agenda indisponível"): never {
  throw new HttpError({ statusCode, message });
}

export function usesNexusBooking(env: Environment = process.env) {
  // Partial configuration also fails closed; it never activates the native engine.
  return Boolean(env.NEXUS_BOOKING_MODE || env.NEXUS_BOOKING_ORIGIN || env.NEXUS_BOOKING_BINDINGS || env.NEXT_PUBLIC_NEXUS_BOOKING_ENABLED === "1");
}

export function resolveNexusBinding(selector: Selector, env: Environment = process.env) {
  if (env.NEXUS_BOOKING_MODE !== "nexus") fail(503);
  let bindings: Binding[];
  let origin: URL;
  try {
    origin = new URL(env.NEXUS_BOOKING_ORIGIN ?? "");
    bindings = bindingSchema.array().min(1).parse(JSON.parse(env.NEXUS_BOOKING_BINDINGS ?? ""));
  } catch { return fail(503); }
  const local = env.NODE_ENV !== "production" && origin.hostname === "127.0.0.1";
  if ((!local && origin.protocol !== "https:") || !["http:", "https:"].includes(origin.protocol)
    || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") fail(503);
  if (new Set(bindings.map((b) => b.eventTypeId)).size !== bindings.length
    || new Set(bindings.map((b) => `${b.username}/${b.slug}`)).size !== bindings.length) fail(503);
  const matches = bindings.filter((binding) =>
    (selector.eventTypeId === undefined || binding.eventTypeId === selector.eventTypeId)
    && (selector.eventTypeSlug === undefined || binding.slug === selector.eventTypeSlug)
    && (selector.usernameList === undefined || (selector.usernameList.length === 1 && selector.usernameList[0] === binding.username)));
  if ((!selector.eventTypeId && !(selector.eventTypeSlug && selector.usernameList)) || matches.length !== 1) fail(404);
  return { binding: matches[0], origin: origin.origin };
}

async function request(origin: string, token: string, suffix: string, init?: RequestInit) {
  try {
    return await fetch(`${origin}/api/nexus/agenda/publica/${token}/${suffix}`, {
      ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Never attach the original fetch error: its URL contains the private page token.
    return fail(503, "Não foi possível consultar a agenda. Tente novamente sem alterar os dados.");
  }
}

export async function readNexusBookingStatus(selector: Selector, requestKey: unknown, env: Environment = process.env): Promise<AgendaStatusOutcome> {
  const { binding, origin } = resolveNexusBinding(selector, env);
  if (typeof requestKey !== "string" || !/^[A-Za-z0-9_-]{16,200}$/.test(requestKey)) fail(400, "Tentativa inválida");
  const response = await request(origin, binding.token, "reservations/status", {
    method: "GET", headers: { "idempotency-key": requestKey },
  });
  if (response.status === 404) fail(404, "Reserva não localizada");
  const result = z.object({ success: z.literal(true), status: z.enum(["confirmed", "processing", "rejected"]) }).safeParse(await response.json().catch(() => null));
  if (response.status !== 200 || !result.success) fail(503, "Não foi possível consultar a reserva. Tente verificar novamente.");
  return { agendaStatus: result.data.status };
}

const availabilitySchema = z.object({
  success: z.literal(true), timezone: z.string(),
  slots: z.array(z.object({ startAt: z.string().datetime({ offset: true }), endAt: z.string().datetime({ offset: true }).nullable() })),
});

export async function getNexusSchedule(input: Selector & {
  startTime: string; endTime: string; timeZone?: string; duration?: number | "" | null;
  rescheduleUid?: string | null; isTeamEvent?: boolean;
}, env: Environment = process.env) {
  const { binding, origin } = resolveNexusBinding(input, env);
  if (input.rescheduleUid || input.isTeamEvent || (input.duration && input.duration !== binding.durationMinutes)) fail(400, "Esta opção ainda não está disponível nesta agenda.");
  const start = Date.parse(input.startTime), end = Date.parse(input.endTime);
  const day = 86_400_000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 93 * day) fail(400, "Período inválido");
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { return fail(400, "Fuso horário inválido"); }
  // Preserve the native optional slot shape for shared consumers. The Nexus
  // response still emits only time, never synthetic absence/user information.
  const slots: Record<string, {
    time: string; attendees?: number; bookingUid?: string;
    away?: boolean;
    toUser?: { id: number; username: string | null; displayName: string | null };
    showNotePublicly?: boolean;
  }[]> = {};
  const seen = new Set<string>();
  for (let cursor = start; cursor < end; cursor += 31 * day) {
    const query = new URLSearchParams({ startAt: new Date(cursor).toISOString(), endAt: new Date(Math.min(end, cursor + 31 * day)).toISOString() });
    const response = await request(origin, binding.token, `availability?${query}`);
    const parsed = availabilitySchema.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success) fail(502, "Não foi possível consultar os horários");
    for (const slot of parsed.data.slots) {
      const time = new Date(slot.startAt).toISOString();
      if (Date.parse(time) < start || Date.parse(time) >= end || seen.has(time)) continue;
      if (slot.endAt && Date.parse(slot.endAt) - Date.parse(time) !== binding.durationMinutes * 60_000) fail(502);
      seen.add(time);
      const parts = formatter.formatToParts(new Date(time));
      const part = (type: string) => parts.find((p) => p.type === type)?.value;
      const date = `${part("year")}-${part("month")}-${part("day")}`;
      (slots[date] ??= []).push({ time });
    }
  }
  for (const values of Object.values(slots)) values.sort((a, b) => a.time.localeCompare(b.time));
  return { slots };
}

const submissionSchema = z.object({
  eventTypeId: z.number().int().positive(), eventTypeSlug: z.string().optional(),
  start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }).optional(),
  responses: z.object({
    name: z.union([z.string().trim().min(1).max(200), z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().optional() })]),
    email: z.string().email().max(254),
    attendeePhoneNumber: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
    nexusTransactionalMessages: z.literal(true),
  }),
  rescheduleUid: z.string().nullish(), recurringEventId: z.string().nullish(), bookingUid: z.string().nullish(),
  _isDryRun: z.boolean().optional(),
});

export async function submitNexusBooking(body: unknown, requestKey: unknown, env: Environment = process.env): Promise<AgendaOutcome> {
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success || typeof requestKey !== "string" || !/^[A-Za-z0-9_-]{16,200}$/.test(requestKey)) fail(400, "Preencha nome, e-mail, telefone internacional e autorização de mensagens.");
  const data = parsed.data;
  const { binding, origin } = resolveNexusBinding(data, env);
  if (data.rescheduleUid || data.recurringEventId || data.bookingUid || data._isDryRun) fail(400, "Esta opção ainda não está disponível nesta agenda.");
  const endAt = new Date(Date.parse(data.start) + binding.durationMinutes * 60_000).toISOString();
  if (data.end && Date.parse(data.end) !== Date.parse(endAt)) fail(400, "Duração inválida");
  // Strict presentation-boundary projection: metadata, tenant and calendar inputs are never forwarded.
  const payload = {
    contact: { name: typeof data.responses.name === "string" ? data.responses.name : [data.responses.name.firstName, data.responses.name.lastName].filter(Boolean).join(" "), phone: data.responses.attendeePhoneNumber, email: data.responses.email },
    slot: { startAt: new Date(data.start).toISOString(), endAt },
    consent: { transactionalMessages: true },
  };
  const response = await request(origin, binding.token, "reservations", {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": requestKey }, body: JSON.stringify(payload),
  });
  const result: unknown = await response.json().catch(() => null);
  const outcome = z.object({ success: z.literal(true), status: z.enum(["confirmed", "processing"]) }).safeParse(result);
  if (response.status === 409) fail(409, "Horário indisponível. Selecione outro horário.");
  if (response.status === 400) fail(400, "Dados da reserva inválidos");
  if (!outcome.success || (response.status !== 201 && response.status !== 202)
    || (response.status === 201) !== (outcome.data.status === "confirmed")) fail(503, "Não foi possível confirmar a reserva. Tente novamente sem alterar os dados.");
  return { agendaStatus: outcome.data.status };
}
