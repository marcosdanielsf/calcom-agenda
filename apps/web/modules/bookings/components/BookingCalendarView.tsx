"use client";

import dayjs from "@calcom/dayjs";
import { useTimePreferences } from "@calcom/features/bookings/lib";
import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";
import { useIsomorphicLayoutEffect } from "@calcom/lib/hooks/useIsomorphicLayoutEffect";
import { useGetTheme } from "@calcom/lib/hooks/useTheme";
import { Calendar } from "@calcom/web/modules/calendars/weeklyview/components/Calendar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGoogleBusyEvents } from "../hooks/useGoogleBusyEvents";
import { withTimeState } from "../lib/eventTimeState";
import { NEW_BOOKING_GRID_STEP_MINUTES } from "../lib/newBooking";
import { useBookingDetailsSheetStore } from "../store/bookingDetailsSheetStore";
import type { BookingOutput } from "../types";

// Folga entre a grade e o fim da tela, igual ao respiro lateral da casca do Nexus (sm:p-6).
const GRID_BOTTOM_GAP_PX = 24;
const GRID_MIN_HEIGHT_PX = 320;
const NOW_TICK_MS = 60_000;

type BookingCalendarViewProps = {
  bookings: BookingOutput[];
  rangeStart: dayjs.Dayjs;
  dayCount: number;
  /** Clique numa célula vazia da grade (como no Google Agenda) abre o novo agendamento naquele horário */
  onEmptyCellClick?: (start: Date) => void;
};

export function BookingCalendarView({
  bookings,
  rangeStart,
  dayCount,
  onEmptyCellClick,
}: BookingCalendarViewProps) {
  const setSelectedBookingUid = useBookingDetailsSheetStore((state) => state.setSelectedBookingUid);
  const selectedBookingUid = useBookingDetailsSheetStore((state) => state.selectedBookingUid);
  const { timezone } = useTimePreferences();
  const { resolvedTheme, forcedTheme } = useGetTheme();

  // A grade ocupa a tela até embaixo: altura medida a partir de onde ela começa, não um desconto fixo.
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState<number | null>(null);
  useIsomorphicLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const top = grid.getBoundingClientRect().top + window.scrollY;
      setGridHeight(Math.max(GRID_MIN_HEIGHT_PX, Math.floor(window.innerHeight - top - GRID_BOTTOM_GAP_PX)));
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);

  // Relógio da grade: o compromisso que termina com a tela aberta passa a aparecer como concluído.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const startDate = useMemo(() => rangeStart.toDate(), [rangeStart]);
  const endDate = useMemo(() => rangeStart.add(dayCount - 1, "day").toDate(), [rangeStart, dayCount]);

  const googleBusyEvents = useGoogleBusyEvents({ rangeStart, dayCount, timezone, bookings });

  const events = useMemo<CalendarEvent[]>(() => {
    const hasDarkTheme = !forcedTheme && resolvedTheme === "dark";

    const bookingEvents = bookings
      .filter((booking) => {
        const bookingStart = dayjs(booking.startTime);
        return (
          (bookingStart.isAfter(rangeStart) || bookingStart.isSame(rangeStart)) &&
          bookingStart.isBefore(rangeStart.add(dayCount, "day"))
        );
      })
      .sort((a, b) => {
        const startDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        if (startDiff !== 0) return startDiff;
        return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
      })
      .map((booking, idx) => {
        // Parse eventTypeColor and extract the appropriate color based on theme
        const eventTypeColor =
          booking.eventType?.eventTypeColor &&
          booking.eventType.eventTypeColor[hasDarkTheme ? "darkEventTypeColor" : "lightEventTypeColor"];

        return {
          id: idx,
          title: booking.title,
          start: new Date(booking.startTime),
          end: new Date(booking.endTime),
          options: {
            status: booking.status,
            ...(eventTypeColor && { color: eventTypeColor }),
            bookingUid: booking.uid,
          },
        };
      });

    return withTimeState([...bookingEvents, ...googleBusyEvents], now);
  }, [bookings, googleBusyEvents, rangeStart, dayCount, resolvedTheme, forcedTheme, now]);

  return (
    <>
      <div
        ref={gridRef}
        data-testid="booking-calendar-grid"
        className="border-subtle flex min-h-80 flex-1 flex-col overflow-y-auto overflow-x-auto rounded-2xl border"
        style={{ height: gridHeight === null ? "calc(100dvh - 12rem)" : `${gridHeight}px` }}>
        <Calendar
          timezone={timezone}
          sortEvents
          startHour={0}
          endHour={23}
          events={events}
          startDate={startDate}
          endDate={endDate}
          gridCellsPerHour={4}
          hoverEventDuration={onEmptyCellClick ? NEW_BOOKING_GRID_STEP_MINUTES : 0}
          onEmptyCellClick={onEmptyCellClick}
          showBackgroundPattern={false}
          highlightToday
          showBorder={false}
          borderColor="subtle"
          selectedBookingUid={selectedBookingUid}
          onEventClick={(event) => {
            const bookingUid = event.options?.bookingUid;
            if (bookingUid) {
              setSelectedBookingUid(bookingUid);
            }
          }}
          showTimezone
          mobileSupported
          hideHeader
          updateCurrentTimeOnFocus
        />
      </div>
    </>
  );
}
