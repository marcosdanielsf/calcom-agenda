"use client";

import dayjs from "@calcom/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { useGetTheme } from "@calcom/lib/hooks/useTheme";
import classNames from "@calcom/ui/classNames";
import { useMemo } from "react";
import { buildMonthGrid, countBookingsByDay, groupBookingsByDay } from "../lib/calendarRange";
import type { BookingOutput } from "../types";

type BookingMonthViewProps = {
  bookings: BookingOutput[];
  anchor: dayjs.Dayjs;
  weekStart: number;
  onDayClick: (day: dayjs.Dayjs) => void;
};

const MAX_TITLES = 2;

export function BookingMonthView({ bookings, anchor, weekStart, onDayClick }: BookingMonthViewProps) {
  const { i18n } = useLocale();
  const { resolvedTheme, forcedTheme } = useGetTheme();
  const colorKey = !forcedTheme && resolvedTheme === "dark" ? "darkEventTypeColor" : "lightEventTypeColor";
  // Mesmo fuso da grade Dia/Semana, que usa o relógio do navegador
  const timezone = useMemo(() => dayjs.tz.guess(), []);

  const grid = useMemo(() => buildMonthGrid(anchor, weekStart), [anchor, weekStart]);
  const byDay = useMemo(() => groupBookingsByDay(bookings, timezone), [bookings, timezone]);
  const counts = useMemo(() => countBookingsByDay(bookings, timezone), [bookings, timezone]);
  const todayKey = dayjs().format("YYYY-MM-DD");

  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { weekday: "short" }),
    [i18n.language]
  );

  return (
    <div data-testid="booking-month-grid" className="border-subtle overflow-hidden rounded-2xl border">
      <div className="border-subtle bg-muted grid grid-cols-7 border-b">
        {grid[0].map((day) => (
          <div
            key={day.day()}
            className="text-subtle truncate px-1 py-2 text-center text-xs font-medium capitalize">
            {weekdayFormatter.format(day.toDate())}
          </div>
        ))}
      </div>
      {grid.map((row) => (
        <div
          key={row[0].format("YYYY-MM-DD")}
          className="border-subtle grid grid-cols-7 border-b last:border-b-0">
          {row.map((day) => {
            const key = day.format("YYYY-MM-DD");
            const dayBookings = byDay.get(key) ?? [];
            const count = counts.get(key) ?? 0;
            const isToday = key === todayKey;
            const inMonth = day.month() === anchor.month();
            return (
              <button
                type="button"
                key={key}
                data-testid={`booking-month-day-${key}`}
                data-count={count}
                onClick={() => onDayClick(day)}
                className={classNames(
                  "border-subtle hover:bg-subtle flex min-h-16 min-w-0 flex-col items-stretch gap-1 border-r p-1 text-left last:border-r-0 sm:min-h-24 sm:p-2",
                  !inMonth && "opacity-40"
                )}>
                <span className="flex items-center justify-between gap-1">
                  <span
                    className={classNames(
                      "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium",
                      isToday ? "bg-brand-default text-brand" : "text-default"
                    )}>
                    {day.date()}
                  </span>
                  {count > 0 && (
                    <span
                      data-testid="booking-month-count"
                      className="bg-emphasis text-emphasis rounded-full px-1.5 text-xs font-semibold">
                      {count}
                    </span>
                  )}
                </span>
                {dayBookings.slice(0, MAX_TITLES).map((booking) => {
                  const color = booking.eventType?.eventTypeColor?.[colorKey];
                  return (
                    <span
                      key={booking.uid}
                      data-testid="booking-month-title"
                      className={classNames(
                        "bg-subtle text-default hidden truncate rounded px-1 text-xs sm:block",
                        color && "border-l-2 pl-1.5"
                      )}
                      style={color ? { borderLeftColor: color } : undefined}>
                      {booking.title}
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
