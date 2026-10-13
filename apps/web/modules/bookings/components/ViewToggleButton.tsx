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
    <div className="[&_button]:min-h-10 [&_button]:min-w-10">
      <ToggleGroup
        value={view}
        onValueChange={(value: "list" | "calendar") => {
          if (!value) return;
          setView(value);
        }}
        options={[
          {
            value: "list",
            label: "",
            dataTestId: "booking-view-list",
            tooltip: t("list_view"),
            iconLeft: <MenuIcon className="h-4 w-4" />,
          },
          {
            value: "calendar",
            label: "",
            dataTestId: "booking-view-calendar",
            tooltip: t("calendar_view"),
            iconLeft: <CalendarIcon className="h-4 w-4" />,
          },
        ]}
      />
    </div>
  );
}
