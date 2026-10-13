import dayjs from "@calcom/dayjs";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDerivedCalendarState } from "./useDerivedCalendarState";

const base = { rangeParam: null, anchorParam: null, isMobile: false, weekStart: 0 } as const;

describe("useDerivedCalendarState", () => {
  it("sem ?date, anchor e janela mantem a mesma referencia entre renders", () => {
    const { result, rerender } = renderHook((props) => useDerivedCalendarState(props), {
      initialProps: { ...base },
    });
    const first = result.current;
    rerender({ ...base });
    rerender({ ...base });
    expect(result.current.anchor).toBe(first.anchor);
    expect(result.current.rangeWindow).toBe(first.rangeWindow);
  });

  it("com ?date, objeto novo do mesmo dia nao troca a referencia", () => {
    const { result, rerender } = renderHook((props) => useDerivedCalendarState(props), {
      initialProps: { ...base, anchorParam: dayjs("2026-10-15") },
    });
    const first = result.current;
    rerender({ ...base, anchorParam: dayjs("2026-10-15") });
    expect(result.current.anchor).toBe(first.anchor);
    expect(result.current.rangeWindow).toBe(first.rangeWindow);
  });

  it("mudar o dia ou o range troca a janela; padrao e dia no celular", () => {
    const { result, rerender } = renderHook((props) => useDerivedCalendarState(props), {
      initialProps: { ...base, anchorParam: dayjs("2026-10-15") },
    });
    const first = result.current.rangeWindow;
    rerender({ ...base, anchorParam: dayjs("2026-10-22") });
    expect(result.current.rangeWindow).not.toBe(first);
    rerender({ ...base, anchorParam: dayjs("2026-10-22"), isMobile: true });
    expect(result.current.range).toBe("day");
  });
});
