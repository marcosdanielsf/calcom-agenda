import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";
import { describe, expect, it } from "vitest";
import { GOOGLE_BUSY_COLOR, PAST_EVENT_CLASS, UPCOMING_BUSY_CLASS, withTimeState } from "./eventTimeState";

const now = new Date("2026-10-15T12:00:00.000Z");

function booking(start: string, end: string): CalendarEvent {
  return {
    id: 1,
    title: "Reunião",
    start: new Date(start),
    end: new Date(end),
    options: { status: "ACCEPTED", bookingUid: "abc", color: "#7986CB" },
  };
}

function busy(start: string, end: string): CalendarEvent {
  return {
    id: 1_000_000,
    title: "Ocupado no Google",
    start: new Date(start),
    end: new Date(end),
    source: "google-busy",
    options: { borderOnly: true, className: "!bg-muted !text-subtle" },
  };
}

describe("withTimeState", () => {
  it("reserva que já terminou fica apagada e riscada, sem perder a cor do serviço", () => {
    const [event] = withTimeState([booking("2026-10-15T09:00:00.000Z", "2026-10-15T10:00:00.000Z")], now);
    expect(event.options?.className).toContain(PAST_EVENT_CLASS);
    expect(event.options?.color).toBe("#7986CB");
    expect(event.options?.bookingUid).toBe("abc");
  });

  it("reserva que ainda vai acontecer fica como está", () => {
    const original = booking("2026-10-15T14:00:00.000Z", "2026-10-15T15:00:00.000Z");
    const [event] = withTimeState([original], now);
    expect(event).toEqual(original);
  });

  it("reserva em andamento conta como futura", () => {
    const original = booking("2026-10-15T11:30:00.000Z", "2026-10-15T12:30:00.000Z");
    const [event] = withTimeState([original], now);
    expect(event.options?.className ?? "").not.toContain("line-through");
  });

  it("termina exatamente agora conta como passada", () => {
    const [event] = withTimeState([booking("2026-10-15T11:00:00.000Z", "2026-10-15T12:00:00.000Z")], now);
    expect(event.options?.className).toContain(PAST_EVENT_CLASS);
  });

  it("bloco do Google que já passou segue tracejado e ganha o riscado", () => {
    const [event] = withTimeState([busy("2026-10-15T06:00:00.000Z", "2026-10-15T08:00:00.000Z")], now);
    expect(event.options?.borderOnly).toBe(true);
    expect(event.options?.className).toContain("!bg-muted");
    expect(event.options?.className).toContain(PAST_EVENT_CLASS);
  });

  it("bloco do Google que ainda vai acontecer fica aceso, sólido e com a barra de cor", () => {
    const [event] = withTimeState([busy("2026-10-16T09:45:00.000Z", "2026-10-16T10:45:00.000Z")], now);
    expect(event.options?.borderOnly).toBe(false);
    expect(event.options?.className).toBe(UPCOMING_BUSY_CLASS);
    expect(event.options?.color).toBe(GOOGLE_BUSY_COLOR);
    expect(event.source).toBe("google-busy");
  });

  it("não muta os eventos recebidos", () => {
    const original = busy("2026-10-16T09:45:00.000Z", "2026-10-16T10:45:00.000Z");
    withTimeState([original], now);
    expect(original.options?.borderOnly).toBe(true);
    expect(original.options?.className).toBe("!bg-muted !text-subtle");
  });
});
