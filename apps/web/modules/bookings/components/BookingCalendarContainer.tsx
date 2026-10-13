"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { ButtonGroup } from "@calcom/ui/components/buttonGroup";
import { ToggleGroup } from "@calcom/ui/components/form";
import { ChevronLeftIcon, ChevronRightIcon } from "@coss/ui/icons";
import { getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import React, { useEffect, useMemo } from "react";
import { useBookingCalendarData } from "~/bookings/hooks/useBookingCalendarData";
import { useBookingFilters } from "~/bookings/hooks/useBookingFilters";
import { useCalendarAllowedFilters } from "~/bookings/hooks/useCalendarAllowedFilters";
import { useCalendarAutoSelector } from "~/bookings/hooks/useCalendarAutoSelector";
import { useCalendarRange } from "~/bookings/hooks/useCalendarRange";
import { useFacetedUniqueValues } from "~/bookings/hooks/useFacetedUniqueValues";
import { DataTableFilters } from "~/data-table/components/filters";
import { buildFilterColumns, getFilterColumnVisibility } from "../columns/filterColumns";
import {
  CALENDAR_RANGES,
  type CalendarRange,
  formatRangeLabel,
  getFetchEndDate,
  shiftAnchor,
} from "../lib/calendarRange";
import { BookingDetailsSheetStoreProvider } from "../store/bookingDetailsSheetStore";
import type { BookingListingStatus, BookingsGetOutput, RowData } from "../types";
import { BookingCalendarView } from "./BookingCalendarView";
import { BookingDetailsSheet } from "./BookingDetailsSheet";
import { BookingMonthView } from "./BookingMonthView";
import { ViewToggleButton } from "./ViewToggleButton";
import { WeekPicker } from "./WeekPicker";

// For calendar view, fetch all statuses except cancelled
const STATUSES: BookingListingStatus[] = ["upcoming", "unconfirmed", "recurring", "past"];

interface BookingCalendarContainerProps {
  status: BookingListingStatus;
  permissions: {
    canReadOthersBookings: boolean;
  };
  bookingsV3Enabled: boolean;
}

type CalendarRangeState = ReturnType<typeof useCalendarRange>;

interface BookingCalendarInnerProps extends BookingCalendarContainerProps {
  calendarRange: CalendarRangeState;
  data?: {
    bookings: BookingsGetOutput["bookings"];
    recurringInfo: BookingsGetOutput["recurringInfo"];
    totalCount: BookingsGetOutput["totalCount"];
  };
  allowedFilterIds: string[];
  isPending: boolean;
  hasError: boolean;
  errorMessage?: string;
  hasNextPage: boolean;
  isFetched: boolean;
  isFetchingNextPage: boolean;
}

function BookingCalendarInner({
  status,
  permissions,
  bookingsV3Enabled,
  calendarRange,
  data,
  allowedFilterIds,
  hasError,
  errorMessage,
  hasNextPage,
  isFetched,
  isFetchingNextPage,
}: BookingCalendarInnerProps) {
  const { t, i18n } = useLocale();
  const user = useMeQuery().data;
  const { range, setRange, anchor, setAnchor, window: rangeWindow, userWeekStart } = calendarRange;

  const rowData = useBookingCalendarData({ data, status });

  // Extract bookings from table data
  const bookings = useMemo(() => {
    return rowData
      .filter((row): row is Extract<RowData, { type: "data" }> => row.type === "data")
      .map((row) => row.booking);
  }, [rowData]);

  // Handle auto-selection for calendar view
  useCalendarAutoSelector(bookings, hasNextPage, isFetched, isFetchingNextPage);

  const goToPrevious = () => setAnchor(shiftAnchor(range, anchor, -1));
  const goToNext = () => setAnchor(shiftAnchor(range, anchor, 1));
  const goToToday = () => setAnchor(null);

  const previousLabel = {
    day: t("agenda_view_previous_day"),
    week: t("view_previous_week"),
    month: t("view_previous_month"),
  }[range];
  const nextLabel = {
    day: t("agenda_view_next_day"),
    week: t("view_next_week"),
    month: t("view_next_month"),
  }[range];
  const rangeLabels: Record<CalendarRange, string> = {
    day: t("agenda_range_day"),
    week: t("agenda_range_week"),
    month: t("agenda_range_month"),
  };
  const periodLabel = formatRangeLabel(range, rangeWindow, anchor, i18n.language);

  const ErrorView = errorMessage ? (
    <Alert severity="error" title={t("something_went_wrong")} message={errorMessage} />
  ) : undefined;

  const columns = useMemo(() => {
    return buildFilterColumns({ t, permissions, status }).filter((column) =>
      allowedFilterIds.includes(column.id || "")
    );
  }, [allowedFilterIds, t, permissions, status]);

  const getFacetedUniqueValues = useFacetedUniqueValues({
    canReadOthersBookings: permissions.canReadOthersBookings,
  });

  const table = useReactTable<RowData>({
    data: rowData,
    columns,
    initialState: {
      columnVisibility: getFilterColumnVisibility(),
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedUniqueValues,
  });

  return (
    <>
      <div
        data-testid="booking-calendar-toolbar"
        className="-mx-1 mb-4 flex items-center justify-between gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex shrink-0 items-center gap-2">
          <WeekPicker anchor={anchor} label={periodLabel} onDateChange={setAnchor} />
          {allowedFilterIds.length > 0 && <DataTableFilters.FilterBar table={table} />}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div
            data-testid="booking-range-toggle"
            className="[&_button]:min-h-10 [&_button]:min-w-10"
            aria-label={t("agenda_range_label")}>
            <ToggleGroup
              value={range}
              onValueChange={(value: CalendarRange) => {
                if (value) setRange(value);
              }}
              options={CALENDAR_RANGES.map((value) => ({
                value,
                label: rangeLabels[value],
                dataTestId: `booking-range-${value}`,
              }))}
            />
          </div>
          <Button color="secondary" onClick={goToToday} className="min-h-10 capitalize">
            {t("today")}
          </Button>
          <ButtonGroup combined>
            <Button color="secondary" onClick={goToPrevious} className="min-h-10 min-w-10">
              <span className="sr-only">{previousLabel}</span>
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button color="secondary" onClick={goToNext} className="min-h-10 min-w-10">
              <span className="sr-only">{nextLabel}</span>
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </ButtonGroup>
          <ViewToggleButton bookingsV3Enabled={bookingsV3Enabled} />
        </div>
      </div>
      {hasError && ErrorView ? (
        ErrorView
      ) : range === "month" ? (
        <BookingMonthView
          bookings={bookings}
          anchor={anchor}
          weekStart={userWeekStart}
          onDayClick={(day) => {
            setRange("week");
            setAnchor(day);
          }}
        />
      ) : (
        <BookingCalendarView
          bookings={bookings}
          rangeStart={rangeWindow.start}
          dayCount={range === "day" ? 1 : 7}
        />
      )}

      <BookingDetailsSheet
        userTimeZone={user?.timeZone}
        userTimeFormat={user?.timeFormat === null ? undefined : user?.timeFormat}
        userId={user?.id}
        userEmail={user?.email}
      />
    </>
  );
}

export function BookingCalendarContainer(props: BookingCalendarContainerProps) {
  const { canReadOthersBookings } = props.permissions;
  const { userIds, eventTypeIds } = useBookingFilters();
  const calendarRange = useCalendarRange();
  const { start: windowStart, end: windowEnd } = calendarRange.window;

  const allowedFilterIds = useCalendarAllowedFilters({
    canReadOthersBookings,
  });

  const query = trpc.viewer.bookings.get.useInfiniteQuery(
    {
      limit: 100, // Use max limit for calendar view
      filters: {
        statuses: STATUSES,
        userIds,
        eventTypeIds,
        // Only the visible window (day, week or month grid) is fetched
        afterStartDate: windowStart.toISOString(),
        beforeEndDate: getFetchEndDate(windowEnd),
      },
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 5 * 60 * 1000, // 5 minutes - data is considered fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - cache retention time
    }
  );

  const { isFetched, hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  // Automatically fetch all pages until no more data
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Flatten all pages into a single data object
  const data = useMemo(() => {
    if (!query.data?.pages) return undefined;

    // Combine all bookings from all pages
    const allBookings = query.data.pages.flatMap((page) => page.bookings);

    // recurringInfo is the same across all pages (queried globally by user, not per page)
    const recurringInfo = query.data.pages[0]?.recurringInfo ?? [];

    // totalCount is the same across all pages
    const totalCount = query.data.pages[0]?.totalCount ?? 0;

    return { bookings: allBookings, recurringInfo, totalCount };
  }, [query.data?.pages]);

  const bookings = useMemo(() => data?.bookings ?? [], [data?.bookings]);

  return (
    <BookingDetailsSheetStoreProvider bookings={bookings}>
      <BookingCalendarInner
        {...props}
        calendarRange={calendarRange}
        data={data}
        allowedFilterIds={allowedFilterIds}
        isPending={query.isPending}
        hasError={!!query.error}
        errorMessage={query.error?.message}
        hasNextPage={hasNextPage}
        isFetched={isFetched}
        isFetchingNextPage={isFetchingNextPage}
      />
    </BookingDetailsSheetStoreProvider>
  );
}
