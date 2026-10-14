import dayjs from "@calcom/dayjs";
import { describe, expect, it } from "vitest";
import {
  buildBookingWindow,
  defaultBookingStart,
  describeMutationError,
  E164_PHONE,
  nextSlotFrom,
  normalizeBrazilPhone,
  splitSlot,
} from "./newBooking";

const SP = "America/Sao_Paulo";

describe("nextSlotFrom", () => {
  it("arredonda para o próximo horário cheio de 30 minutos", () => {
    expect(nextSlotFrom(new Date("2026-10-14T13:07:00Z")).toISOString()).toBe("2026-10-14T13:30:00.000Z");
    expect(nextSlotFrom(new Date("2026-10-14T13:31:00Z")).toISOString()).toBe("2026-10-14T14:00:00.000Z");
  });

  it("em cima do horário cheio vai para o seguinte, nunca para o que já começou", () => {
    expect(nextSlotFrom(new Date("2026-10-14T13:30:00Z")).toISOString()).toBe("2026-10-14T14:00:00.000Z");
  });
});

describe("defaultBookingStart", () => {
  it("hoje sugere o próximo horário cheio", () => {
    const now = new Date("2026-10-14T13:07:00Z"); // 10:07 em São Paulo
    const anchor = dayjs("2026-10-14");
    expect(defaultBookingStart({ anchor, now, timeZone: SP }).toISOString()).toBe("2026-10-14T13:30:00.000Z");
  });

  it("outro dia sugere 09:00 no fuso da grade", () => {
    const now = new Date("2026-10-14T13:07:00Z");
    const anchor = dayjs("2026-10-20");
    expect(defaultBookingStart({ anchor, now, timeZone: SP }).toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });
});

describe("splitSlot e buildBookingWindow", () => {
  it("vão e voltam no mesmo fuso", () => {
    const slot = new Date("2026-10-14T16:15:00Z"); // 13:15 em São Paulo
    expect(splitSlot(slot, SP)).toEqual({ date: "2026-10-14", time: "13:15" });
    expect(
      buildBookingWindow({ date: "2026-10-14", time: "13:15", durationMinutes: 45, timeZone: SP })
    ).toEqual({
      start: "2026-10-14T16:15:00.000Z",
      end: "2026-10-14T17:00:00.000Z",
    });
  });

  it("recusa data, hora ou duração que não fecham", () => {
    expect(
      buildBookingWindow({ date: "14/10/2026", time: "13:15", durationMinutes: 30, timeZone: SP })
    ).toBeNull();
    expect(
      buildBookingWindow({ date: "2026-10-14", time: "25:00", durationMinutes: 30, timeZone: SP })
    ).toBeNull();
    expect(
      buildBookingWindow({ date: "2026-10-14", time: "13:15", durationMinutes: 0, timeZone: SP })
    ).toBeNull();
  });
});

describe("normalizeBrazilPhone", () => {
  it("número brasileiro com DDD ganha +55", () => {
    expect(normalizeBrazilPhone("(11) 99999-8888")).toBe("+5511999998888");
    expect(normalizeBrazilPhone("11 3333-4444")).toBe("+551133334444");
  });

  it("número com + só perde pontuação; vazio vira undefined", () => {
    expect(normalizeBrazilPhone("+1 (832) 346-5161")).toBe("+18323465161");
    expect(normalizeBrazilPhone("   ")).toBeUndefined();
    expect(normalizeBrazilPhone("abc")).toBeUndefined();
  });

  it("número já com 55 na frente não ganha outro", () => {
    expect(normalizeBrazilPhone("55 11 99999-8888")).toBe("+5511999998888");
  });
});

describe("describeMutationError", () => {
  const t = (key: string) => (key === "event_type_not_found" ? "Tipo não encontrado" : key);
  it("chave conhecida vira a frase traduzida", () => {
    expect(describeMutationError("event_type_not_found", t)).toBe("Tipo não encontrado");
  });
  it("JSON de validação e chave desconhecida viram o aviso genérico", () => {
    expect(describeMutationError('[{"code":"invalid_type"}]', t)).toBe("agenda_new_booking_failed");
    expect(describeMutationError("some_unknown_key", t)).toBe("agenda_new_booking_failed");
  });
  it("frase solta do servidor passa como está", () => {
    expect(describeMutationError("Invalid event length", t)).toBe("Invalid event length");
  });
});

describe("E164_PHONE", () => {
  it("aceita o que normalizeBrazilPhone produz e recusa lixo", () => {
    expect(E164_PHONE.test("+5511999998888")).toBe(true);
    expect(E164_PHONE.test("+18323465161")).toBe(true);
    expect(E164_PHONE.test("+5511")).toBe(false);
    expect(E164_PHONE.test("+05511999998888")).toBe(false);
  });
});
