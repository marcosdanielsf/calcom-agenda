import { post } from "@calcom/lib/fetch-wrapper";

import type { BookingCreateBody, BookingResponse } from "../types";

export const createBooking = async (data: BookingCreateBody, requestKey?: string) => {
  const response = await post<
    BookingCreateBody,
    // fetch response can't have a Date type, it must be a string
    Omit<BookingResponse, "startTime" | "endTime"> & {
      startTime: string;
      endTime: string;
      agendaStatus?: "confirmed" | "processing";
    }
  >("/api/book/event", data, requestKey ? { headers: { "Content-Type": "application/json", "idempotency-key": requestKey } } : undefined);
  return response;
};
