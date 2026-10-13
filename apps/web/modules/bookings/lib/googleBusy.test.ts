import dayjs from "@calcom/dayjs";
import { describe, expect, it } from "vitest";
import { buildGoogleBusyEvents, GOOGLE_BUSY_ID_OFFSET, pickCalendarsToLoad } from "./googleBusy";

const TZ = "UTC";
const rangeStart = dayjs.tz("2026-10-12T00:00:00", TZ);
const base = { rangeStart, dayCount: 7, timezone: TZ, label: "Ocupado no Google" };

describe("pickCalendarsToLoad", () => {
  it("usa os selecionados e cai para o principal quando nenhum está selecionado", () => {
    const result = pickCalendarsToLoad([
      {
        credentialId: 1,
        calendars: [
          { externalId: "a", isSelected: true, primary: false },
          { externalId: "b", isSelected: false, primary: true },
        ],
      },
      {
        credentialId: 2,
        calendars: [
          { externalId: "c", isSelected: false, primary: false },
          { externalId: "d", isSelected: false, primary: true },
        ],
      },
    ]);
    expect(result).toEqual([
      { credentialId: 1, externalId: "a" },
      { credentialId: 2, externalId: "d" },
    ]);
  });

  it("sem calendário conectado devolve lista vazia", () => {
    expect(pickCalendarsToLoad(undefined)).toEqual([]);
    expect(pickCalendarsToLoad([{ credentialId: 1 }])).toEqual([]);
  });
});

describe("buildGoogleBusyEvents", () => {
  it("sem resposta devolve vazio", () => {
    expect(buildGoogleBusyEvents(undefined, base)).toEqual([]);
    expect(buildGoogleBusyEvents([], base)).toEqual([]);
  });

  it("usa o rótulo e marca o bloco como não clicável", () => {
    const [event] = buildGoogleBusyEvents(
      [{ start: "2026-10-13T10:00:00.000Z", end: "2026-10-13T11:00:00.000Z" }],
      base
    );
    expect(event.title).toBe("Ocupado no Google");
    expect(event.options?.borderOnly).toBe(true);
    expect(event.options?.bookingUid).toBeUndefined();
    expect(event.id).toBeGreaterThanOrEqual(GOOGLE_BUSY_ID_OFFSET);
  });

  it("usa o título do evento quando o handler devolve um", () => {
    const [event] = buildGoogleBusyEvents(
      [{ start: "2026-10-13T10:00:00.000Z", end: "2026-10-13T11:00:00.000Z", title: "Dentista" }],
      base
    );
    expect(event.title).toBe("Dentista");
  });

  it("recorta no intervalo visível e descarta o que está fora", () => {
    const events = buildGoogleBusyEvents(
      [
        { start: "2026-10-11T22:00:00.000Z", end: "2026-10-12T02:00:00.000Z" },
        { start: "2026-10-30T10:00:00.000Z", end: "2026-10-30T11:00:00.000Z" },
      ],
      base
    );
    expect(events).toHaveLength(1);
    expect(new Date(events[0].start).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(events[0].end.toISOString()).toBe("2026-10-12T02:00:00.000Z");
  });

  it("parte evento que cruza a meia-noite em dois blocos", () => {
    const events = buildGoogleBusyEvents(
      [{ start: "2026-10-13T22:00:00.000Z", end: "2026-10-14T02:00:00.000Z" }],
      base
    );
    expect(events).toHaveLength(2);
    expect(events[0].end.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(new Date(events[1].start).toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(events[1].end.toISOString()).toBe("2026-10-14T02:00:00.000Z");
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
  });

  it("descarta intervalo inválido e o bloco idêntico a uma reserva", () => {
    const events = buildGoogleBusyEvents(
      [
        { start: "2026-10-13T12:00:00.000Z", end: "2026-10-13T11:00:00.000Z" },
        { start: "2026-10-13T14:00:00.000Z", end: "2026-10-13T15:00:00.000Z" },
        { start: "2026-10-13T16:00:00.000Z", end: "2026-10-13T17:00:00.000Z" },
      ],
      {
        ...base,
        bookings: [{ startTime: "2026-10-13T14:00:00.000Z", endTime: "2026-10-13T15:00:00.000Z" }],
      }
    );
    expect(events).toHaveLength(1);
    expect(new Date(events[0].start).toISOString()).toBe("2026-10-13T16:00:00.000Z");
  });
});
