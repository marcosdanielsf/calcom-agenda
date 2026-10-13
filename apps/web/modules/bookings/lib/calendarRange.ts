import type { Dayjs } from "@calcom/dayjs";
import dayjs from "@calcom/dayjs";
import { getWeekStart } from "./weekUtils";

export const CALENDAR_RANGES = ["day", "week", "month"] as const;

export type CalendarRange = (typeof CALENDAR_RANGES)[number];

type BookingWithStart = { startTime: string | Date };

export function getMonthGridStart(anchor: Dayjs, weekStart: number): Dayjs {
  return getWeekStart(anchor.startOf("month"), weekStart);
}

export function getRangeWindow(
  range: CalendarRange,
  anchor: Dayjs,
  weekStart: number
): { start: Dayjs; end: Dayjs } {
  if (range === "day") {
    return { start: anchor.startOf("day"), end: anchor.endOf("day") };
  }
  if (range === "week") {
    const start = getWeekStart(anchor, weekStart);
    return { start, end: start.add(6, "day").endOf("day") };
  }
  const grid = buildMonthGrid(anchor, weekStart);
  return { start: grid[0][0].startOf("day"), end: grid[grid.length - 1][6].endOf("day") };
}

export function shiftAnchor(range: CalendarRange, anchor: Dayjs, direction: 1 | -1): Dayjs {
  const unit = range === "month" ? "month" : range === "week" ? "week" : "day";
  return anchor.add(direction, unit);
}

export function buildMonthGrid(month: Dayjs, weekStart: number): Dayjs[][] {
  const first = getMonthGridStart(month, weekStart);
  const lastDay = month.endOf("month");
  const rows: Dayjs[][] = [];
  let cursor = first;
  while (!cursor.isAfter(lastDay, "day")) {
    rows.push(Array.from({ length: 7 }, (_, i) => cursor.add(i, "day")));
    cursor = cursor.add(7, "day");
  }
  return rows;
}

export function groupBookingsByDay<T extends BookingWithStart>(
  bookings: T[],
  timezone: string
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const booking of bookings) {
    const key = dayjs(booking.startTime).tz(timezone).format("YYYY-MM-DD");
    const list = grouped.get(key);
    if (list) list.push(booking);
    else grouped.set(key, [booking]);
  }
  return grouped;
}

export function countBookingsByDay(bookings: BookingWithStart[], timezone: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [key, list] of groupBookingsByDay(bookings, timezone)) {
    counts.set(key, list.length);
  }
  return counts;
}

const RANGE_JOINERS: Record<string, string> = { pt: "a", en: "to", es: "al", fr: "au", de: "bis", it: "al" };

export function formatRangeLabel(
  range: CalendarRange,
  window: { start: Dayjs; end: Dayjs },
  anchor: Dayjs,
  locale: string
): string {
  if (range === "month") {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(anchor.toDate());
  }
  if (range === "day") {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(anchor.toDate());
  }
  const format = (date: Dayjs, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, opts).format(date.toDate());
  const joiner = RANGE_JOINERS[locale.split("-")[0].toLowerCase()] ?? "-";
  // Mesmo ano: o ano aparece só no fim. formatRange geraria travessão (U+2013)
  const sameMonth = window.start.isSame(window.end, "month");
  const sameYear = window.start.isSame(window.end, "year");
  const endLabel = format(window.end, { dateStyle: "medium" });
  // Em idiomas com dia primeiro ("17 de out. de 2026") o início do mesmo mês é só o dia
  const dayFirst = /^\d/.test(endLabel);
  const startLabel =
    sameMonth && dayFirst
      ? format(window.start, { day: "numeric" })
      : sameYear
        ? format(window.start, { day: "numeric", month: "short" })
        : format(window.start, { dateStyle: "medium" });
  return `${startLabel} ${joiner} ${endLabel}`;
}

// Intervalo da consulta: o handler filtra por endTime <= beforeEndDate, então uma reserva que começa
// no fim da janela e termina depois da meia-noite sumiria. A visão descarta o excedente pelo início.
export function getFetchEndDate(windowEnd: Dayjs): string {
  return windowEnd.add(1, "day").toISOString();
}
