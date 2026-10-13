import dayjs from "@calcom/dayjs";
import { weekdayToWeekIndex } from "@calcom/lib/dayjs";
import useMediaQuery from "@calcom/lib/hooks/useMediaQuery";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { createParser, parseAsStringLiteral, useQueryState } from "nuqs";
import { CALENDAR_RANGES } from "../lib/calendarRange";
import { useDerivedCalendarState } from "./useDerivedCalendarState";

const anchorParser = createParser({
  parse: (value: string) => {
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.startOf("day") : null;
  },
  serialize: (value: dayjs.Dayjs) => value.format("YYYY-MM-DD"),
});

export function useCalendarRange() {
  const user = useMeQuery().data;
  const userWeekStart = weekdayToWeekIndex(user?.weekStart);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [rangeParam, setRange] = useQueryState("range", parseAsStringLiteral(CALENDAR_RANGES));
  const [anchorParam, setAnchor] = useQueryState("date", anchorParser);

  const { range, anchor, rangeWindow } = useDerivedCalendarState({
    rangeParam,
    anchorParam,
    isMobile,
    weekStart: userWeekStart,
  });

  return { range, setRange, anchor, setAnchor, window: rangeWindow, userWeekStart };
}
