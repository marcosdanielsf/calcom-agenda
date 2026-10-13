import dayjs from "@calcom/dayjs";
import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  countBookingsByDay,
  formatRangeLabel,
  getFetchEndDate,
  getRangeWindow,
  groupBookingsByDay,
  shiftAnchor,
} from "./calendarRange";

const fmt = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");

describe("getRangeWindow", () => {
  // 2026-10-15 e quinta-feira
  const anchor = dayjs("2026-10-15");

  it("dia: janela de um dia inteiro", () => {
    const { start, end } = getRangeWindow("day", anchor, 0);
    expect(fmt(start)).toBe("2026-10-15");
    expect(fmt(end)).toBe("2026-10-15");
    expect(end.hour()).toBe(23);
  });

  it("semana comecando no domingo", () => {
    const { start, end } = getRangeWindow("week", anchor, 0);
    expect(fmt(start)).toBe("2026-10-11");
    expect(fmt(end)).toBe("2026-10-17");
  });

  it("semana comecando na segunda", () => {
    const { start, end } = getRangeWindow("week", anchor, 1);
    expect(fmt(start)).toBe("2026-10-12");
    expect(fmt(end)).toBe("2026-10-18");
  });

  it("mes: cobre a grade visivel inteira (domingo)", () => {
    const { start, end } = getRangeWindow("month", anchor, 0);
    expect(fmt(start)).toBe("2026-09-27");
    expect(fmt(end)).toBe("2026-10-31");
  });

  it("mes: cobre a grade visivel inteira (segunda)", () => {
    const { start, end } = getRangeWindow("month", anchor, 1);
    expect(fmt(start)).toBe("2026-09-28");
    expect(fmt(end)).toBe("2026-11-01");
  });
});

describe("shiftAnchor", () => {
  const anchor = dayjs("2026-10-31");

  it("dia anda 1 dia", () => {
    expect(fmt(shiftAnchor("day", anchor, 1))).toBe("2026-11-01");
    expect(fmt(shiftAnchor("day", anchor, -1))).toBe("2026-10-30");
  });

  it("semana anda 7 dias", () => {
    expect(fmt(shiftAnchor("week", anchor, 1))).toBe("2026-11-07");
    expect(fmt(shiftAnchor("week", anchor, -1))).toBe("2026-10-24");
  });

  it("mes anda 1 mes e nao transborda no fim do mes", () => {
    expect(fmt(shiftAnchor("month", anchor, 1))).toBe("2026-11-30");
    expect(fmt(shiftAnchor("month", anchor, -1))).toBe("2026-09-30");
  });
});

describe("buildMonthGrid", () => {
  it("outubro/2026 com semana no domingo: 5 linhas de 7 dias", () => {
    const grid = buildMonthGrid(dayjs("2026-10-10"), 0);
    expect(grid).toHaveLength(5);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    expect(fmt(grid[0][0])).toBe("2026-09-27");
    expect(fmt(grid[4][6])).toBe("2026-10-31");
  });

  it("outubro/2026 com semana na segunda: 5 linhas de 7 dias", () => {
    const grid = buildMonthGrid(dayjs("2026-10-10"), 1);
    expect(grid).toHaveLength(5);
    expect(fmt(grid[0][0])).toBe("2026-09-28");
    expect(fmt(grid[4][6])).toBe("2026-11-01");
  });

  it("mes que precisa de 6 linhas (agosto/2026, domingo)", () => {
    const grid = buildMonthGrid(dayjs("2026-08-05"), 0);
    expect(grid).toHaveLength(6);
    expect(fmt(grid[0][0])).toBe("2026-07-26");
    expect(fmt(grid[5][6])).toBe("2026-09-05");
  });
});

describe("countBookingsByDay", () => {
  it("conta no dia local, nao no dia UTC (America/Sao_Paulo)", () => {
    // 23:30 em Sao Paulo (UTC-3) = 02:30 UTC do dia seguinte
    const bookings = [
      { startTime: "2026-10-15T02:30:00.000Z", title: "noite" },
      { startTime: "2026-10-15T15:00:00.000Z", title: "tarde" },
      { startTime: "2026-10-16T12:00:00.000Z", title: "outro dia" },
    ];
    const counts = countBookingsByDay(bookings, "America/Sao_Paulo");
    expect(counts.get("2026-10-14")).toBe(1);
    expect(counts.get("2026-10-15")).toBe(1);
    expect(counts.get("2026-10-16")).toBe(1);
    expect(counts.get("2026-10-17")).toBeUndefined();
  });

  it("agrupa varias reservas no mesmo dia", () => {
    const bookings = [
      { startTime: "2026-10-15T13:00:00.000Z", title: "a" },
      { startTime: "2026-10-15T14:00:00.000Z", title: "b" },
      { startTime: "2026-10-15T20:00:00.000Z", title: "c" },
    ];
    expect(countBookingsByDay(bookings, "America/Sao_Paulo").get("2026-10-15")).toBe(3);
  });
});

describe("groupBookingsByDay", () => {
  it("mantem a ordem de chegada dentro do dia", () => {
    const bookings = [
      { startTime: "2026-10-15T13:00:00.000Z", title: "a" },
      { startTime: "2026-10-15T14:00:00.000Z", title: "b" },
    ];
    const grouped = groupBookingsByDay(bookings, "America/Sao_Paulo");
    expect(grouped.get("2026-10-15")?.map((b) => b.title)).toEqual(["a", "b"]);
  });
});

describe("formatRangeLabel", () => {
  const anchor = dayjs("2026-10-15");

  it("mes usa mes por extenso no idioma do usuario", () => {
    const window = getRangeWindow("month", anchor, 0);
    expect(formatRangeLabel("month", window, anchor, "pt-BR")).toBe("outubro de 2026");
    expect(formatRangeLabel("month", window, anchor, "en")).toBe("October 2026");
  });

  it("semana mostra o intervalo e dia mostra a data", () => {
    const week = getRangeWindow("week", anchor, 0);
    expect(formatRangeLabel("week", week, anchor, "en")).toBe("Oct 11 to Oct 17, 2026");
    expect(formatRangeLabel("day", getRangeWindow("day", anchor, 0), anchor, "en")).toBe("Oct 15, 2026");
  });
});

describe("formatRangeLabel sem travessao", () => {
  const dash = /[\u2013\u2014]/;

  it("semana no mesmo mes em pt-BR", () => {
    const anchor = dayjs("2026-10-15");
    const label = formatRangeLabel("week", getRangeWindow("week", anchor, 0), anchor, "pt-BR");
    expect(label).toBe("11 a 17 de out. de 2026");
    expect(label).not.toMatch(dash);
  });

  it("semana que cruza meses em pt-BR", () => {
    const anchor = dayjs("2026-10-01");
    const label = formatRangeLabel("week", getRangeWindow("week", anchor, 0), anchor, "pt-BR");
    expect(label).toBe("27 de set. a 3 de out. de 2026");
    expect(label).not.toMatch(dash);
  });

  it("nenhum idioma gera U+2013 nem U+2014", () => {
    const anchor = dayjs("2026-10-15");
    const week = getRangeWindow("week", anchor, 1);
    for (const locale of ["pt-BR", "en", "es", "fr", "de", "ja"]) {
      expect(formatRangeLabel("week", week, anchor, locale)).not.toMatch(dash);
    }
  });
});

describe("getFetchEndDate", () => {
  it("avanca um dia para nao perder reserva que termina depois da meia-noite", () => {
    const window = getRangeWindow("day", dayjs("2026-10-15"), 0);
    const end = dayjs(getFetchEndDate(window.end));
    // reserva 23:30 a 00:30 do dia seguinte tem endTime dentro da janela de busca
    const bookingEnd = window.end.add(30, "minute");
    expect(bookingEnd.isAfter(window.end)).toBe(true);
    expect(bookingEnd.isAfter(end)).toBe(false);
  });
});

describe("agrupamento no fuso do navegador", () => {
  it("dayjs.tz.guess agrupa no mesmo dia que a grade local", () => {
    const iso = "2026-10-15T02:30:00.000Z";
    const key = Array.from(groupBookingsByDay([{ startTime: iso }], dayjs.tz.guess()).keys())[0];
    expect(key).toBe(dayjs(iso).format("YYYY-MM-DD"));
  });
});
