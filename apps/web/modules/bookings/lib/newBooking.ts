// Criado: 2026-10-13 22:4x BRT. Regras puras do "Novo agendamento" criado pelo dono na grade (clique na célula
// vazia ou botão da barra). Datas entram e saem no fuso da grade, que é o mesmo do seletor de fuso da conta.
import dayjs from "@calcom/dayjs";

export const NEW_BOOKING_GRID_STEP_MINUTES = 15;
const BUTTON_STEP_MINUTES = 30;
const DEFAULT_START_TIME = "09:00";
const DATE_KEY = "YYYY-MM-DD";

/** Próximo horário cheio (de 30 em 30 min) depois de agora. */
export function nextSlotFrom(now: Date, stepMinutes = BUTTON_STEP_MINUTES): Date {
  const stepMs = stepMinutes * 60_000;
  return new Date(Math.ceil((now.getTime() + 1) / stepMs) * stepMs);
}

/** Horário sugerido pelo botão: no dia de hoje é o próximo horário cheio; em outro dia, 09:00 desse dia. */
export function defaultBookingStart({
  anchor,
  now,
  timeZone,
}: {
  anchor: dayjs.Dayjs;
  now: Date;
  timeZone: string;
}): Date {
  const anchorKey = anchor.format(DATE_KEY);
  if (anchorKey === dayjs(now).tz(timeZone).format(DATE_KEY)) return nextSlotFrom(now);
  return dayjs.tz(`${anchorKey} ${DEFAULT_START_TIME}`, `${DATE_KEY} HH:mm`, timeZone).toDate();
}

/** Quebra um instante em data e hora no fuso da grade, como os campos do formulário esperam. */
export function splitSlot(slot: Date, timeZone: string): { date: string; time: string } {
  const inZone = dayjs(slot).tz(timeZone);
  return { date: inZone.format(DATE_KEY), time: inZone.format("HH:mm") };
}

/** Monta início e fim (ISO) a partir dos campos do formulário. Devolve null quando a data ou hora não fecha. */
export function buildBookingWindow({
  date,
  time,
  durationMinutes,
  timeZone,
}: {
  date: string;
  time: string;
  durationMinutes: number;
  timeZone: string;
}): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return null;
  // O parser do dayjs é permissivo ("25:00" vira 01:00 do dia seguinte): a faixa é conferida à mão.
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  const start = dayjs.tz(`${date} ${time}`, `${DATE_KEY} HH:mm`, timeZone);
  if (!start.isValid() || start.format(DATE_KEY) !== date) return null;
  return { start: start.toISOString(), end: start.add(durationMinutes, "minute").toISOString() };
}

/**
 * Telefone digitado do jeito que o cliente fala: "11 99999-8888" vira "+5511999998888".
 * Número já com "+" só perde a pontuação. Vazio devolve undefined (campo opcional).
 */
export function normalizeBrazilPhone(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return undefined;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

/** Formato E.164 que o motor aceita para o telefone do participante. */
export const E164_PHONE = /^\+[1-9]\d{7,14}$/;

/** Erro do servidor vira frase: chave de i18n conhecida é traduzida; JSON de validação vira aviso genérico. */
export function describeMutationError(message: string, t: (key: string) => string): string {
  const trimmed = message.trim();
  if (!trimmed || trimmed.startsWith("[") || trimmed.startsWith("{")) return t("agenda_new_booking_failed");
  if (/^[a-z0-9_]+$/i.test(trimmed)) {
    const translated = t(trimmed);
    return translated === trimmed ? t("agenda_new_booking_failed") : translated;
  }
  return trimmed;
}
