"use client";
// Criado: 2026-10-13 22:5x BRT. "Novo agendamento" como no Google Agenda: clique na célula vazia da grade
// (ou no botão da barra) abre esta folha com o horário já preenchido; salvar cria a reserva pelo dono.

import dayjs from "@calcom/dayjs";
import { useTimePreferences } from "@calcom/features/bookings/lib/timePreferences";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Label, Select, Switch, TextAreaField, TextField } from "@calcom/ui/components/form";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@calcom/ui/components/sheet";
import { showToast } from "@calcom/ui/components/toast";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import {
  buildBookingWindow,
  describeMutationError,
  E164_PHONE,
  normalizeBrazilPhone,
  splitSlot,
} from "../lib/newBooking";

type NewBookingSheetProps = {
  /** Instante inicial sugerido. Null fecha a folha. */
  start: Date | null;
  onClose: () => void;
};

type ServiceOption = { label: string; value: number; length: number };

export function NewBookingSheet({ start, onClose }: NewBookingSheetProps) {
  return (
    <Sheet
      open={start !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}>
      {/* A chave remonta o formulário a cada abertura: estado limpo, horário novo */}
      {start !== null && <NewBookingForm key={start.toISOString()} start={start} onClose={onClose} />}
    </Sheet>
  );
}

function NewBookingForm({ start, onClose }: { start: Date; onClose: () => void }) {
  const { t, i18n } = useLocale();
  const { timezone } = useTimePreferences();
  const user = useMeQuery().data;
  const utils = trpc.useUtils();

  const eventTypesQuery = trpc.viewer.eventTypes.listWithTeam.useQuery();
  // Só tipos da própria conta: o servidor recusa tipo de equipe em que o usuário não é anfitrião.
  const services = useMemo<ServiceOption[]>(
    () =>
      (eventTypesQuery.data ?? [])
        .filter((eventType) => !eventType.team)
        .map((eventType) => ({ value: eventType.id, label: eventType.title, length: eventType.length })),
    [eventTypesQuery.data]
  );

  const initial = splitSlot(start, timezone);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyAttendee, setNotifyAttendee] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const service = services.find((option) => option.value === serviceId) ?? services[0] ?? null;
  // A duração é a do serviço: o motor recusa qualquer outra (validateEventLength).
  const duration = service?.length ?? 30;
  const bookingWindow = buildBookingWindow({ date, time, durationMinutes: duration, timeZone: timezone });

  const summary = useMemo(() => {
    if (!bookingWindow) return null;
    const startAt = dayjs(bookingWindow.start).tz(timezone);
    const endAt = dayjs(bookingWindow.end).tz(timezone);
    const day = new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: timezone,
    }).format(startAt.toDate());
    return `${day}, ${startAt.format("HH:mm")} a ${endAt.format("HH:mm")}`;
  }, [bookingWindow, timezone, i18n.language]);

  const mutation = trpc.viewer.bookings.createByOwner.useMutation({
    onSuccess: async () => {
      showToast(t("agenda_new_booking_created"), "success");
      await utils.viewer.bookings.get.invalidate();
      onClose();
    },
    onError: (mutationError) => setError(describeMutationError(mutationError.message, t)),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!service) return;
    if (!bookingWindow) {
      setError(t("agenda_new_booking_invalid_time"));
      return;
    }
    const phoneNumber = normalizeBrazilPhone(phone);
    if (phoneNumber && !E164_PHONE.test(phoneNumber)) {
      setError(t("agenda_new_booking_phone_invalid"));
      return;
    }
    setError(null);
    mutation.mutate({
      eventTypeId: service.value,
      start: bookingWindow.start,
      end: bookingWindow.end,
      // Horário vem do fuso da grade; o participante fica com o fuso da conta, que é o do e-mail.
      timeZone: user?.timeZone ?? timezone,
      attendee: { name: name.trim(), email: email.trim(), phoneNumber },
      notes: notes.trim() || undefined,
      notifyAttendee,
    });
  };

  const noServices = eventTypesQuery.isFetched && services.length === 0;

  return (
    <SheetContent className="overflow-y-auto" data-testid="new-booking-sheet">
      <form onSubmit={submit} className="flex h-full flex-col">
        <SheetHeader className="mt-0 w-full">
          <SheetTitle className="text-emphasis text-xl font-semibold">{t("agenda_new_booking")}</SheetTitle>
          <p className="text-subtle text-sm" data-testid="new-booking-summary">
            {summary ?? t("agenda_new_booking_invalid_time")}
          </p>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          {noServices ? (
            <Alert severity="warning" message={t("agenda_new_booking_no_services")} />
          ) : (
            <div>
              <Label>{t("agenda_new_booking_service")}</Label>
              <Select<ServiceOption>
                options={services}
                value={service}
                isLoading={eventTypesQuery.isPending}
                isSearchable={services.length > 6}
                onChange={(option) => setServiceId(option?.value ?? null)}
                className="w-full"
                data-testid="new-booking-service"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <TextField
              name="newBookingDate"
              label={t("date")}
              type="date"
              required
              value={date}
              data-testid="new-booking-date"
              onChange={(event) => setDate(event.target.value)}
            />
            <TextField
              name="newBookingTime"
              label={t("agenda_new_booking_start_time")}
              type="time"
              step={300}
              required
              value={time}
              data-testid="new-booking-time"
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
          <p className="text-subtle text-sm" data-testid="new-booking-duration">
            {t("duration")}: {duration} {t("minutes").toLowerCase()}
          </p>
          <TextField
            name="newBookingName"
            label={t("agenda_new_booking_client_name")}
            required
            autoComplete="off"
            value={name}
            data-testid="new-booking-name"
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            name="newBookingEmail"
            label={t("agenda_new_booking_client_email")}
            type="email"
            required
            autoComplete="off"
            value={email}
            data-testid="new-booking-email"
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            name="newBookingPhone"
            label={t("agenda_new_booking_client_phone")}
            hint={t("agenda_new_booking_client_phone_hint")}
            type="tel"
            autoComplete="off"
            value={phone}
            data-testid="new-booking-phone"
            onChange={(event) => setPhone(event.target.value)}
          />
          <TextAreaField
            name="newBookingNotes"
            label={t("additional_notes")}
            rows={3}
            value={notes}
            data-testid="new-booking-notes"
            onChange={(event) => setNotes(event.target.value)}
          />
          <Switch
            label={t("agenda_new_booking_notify")}
            data-testid="new-booking-notify"
            checked={notifyAttendee}
            onCheckedChange={setNotifyAttendee}
          />
          {error && (
            <div data-testid="new-booking-error">
              <Alert severity="error" message={error} />
            </div>
          )}
        </SheetBody>
        <SheetFooter className="bg-muted border-subtle -mx-4 mt-auto border-t pt-0 sm:-mx-6">
          <div className="flex w-full items-center justify-end gap-2 px-4 pb-4 pt-4">
            <Button type="button" color="minimal" onClick={onClose} data-testid="new-booking-cancel">
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              color="primary"
              loading={mutation.isPending}
              disabled={!service || !bookingWindow}
              data-testid="new-booking-submit">
              {t("agenda_new_booking_save")}
            </Button>
          </div>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}
