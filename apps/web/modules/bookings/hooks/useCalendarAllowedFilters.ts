import { useMemo, useEffect, useRef } from "react";

import { ColumnFilterType } from "@calcom/features/data-table";
import { useDataTable } from "~/data-table/hooks/useDataTable";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";

/**
 * Custom hook to manage allowed filters for calendar view
 * - Everyone: eventTypeId filter
 * - Users with permission to read others' bookings: also userId, defaulting to their own ID
 */
export function useCalendarAllowedFilters({ canReadOthersBookings }: { canReadOthersBookings: boolean }) {
  const { data: user } = useMeQuery();
  const { updateFilter, clearAll } = useDataTable();
  const allowedFilterIds = useMemo(
    () => (canReadOthersBookings ? ["eventTypeId", "userId"] : ["eventTypeId"]),
    [canReadOthersBookings]
  );
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!user || hasInitialized.current) return;

    hasInitialized.current = true;

    // Clear all filters first (in case coming from list view with different filters)
    clearAll();

    // Then set the appropriate filter for users with permission
    if (canReadOthersBookings) {
      updateFilter("userId", {
        type: ColumnFilterType.MULTI_SELECT,
        data: [user.id],
      });
    }
  }, [user, canReadOthersBookings, updateFilter, clearAll]);

  return allowedFilterIds;
}
