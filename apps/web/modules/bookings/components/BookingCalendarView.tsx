"use client";

import dayjs from "@calcom/dayjs";
import { useTimePreferences } from "@calcom/features/bookings/lib";
import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";
import { useGetTheme } from "@calcom/lib/hooks/useTheme";
import { Calendar } from "@calcom/web/modules/calendars/weeklyview/components/Calendar";
import { useBanners } from "@calcom/web/modules/shell/banners/useBanners";
import { useNexusShell } from "@calcom/web/modules/shell/NexusShell";
import { useMemo } from "react";
import { useGoogleBusyEvents } from "../hooks/useGoogleBusyEvents";
import { NEW_BOOKING_GRID_STEP_MINUTES } from "../lib/newBooking";
import { useBookingDetailsSheetStore } from "../store/bookingDetailsSheetStore";
import type { BookingOutput } from "../types";

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
  const { bannersHeight } = useBanners();

  const nexus = useNexusShell();

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

    return [...bookingEvents, ...googleBusyEvents];
  }, [bookings, googleBusyEvents, rangeStart, dayCount, resolvedTheme, forcedTheme]);

  return (
    <>
      <div
        data-testid="booking-calendar-grid"
        className="border-subtle flex min-h-80 flex-1 flex-col overflow-y-auto overflow-x-auto rounded-2xl border"
        style={{ height: `calc(100dvh - ${nexus ? "12rem" : "6rem"} - ${bannersHeight}px)` }}>
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
