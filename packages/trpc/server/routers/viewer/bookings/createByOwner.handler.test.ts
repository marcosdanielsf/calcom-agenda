import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createByOwnerHandler, NEXUS_OWNER_BOOKING_ORIGIN } from "./createByOwner.handler";
import { ZCreateByOwnerInputSchema } from "./createByOwner.schema";

const mockFindUnique = vi.fn();
const mockCreateBooking = vi.fn();

vi.mock("@calcom/prisma", () => ({
  prisma: { eventType: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
  default: {},
}));
vi.mock("@calcom/features/bookings/di/RegularBookingService.container", () => ({
  getRegularBookingService: () => ({ createBooking: mockCreateBooking }),
}));
const mockRateLimit = vi.fn();
vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: (...args: unknown[]) => mockRateLimit(...args),
}));
const mockUsesNexusBooking = vi.fn(() => false);
vi.mock("@calcom/lib/nexus-booking/server", () => ({
  usesNexusBooking: () => mockUsesNexusBooking(),
}));

const input = {
  eventTypeId: 7,
  start: "2026-10-14T16:00:00.000Z",
  end: "2026-10-14T16:30:00.000Z",
  timeZone: "America/Sao_Paulo",
  attendee: { name: "Ana Cliente", email: "ana@example.com", phoneNumber: "+5511999998888" },
  notes: "Primeira consulta",
};
const ctx = { user: { id: 42, locale: "pt-BR" }, req: { headers: { host: "agenda.socialfy.me" } } };

describe("createByOwnerHandler", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockCreateBooking.mockReset();
    mockCreateBooking.mockResolvedValue({ uid: "abc", id: 99 });
    mockRateLimit.mockReset();
    mockRateLimit.mockResolvedValue(undefined);
    mockUsesNexusBooking.mockReturnValue(false);
  });

  it("dono do tipo cria a reserva sem trava de disponibilidade nem de limite", async () => {
    mockFindUnique.mockResolvedValue({ id: 7, userId: 42 });

    const result = await createByOwnerHandler({ ctx, input });

    expect(result).toEqual({ uid: "abc", id: 99 });
    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
    const call = mockCreateBooking.mock.calls[0][0];
    expect(call.bookingMeta).toMatchObject({
      userId: 42,
      skipAvailabilityCheck: true,
      skipEventLimitsCheck: true,
      isOwnerBooking: true,
    });
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ rateLimitingType: "core", identifier: "createByOwner:42" })
    );
    expect(call.bookingData).toMatchObject({
      eventTypeId: 7,
      start: input.start,
      end: input.end,
      timeZone: "America/Sao_Paulo",
      language: "pt-BR",
      metadata: { nexusOrigin: NEXUS_OWNER_BOOKING_ORIGIN },
      responses: {
        name: "Ana Cliente",
        email: "ana@example.com",
        attendeePhoneNumber: "+5511999998888",
        notes: "Primeira consulta",
      },
    });
  });

  it("tipo de equipe (sem dono pessoal) é recusado mesmo para o anfitrião", async () => {
    mockFindUnique.mockResolvedValue({ id: 7, userId: null });
    await expect(createByOwnerHandler({ ctx, input })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it("notifyAttendee falso vira noEmail; omitido mantém o e-mail", async () => {
    mockFindUnique.mockResolvedValue({ id: 7, userId: 42 });
    await createByOwnerHandler({ ctx, input: { ...input, notifyAttendee: false } });
    expect(mockCreateBooking.mock.calls[0][0].bookingData.noEmail).toBe(true);
    await createByOwnerHandler({ ctx, input });
    expect(mockCreateBooking.mock.calls[1][0].bookingData.noEmail).toBe(false);
  });

  it("tipo de outra conta responde como inexistente e não cria nada", async () => {
    mockFindUnique.mockResolvedValue({ id: 7, userId: 1 });
    await expect(createByOwnerHandler({ ctx, input })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it("em modo Nexus recusa antes de tocar no banco", async () => {
    mockUsesNexusBooking.mockReturnValue(true);
    await expect(createByOwnerHandler({ ctx, input })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it("limite de taxa estourado recusa antes de criar", async () => {
    mockRateLimit.mockRejectedValue(new Error("rate_limited"));
    mockFindUnique.mockResolvedValue({ id: 7, userId: 42 });
    await expect(createByOwnerHandler({ ctx, input })).rejects.toThrow("rate_limited");
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  it("tipo que não existe responde NOT_FOUND", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(createByOwnerHandler({ ctx, input })).rejects.toBeInstanceOf(TRPCError);
  });

  it("telefone e observação vazios ficam fora das respostas", async () => {
    mockFindUnique.mockResolvedValue({ id: 7, userId: 42 });
    await createByOwnerHandler({
      ctx,
      input: { ...input, attendee: { name: "Ana", email: "ana@example.com" }, notes: undefined },
    });
    const responses = mockCreateBooking.mock.calls[0][0].bookingData.responses;
    expect(responses).not.toHaveProperty("attendeePhoneNumber");
    expect(responses).not.toHaveProperty("notes");
  });
});

describe("ZCreateByOwnerInputSchema", () => {
  it("recusa fim antes do início", () => {
    const parsed = ZCreateByOwnerInputSchema.safeParse({ ...input, end: "2026-10-14T15:00:00.000Z" });
    expect(parsed.success).toBe(false);
  });

  it("recusa telefone fora do E.164", () => {
    const parsed = ZCreateByOwnerInputSchema.safeParse({
      ...input,
      attendee: { ...input.attendee, phoneNumber: "11 99999-8888" },
    });
    expect(parsed.success).toBe(false);
  });

  it("aceita sem telefone e sem observação", () => {
    const parsed = ZCreateByOwnerInputSchema.safeParse({
      ...input,
      attendee: { name: "Ana", email: "ana@example.com" },
      notes: undefined,
    });
    expect(parsed.success).toBe(true);
  });
});
