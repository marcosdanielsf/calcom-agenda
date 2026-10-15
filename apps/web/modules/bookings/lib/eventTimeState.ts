import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";

// Compromisso que já terminou fica apagado e riscado, como concluído.
export const PAST_EVENT_CLASS = "opacity-50 line-through text-subtle";
// Ocupado no Google que ainda vai acontecer fica aceso, na cor padrão do Google Agenda.
export const GOOGLE_BUSY_COLOR = "#039BE5";
export const UPCOMING_BUSY_CLASS = "border border-[#039BE5]/40 bg-[#039BE5]/15 text-emphasis";

/** Marca cada evento da grade como passado ou futuro em relação a `now`. Em andamento conta como futuro. */
export function withTimeState(events: CalendarEvent[], now: Date): CalendarEvent[] {
  const nowMs = now.getTime();
  return events.map((event) => {
    if (new Date(event.end).getTime() <= nowMs) {
      const className = [event.options?.className, PAST_EVENT_CLASS].filter(Boolean).join(" ");
      return { ...event, options: { ...event.options, className } };
    }
    if (event.source === "google-busy") {
      return {
        ...event,
        options: {
          ...event.options,
          borderOnly: false,
          className: UPCOMING_BUSY_CLASS,
          color: GOOGLE_BUSY_COLOR,
        },
      };
    }
    return event;
  });
}
