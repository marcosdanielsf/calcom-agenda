import { describe, expect, it } from "vitest";
import { AGENDA_COLOR_PALETTE, eventTypeColorFromHex, paletteKeyFor } from "./agendaColorPalette";

describe("paleta de cores da agenda", () => {
  it("tem as onze cores do Google Agenda, todas em hexadecimal de seis dígitos e sem repetição", () => {
    expect(AGENDA_COLOR_PALETTE).toHaveLength(11);
    for (const color of AGENDA_COLOR_PALETTE) expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(AGENDA_COLOR_PALETTE.map((color) => color.hex)).size).toBe(11);
    expect(AGENDA_COLOR_PALETTE.find((color) => color.key === "banana")?.ink).toBe("dark");
  });

  it("uma cor da paleta vai e volta pela chave", () => {
    const peacock = AGENDA_COLOR_PALETTE.find((color) => color.key === "peacock");
    expect(peacock).toBeDefined();
    const saved = eventTypeColorFromHex(peacock!.hex);
    expect(saved).toEqual({ lightEventTypeColor: "#039be5", darkEventTypeColor: "#039be5" });
    expect(paletteKeyFor(saved)).toBe("peacock");
    expect(paletteKeyFor({ lightEventTypeColor: "#039BE5", darkEventTypeColor: "#039BE5" })).toBe("peacock");
  });

  it("cor própria (temas diferentes) ou nenhuma não casa com a paleta", () => {
    expect(paletteKeyFor(null)).toBeNull();
    expect(paletteKeyFor(undefined)).toBeNull();
    expect(paletteKeyFor({ lightEventTypeColor: "#039be5", darkEventTypeColor: "#ffffff" })).toBeNull();
    expect(paletteKeyFor({ lightEventTypeColor: "#123456", darkEventTypeColor: "#123456" })).toBeNull();
  });
});
