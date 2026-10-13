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
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).formatRange(
    window.start.toDate(),
    window.end.toDate()
  );
}
