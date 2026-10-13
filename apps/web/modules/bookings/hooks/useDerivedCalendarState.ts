import dayjs from "@calcom/dayjs";
import { useMemo } from "react";
import { type CalendarRange, getRangeWindow } from "../lib/calendarRange";

type Params = {
  rangeParam: CalendarRange | null;
  anchorParam: dayjs.Dayjs | null;
  isMobile: boolean;
  weekStart: number;
};

export function useDerivedCalendarState({ rangeParam, anchorParam, isMobile, weekStart }: Params) {
  const range: CalendarRange = rangeParam ?? (isMobile ? "day" : "week");
  const anchorKey = (anchorParam ?? dayjs()).format("YYYY-MM-DD");

  const anchor = useMemo(() => dayjs(anchorKey).startOf("day"), [anchorKey]);
  const rangeWindow = useMemo(() => getRangeWindow(range, anchor, weekStart), [range, anchor, weekStart]);

  return { range, anchor, rangeWindow };
}
