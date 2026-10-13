import dayjs from "@calcom/dayjs";
import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";

export type CalendarToLoad = { credentialId: number; externalId: string };

type ConnectedCalendarsInput = {
  credentialId: number;
  calendars?: { externalId: string; isSelected?: boolean; primary?: boolean | null }[];
}[];

type BusyInput = { start: Date | string; end: Date | string; title?: string | null };

// Ids dos blocos do Google ficam longe dos ids das reservas (índice 0..n) para o layout de sobreposição não confundir os dois.
export const GOOGLE_BUSY_ID_OFFSET = 1_000_000;

/**
 * Calendários a consultar: os marcados como selecionados de cada credencial.
 * Se uma credencial não tem nenhum selecionado, entra o principal dela.
 */
export function pickCalendarsToLoad(connected: ConnectedCalendarsInput | undefined): CalendarToLoad[] {
  const result: CalendarToLoad[] = [];
  for (const item of connected ?? []) {
    const calendars = item.calendars ?? [];
    const selected = calendars.filter((cal) => cal.isSelected);
    const chosen = selected.length > 0 ? selected : calendars.filter((cal) => cal.primary);
    for (const cal of chosen) {
      result.push({ credentialId: item.credentialId, externalId: cal.externalId });
    }
  }
  return result;
}

type BuildOptions = {
  rangeStart: dayjs.Dayjs;
  dayCount: number;
  timezone: string;
  label: string;
  /** Reservas já exibidas: o Google repete cada reserva como evento, então o bloco idêntico é descartado. */
  bookings?: { startTime: string | Date; endTime: string | Date }[];
};

/**
 * Resposta do overlay -> eventos da grade. Recorta no intervalo visível e parte
 * evento que cruza a meia-noite (no fuso de exibição), porque a grade agrupa por dia de início.
 */
export function buildGoogleBusyEvents(busy: BusyInput[] | undefined, options: BuildOptions): CalendarEvent[] {
  const { rangeStart, dayCount, timezone, label, bookings = [] } = options;
  if (!busy || busy.length === 0) return [];

  const windowStart = rangeStart.valueOf();
  const windowEnd = rangeStart.add(dayCount, "day").valueOf();
  const bookingKeys = new Set(
    bookings.map((booking) => `${new Date(booking.startTime).getTime()}-${new Date(booking.endTime).getTime()}`)
  );

  const events: CalendarEvent[] = [];
  for (const item of busy) {
    const startMs = new Date(item.start).getTime();
    const endMs = new Date(item.end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) continue;
    if (bookingKeys.has(`${startMs}-${endMs}`)) continue;

    const from = Math.max(startMs, windowStart);
    const to = Math.min(endMs, windowEnd);
    if (to <= from) continue;

    const title = item.title?.trim() || label;
    let cursor = from;
    while (cursor < to) {
      const nextMidnight = dayjs(cursor).tz(timezone).add(1, "day").startOf("day").valueOf();
      const pieceEnd = Math.min(to, nextMidnight);
      events.push({
        id: GOOGLE_BUSY_ID_OFFSET + events.length,
        title,
        start: new Date(cursor),
        end: new Date(pieceEnd),
        source: "google-busy",
        options: {
          borderOnly: true,
          className: "!bg-muted !text-subtle",
          "data-test-id": "google-busy-event",
        },
      });
      cursor = pieceEnd;
    }
  }
  return events;
}
