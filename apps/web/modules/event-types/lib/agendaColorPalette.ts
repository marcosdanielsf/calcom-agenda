// Criado: 2026-10-13 23:2x BRT. Paleta de cores da agenda no padrão do Google Agenda: o dono escolhe a cor
// de cada serviço num clique, e a grade, o Mês e a lista pintam as reservas com ela. Mesma cor nos dois temas.
import type { EventTypeColorInput } from "@calcom/features/eventtypes/lib/types";

/** `ink` é a cor do ícone de marcação: escuro sobre cor clara (Banana), branco nas demais. */
export type AgendaPaletteColor = { key: string; hex: string; ink: "light" | "dark" };

export const AGENDA_COLOR_PALETTE: readonly AgendaPaletteColor[] = [
  { key: "tomato", hex: "#d50000", ink: "light" },
  { key: "flamingo", hex: "#e67c73", ink: "light" },
  { key: "tangerine", hex: "#f4511e", ink: "light" },
  { key: "banana", hex: "#f6bf26", ink: "dark" },
  { key: "sage", hex: "#33b679", ink: "light" },
  { key: "basil", hex: "#0b8043", ink: "light" },
  { key: "peacock", hex: "#039be5", ink: "light" },
  { key: "blueberry", hex: "#3f51b5", ink: "light" },
  { key: "lavender", hex: "#7986cb", ink: "light" },
  { key: "grape", hex: "#8e24aa", ink: "light" },
  { key: "graphite", hex: "#616161", ink: "light" },
];

export function eventTypeColorFromHex(hex: string): NonNullable<EventTypeColorInput> {
  return { lightEventTypeColor: hex, darkEventTypeColor: hex };
}

/** Chave da paleta que corresponde à cor salva, ou null quando é cor própria (aba Avançado) ou nenhuma. */
export function paletteKeyFor(color: EventTypeColorInput | null | undefined): string | null {
  if (!color) return null;
  const light = color.lightEventTypeColor?.toLowerCase();
  const dark = color.darkEventTypeColor?.toLowerCase();
  const match = AGENDA_COLOR_PALETTE.find((entry) => entry.hex === light && entry.hex === dark);
  return match?.key ?? null;
}
