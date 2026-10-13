"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { ToggleGroup } from "@calcom/ui/components/form";
import { CalendarIcon, MenuIcon } from "@coss/ui/icons";
import { useBookingsView } from "../hooks/useBookingsView";

type ViewToggleButtonProps = {
  bookingsV3Enabled: boolean;
};

export function ViewToggleButton({ bookingsV3Enabled }: ViewToggleButtonProps) {
  const { t } = useLocale();
  const [view, setView] = useBookingsView({ bookingsV3Enabled });

  return (
    <div className="shrink-0 [&_button]:min-h-10 [&_button]:min-w-10 [&_button]:px-2.5">
      <ToggleGroup
        value={view}
        onValueChange={(value: "list" | "calendar") => {
          if (!value) return;
          setView(value);
        }}
        options={[
          {
            value: "list",
            label: t("agenda_view_list"),
            dataTestId: "booking-view-list",
            iconLeft: <MenuIcon className="h-4 w-4" />,
          },
          {
            value: "calendar",
            label: t("agenda_view_calendar"),
            dataTestId: "booking-view-calendar",
            iconLeft: <CalendarIcon className="h-4 w-4" />,
          },
        ]}
      />
    </div>
  );
}
