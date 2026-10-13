import type dayjs from "@calcom/dayjs";
import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { useMemo } from "react";
import { buildGoogleBusyEvents, pickCalendarsToLoad } from "../lib/googleBusy";
import type { BookingOutput } from "../types";

type Params = {
  rangeStart: dayjs.Dayjs;
  dayCount: number;
  timezone: string;
  bookings: BookingOutput[];
};

/** Horários ocupados do Google Agenda conectado, no intervalo visível, como eventos da grade. */
export function useGoogleBusyEvents({ rangeStart, dayCount, timezone, bookings }: Params): CalendarEvent[] {
  const { t } = useLocale();

  const { data: connected } = trpc.viewer.calendars.connectedCalendars.useQuery(
    { skipSync: true },
    { staleTime: 10 * 60 * 1000 }
  );
  const calendarsToLoad = useMemo(() => pickCalendarsToLoad(connected?.connectedCalendars), [connected]);

  const dateFrom = rangeStart.toISOString();
  const dateTo = rangeStart.add(dayCount, "day").toISOString();

  const { data: busy } = trpc.viewer.availability.calendarOverlay.useQuery(
    { loggedInUsersTz: timezone, dateFrom, dateTo, calendarsToLoad },
    { enabled: calendarsToLoad.length > 0, staleTime: 2 * 60 * 1000 }
  );

  const label = t("agenda_google_busy");
  return useMemo(
    () => buildGoogleBusyEvents(busy, { rangeStart, dayCount, timezone, label, bookings }),
    [busy, rangeStart, dayCount, timezone, label, bookings]
  );
}
