"use client";
// Updated: 2026-09-09 08:06 BRT.

import { createPaymentLink } from "@calcom/app-store/stripepayment/lib/client";
import { useHandleBookEvent } from "@calcom/atoms/hooks/bookings/useHandleBookEvent";
import dayjs from "@calcom/dayjs";
import { sdkActionManager } from "@calcom/embed-core/embed-iframe";
import { useBookerStoreContext } from "@calcom/features/bookings/Booker/BookerStoreProvider";
import type { UseBookingFormReturnType } from "@calcom/features/bookings/Booker/hooks/useBookingForm";
import { getQueryParam } from "@calcom/features/bookings/Booker/utils/query-param";
import { useBookingSuccessRedirect } from "@calcom/features/bookings/lib/bookingSuccessRedirect";
import { storeDecoyBooking } from "@calcom/features/bookings/lib/client/decoyBookingStore";
import { createBooking } from "@calcom/features/bookings/lib/create-booking";
import { createRecurringBooking } from "@calcom/features/bookings/lib/create-recurring-booking";
import type { GetBookingType } from "@calcom/features/bookings/lib/get-booking";
import type { BookerEvent, BookingResponse } from "@calcom/features/bookings/types";
import { getFullName } from "@calcom/features/form-builder/utils";
import { ErrorCode } from "@calcom/lib/errorCodes";
import { createAgendaRequestTracker, readAgendaAttempt, readAgendaReservationStatus, settleAgendaAttempt } from "@calcom/lib/nexus-booking/client";
import type { AgendaStatus } from "@calcom/lib/nexus-booking/client";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { BookingStatus } from "@calcom/prisma/enums";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

export interface IUseBookings {
  event: {
    data?:
      | (Pick<
          BookerEvent,
          | "id"
          | "slug"
          | "subsetOfHosts"
          | "requiresConfirmation"
          | "isDynamic"
          | "metadata"
          | "forwardParamsSuccessRedirect"
          | "successRedirectUrl"
          | "length"
          | "recurringEvent"
          | "schedulingType"
        > & {
          subsetOfUsers: Pick<
            BookerEvent["subsetOfUsers"][number],
            "name" | "username" | "avatarUrl" | "weekStart" | "profile" | "bookerUrl"
          >[];
        })
      | null;
  };
  hashedLink?: string | null;
  bookingForm: UseBookingFormReturnType["bookingForm"];
  metadata: Record<string, string>;
  teamMemberEmail?: string | null;
  isBookingDryRun?: boolean;
}

const getBaseBookingEventPayload = (booking: {
  title?: string;
  startTime: string;
  endTime: string;
  eventTypeId?: number | null;
  status?: BookingStatus;
  paymentRequired: boolean;
  isRecurring: boolean;
  videoCallUrl?: string;
}) => {
  return {
    title: booking.title,
    startTime: booking.startTime,
    endTime: booking.endTime,
    eventTypeId: booking.eventTypeId,
    status: booking.status,
    paymentRequired: booking.paymentRequired,
    isRecurring: booking.isRecurring,
    videoCallUrl: booking.videoCallUrl,
  };
};

const getBookingSuccessfulEventPayload = (booking: {
  title?: string;
  startTime: string;
  endTime: string;
  eventTypeId?: number | null;
  status?: BookingStatus;
  paymentRequired: boolean;
  uid?: string;
  isRecurring: boolean;
  videoCallUrl?: string;
}) => {
  return {
    uid: booking.uid,
    ...getBaseBookingEventPayload(booking),
  };
};

const getRescheduleBookingSuccessfulEventPayload = getBookingSuccessfulEventPayload;

export const getDryRunBookingSuccessfulEventPayload = getBaseBookingEventPayload;

export const getDryRunRescheduleBookingSuccessfulEventPayload = getDryRunBookingSuccessfulEventPayload;
export interface IUseBookingLoadingStates {
  creatingBooking: boolean;
  creatingRecurringBooking: boolean;
}

export interface IUseBookingErrors {
  hasDataErrors: boolean;
  dataErrors: unknown;
}
export type UseBookingsReturnType = ReturnType<typeof useBookings>;

export const useBookings = ({ event, hashedLink, bookingForm, metadata, isBookingDryRun }: IUseBookings) => {
  const router = useRouter();
  const eventSlug = useBookerStoreContext((state) => state.eventSlug);
  const eventTypeId = useBookerStoreContext((state) => state.eventId);

  const [rescheduleUid, setRescheduleUid] = useBookerStoreContext(
    (state) => [state.rescheduleUid, state.setRescheduleUid],
    shallow
  );
  const rescheduledBy = useBookerStoreContext((state) => state.rescheduledBy);
  const [bookingData, setBookingData] = useBookerStoreContext(
    (state) => [state.bookingData, state.setBookingData],
    shallow
  );
  const timeslot = useBookerStoreContext((state) => state.selectedTimeslot);
  const { t } = useLocale();
  const bookingSuccessRedirect = useBookingSuccessRedirect();
  const bookerFormErrorRef = useRef<HTMLDivElement>(null);

  const duration = useBookerStoreContext((state) => state.selectedDuration);

  const isRescheduling = !!rescheduleUid && !!bookingData;

  const bookingUid = getQueryParam("bookingUid") ?? "";
  const [agendaStatus, setAgendaStatus] = useState<AgendaStatus | null>(null);
  const [agendaRecoveryError, setAgendaRecoveryError] = useState<string | null>(null);
  const agendaRequests = useRef(createAgendaRequestTracker<Parameters<typeof createBooking>[0]>());
  const setSelectedTimeslot = useBookerStoreContext((state) => state.setSelectedTimeslot);
  const agendaStatusMutation = useMutation({
    mutationFn: ({ id, key }: { id: number; key: string }) => readAgendaReservationStatus(id, key),
    onSuccess: (status, { id, key }) => {
      if (id !== event.data?.id || readAgendaAttempt(id)?.key !== key) return;
      if (status !== "processing") settleAgendaAttempt(id, status, sessionStorage, key);
      setAgendaRecoveryError(null);
      setAgendaStatus(status);
    },
    onError: (error, { id }) => {
      if (id === event.data?.id) setAgendaRecoveryError(error.message);
    },
  });

  useEffect(() => {
    setAgendaStatus(null);
    setAgendaRecoveryError(null);
    if (process.env.NEXT_PUBLIC_NEXUS_BOOKING_ENABLED !== "1" || !event.data?.id) return;
    try {
      const attempt = readAgendaAttempt(event.data.id);
      if (attempt && !attempt.confirmed) setAgendaStatus("processing");
    } catch (error) {
      setAgendaStatus("processing");
      setAgendaRecoveryError(error instanceof Error ? error.message : "Não foi possível recuperar a tentativa.");
    }
  }, [event.data?.id]);

  const refreshAgendaStatus = () => {
    if (!event.data?.id || agendaStatusMutation.isPending) return;
    try {
      const attempt = readAgendaAttempt(event.data.id);
      if (!attempt) throw new Error("Não foi possível recuperar esta tentativa neste navegador.");
      setAgendaRecoveryError(null);
      agendaStatusMutation.mutate({ id: event.data.id, key: attempt.key });
    } catch (error) {
      setAgendaRecoveryError(error instanceof Error ? error.message : "Não foi possível consultar a reserva.");
    }
  };

  const createBookingMutation = useMutation({
    mutationFn: async (request: { data: Parameters<typeof createBooking>[0] }) => {
      if (process.env.NEXT_PUBLIC_NEXUS_BOOKING_ENABLED !== "1") return createBooking(request.data);
      const requestKey = await agendaRequests.current.prepare(request);
      return createBooking(request.data, requestKey);
    },
    onSuccess: (booking, request) => {
      if (booking.agendaStatus) {
        if (!agendaRequests.current.isCurrent(request)) return;
        if (booking.agendaStatus === "confirmed") agendaRequests.current.settle(request, "confirmed");
        setAgendaStatus(booking.agendaStatus);
        return;
      }
      if (booking.isDryRun) {
        if (isRescheduling) {
          sdkActionManager?.fire(
            "dryRunRescheduleBookingSuccessfulV2",
            getDryRunRescheduleBookingSuccessfulEventPayload({
              ...booking,
              isRecurring: false,
            })
          );
        } else {
          sdkActionManager?.fire(
            "dryRunBookingSuccessfulV2",
            getDryRunBookingSuccessfulEventPayload({
              ...booking,
              isRecurring: false,
            })
          );
        }

        router.push("/booking/dry-run-successful");
        return;
      }

      if ("isShortCircuitedBooking" in booking && booking.isShortCircuitedBooking) {
        if (!booking.uid) {
          console.error("Decoy booking missing uid");
          return;
        }

        const bookingData = {
          uid: booking.uid,
          title: booking.title ?? null,
          startTime: booking.startTime,
          endTime: booking.endTime,
          booker: booking.attendees?.[0] ?? null,
          host: booking.user ?? null,
          location: booking.location ?? null,
        };

        storeDecoyBooking(bookingData);
        router.push(`/booking-successful/${booking.uid}`);
        return;
      }

      const { uid, paymentUid } = booking;
      const fullName = getFullName(bookingForm.getValues("responses.name"));

      const users = event.data?.subsetOfHosts?.length
        ? event.data?.subsetOfHosts.map((host) => host.user)
        : event.data?.subsetOfUsers;

      const validDuration = event.data?.isDynamic
        ? duration || event.data?.length
        : duration && event.data?.metadata?.multipleDuration?.includes(duration)
          ? duration
          : event.data?.length;

      if (isRescheduling) {
        sdkActionManager?.fire("rescheduleBookingSuccessful", {
          booking: booking,
          eventType: event.data,
          date: booking?.startTime?.toString() || "",
          duration: validDuration,
          organizer: {
            name: users?.[0]?.name || "Nameless",
            email: booking?.userPrimaryEmail || booking.user?.email || "Email-less",
            timeZone: booking.user?.timeZone || "Europe/London",
          },
          confirmed: !(booking.status === BookingStatus.PENDING && event.data?.requiresConfirmation),
        });
        sdkActionManager?.fire(
          "rescheduleBookingSuccessfulV2",
          getRescheduleBookingSuccessfulEventPayload({
            ...booking,
            isRecurring: false,
          })
        );
      } else {
        sdkActionManager?.fire("bookingSuccessful", {
          booking: booking,
          eventType: event.data,
          date: booking?.startTime?.toString() || "",
          duration: validDuration,
          organizer: {
            name: users?.[0]?.name || "Nameless",
            email: booking?.userPrimaryEmail || booking.user?.email || "Email-less",
            timeZone: booking.user?.timeZone || "Europe/London",
          },
          confirmed: !(booking.status === BookingStatus.PENDING && event.data?.requiresConfirmation),
        });

        sdkActionManager?.fire(
          "bookingSuccessfulV2",
          getBookingSuccessfulEventPayload({
            ...booking,
            isRecurring: false,
          })
        );
      }

      if (paymentUid) {
        router.push(
          createPaymentLink({
            paymentUid,
            date: timeslot,
            name: fullName,
            email: bookingForm.getValues("responses.email"),
            absolute: false,
          })
        );
        return;
      }

      if (!uid) {
        console.error("No uid returned from createBookingMutation");
        return;
      }

      const query = {
        isSuccessBookingPage: true,
        email: bookingForm.getValues("responses.email"),
        eventTypeSlug: eventSlug,
        seatReferenceUid: "seatReferenceUid" in booking ? (booking.seatReferenceUid as string) : null,
        formerTime:
          isRescheduling && bookingData?.startTime ? dayjs(bookingData.startTime).toString() : undefined,
        rescheduledBy, // ensure further reschedules performed on the success page are recorded correctly
      };

      bookingSuccessRedirect({
        successRedirectUrl: event?.data?.successRedirectUrl || "",
        query,
        booking: booking as unknown as Pick<
          BookingResponse,
          | "uid"
          | "title"
          | "description"
          | "startTime"
          | "endTime"
          | "location"
          | "attendees"
          | "user"
          | "responses"
        >,
        forwardParamsSuccessRedirect:
          event?.data?.forwardParamsSuccessRedirect === undefined
            ? true
            : event?.data?.forwardParamsSuccessRedirect,
      });
    },
    onError: (err, request) => {
      if (process.env.NEXT_PUBLIC_NEXUS_BOOKING_ENABLED === "1" && "statusCode" in err && (err.statusCode === 400 || err.statusCode === 409)) agendaRequests.current.settle(request, "rejected");
      if (bookerFormErrorRef?.current) {
        bookerFormErrorRef.current.scrollIntoView({ behavior: "smooth" });
      }

      const error = err as Error & {
        data: { rescheduleUid: string; startTime: string; attendees: string[]; seatUid?: string };
        traceId?: string;
      };

      if (error.message === ErrorCode.BookerLimitExceededReschedule && error.data?.rescheduleUid) {
        setRescheduleUid(error.data?.seatUid ?? error.data?.rescheduleUid);
        setBookingData({
          uid: error.data?.rescheduleUid,
          startTime: error.data?.startTime,
          attendees: error.data?.attendees,
        } as unknown as GetBookingType);
      }
    },
  });

  const createRecurringBookingMutation = useMutation({
    mutationFn: createRecurringBooking,
    onSuccess: async (bookings) => {
      const booking = bookings[0] || {};

      if (booking.isDryRun) {
        if (isRescheduling) {
          sdkActionManager?.fire("dryRunRescheduleBookingSuccessfulV2", {
            ...getDryRunRescheduleBookingSuccessfulEventPayload({
              ...booking,
              isRecurring: true,
            }),
            allBookings: bookings.map((booking) => ({
              startTime: booking.startTime,
              endTime: booking.endTime,
            })),
          });
        } else {
          sdkActionManager?.fire("dryRunBookingSuccessfulV2", {
            ...getDryRunBookingSuccessfulEventPayload({
              ...booking,
              isRecurring: true,
            }),
            allBookings: bookings.map((booking) => ({
              startTime: booking.startTime,
              endTime: booking.endTime,
            })),
          });
        }

        router.push("/booking/dry-run-successful");
        return;
      }

      const { uid } = booking;

      if (!uid) {
        console.error("No uid returned from createRecurringBookingMutation");
        return;
      }

      const query = {
        isSuccessBookingPage: true,
        allRemainingBookings: true,
        email: bookingForm.getValues("responses.email"),
        eventTypeSlug: eventSlug,
        formerTime:
          isRescheduling && bookingData?.startTime ? dayjs(bookingData.startTime).toString() : undefined,
      };

      if (isRescheduling) {
        // NOTE: It is recommended to define the event payload in the argument itself to provide a better type safety.
        sdkActionManager?.fire("rescheduleBookingSuccessfulV2", {
          ...getRescheduleBookingSuccessfulEventPayload({
            ...booking,
            isRecurring: true,
          }),
          allBookings: bookings.map((booking) => ({
            startTime: booking.startTime,
            endTime: booking.endTime,
          })),
        });
      } else {
        sdkActionManager?.fire("bookingSuccessfulV2", {
          ...getBookingSuccessfulEventPayload({
            ...booking,
            isRecurring: true,
          }),
          allBookings: bookings.map((booking) => ({
            startTime: booking.startTime,
            endTime: booking.endTime,
          })),
        });
      }

      bookingSuccessRedirect({
        successRedirectUrl: event?.data?.successRedirectUrl || "",
        query,
        booking: booking as unknown as Pick<
          BookingResponse,
          | "uid"
          | "title"
          | "description"
          | "startTime"
          | "endTime"
          | "location"
          | "attendees"
          | "user"
          | "responses"
        >,
        forwardParamsSuccessRedirect:
          event?.data?.forwardParamsSuccessRedirect === undefined
            ? true
            : event?.data?.forwardParamsSuccessRedirect,
      });
    },
    onError: (err, _, ctx) => {
      console.error("Error creating recurring booking", err);
      // eslint-disable-next-line @calcom/eslint/no-scroll-into-view-embed -- It is only called when user takes an action in embed
      bookerFormErrorRef && bookerFormErrorRef.current?.scrollIntoView({ behavior: "smooth" });
    },
  });

  const handleBookEvent = useHandleBookEvent({
    event,
    bookingForm,
    hashedLink,
    metadata,
    handleRecBooking: createRecurringBookingMutation.mutate,
    handleBooking: (data, callbacks) => createBookingMutation.mutate({ data }, callbacks),
    isBookingDryRun,
  });

  const errors = {
    hasDataErrors: Boolean(createBookingMutation.isError || createRecurringBookingMutation.isError),
    dataErrors: createBookingMutation.error || createRecurringBookingMutation.error,
  };

  // A redirect is triggered on mutation success, so keep the loading state while it is happening.
  const loadingStates = {
    creatingBooking: createBookingMutation.isPending || createBookingMutation.isSuccess,
    creatingRecurringBooking:
      createRecurringBookingMutation.isPending || createRecurringBookingMutation.isSuccess,
  };

  return {
    agendaStatus,
    agendaRecoveryError,
    checkingAgendaStatus: agendaStatusMutation.isPending,
    refreshAgendaStatus,
    returnToBookingForm: () => {
      if (agendaStatus === "rejected") setSelectedTimeslot(null);
      setAgendaStatus(null);
      setAgendaRecoveryError(null);
      agendaStatusMutation.reset();
      createBookingMutation.reset();
    },
    handleBookEvent,
    bookingForm,
    bookerFormErrorRef,
    errors,
    loadingStates,
  };
};
