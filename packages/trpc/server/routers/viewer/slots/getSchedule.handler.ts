import { getAvailableSlotsService } from "@calcom/features/di/containers/AvailableSlots";
import { getNexusSchedule, usesNexusBooking } from "@calcom/lib/nexus-booking/server";

import type { GetScheduleOptions } from "./types";

export const getScheduleHandler = async ({ ctx, input }: GetScheduleOptions) => {
  if (usesNexusBooking()) return getNexusSchedule(input);
  const availableSlotsService = getAvailableSlotsService();
  return await availableSlotsService.getAvailableSlots({ ctx, input });
};
