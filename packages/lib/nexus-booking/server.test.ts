import { afterEach, describe, expect, it, vi } from "vitest";
import { getNexusSchedule, readNexusBookingStatus, resolveNexusBinding, submitNexusBooking, usesNexusBooking } from "./server";

const token = "synthetic_local_preview_token_000000000001";
const env = { NODE_ENV: "development", NEXUS_BOOKING_MODE: "nexus", NEXUS_BOOKING_ORIGIN: "http://127.0.0.1:3118", NEXUS_BOOKING_BINDINGS: JSON.stringify([{ eventTypeId: 1, username: "socialfy", slug: "demonstracao", durationMinutes: 30, token }]) };
const input = { eventTypeId: 1, startTime: "2026-09-10T00:00:00Z", endTime: "2026-09-11T00:00:00Z", timeZone: "America/Sao_Paulo" };
const body = { eventTypeId: 1, start: "2026-09-10T12:00:00Z", responses: { name: "Pessoa Teste", email: "test@example.test", attendeePhoneNumber: "+15555550101", nexusTransactionalMessages: true } };
const key = "local_attempt_00000001";
afterEach(() => vi.unstubAllGlobals());

describe("server-owned agenda bridge", () => {
  it.each(["confirmed", "processing", "rejected"])("reads %s without submitting again or exposing provider fields", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, status, providerBookingId: "private" }));
    vi.stubGlobal("fetch", fetcher);
    expect(await readNexusBookingStatus({ eventTypeId: 1 }, key, env)).toEqual({ agendaStatus: status });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toMatch(/\/reservations\/status$/);
    expect(fetcher.mock.calls[0][0]).not.toContain(key);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", headers: { "idempotency-key": key }, cache: "no-store" });
  });
  it("fails closed on missing and malformed status, keeping reads side-effect free", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ success: false }, { status: 404 })).mockResolvedValueOnce(Response.json({ success: true, status: "unknown" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(readNexusBookingStatus({ eventTypeId: 1 }, key, env)).rejects.toMatchObject({ statusCode: 404 });
    await expect(readNexusBookingStatus({ eventTypeId: 1 }, key, env)).rejects.toMatchObject({ statusCode: 503 });
    await expect(readNexusBookingStatus({ eventTypeId: 2 }, key, env)).rejects.toMatchObject({ statusCode: 404 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails closed with partial configuration and unknown/conflicting bindings", () => {
    expect(usesNexusBooking({ NEXUS_BOOKING_ORIGIN: "x" })).toBe(true);
    expect(() => resolveNexusBinding({ eventTypeId: 1 }, {})).toThrow("Agenda indisponível");
    expect(() => resolveNexusBinding({ eventTypeId: 2 }, env)).toThrow();
    expect(() => resolveNexusBinding({ eventTypeId: 1, usernameList: ["other"] }, env)).toThrow();
    expect(resolveNexusBinding({ eventTypeSlug: "demonstracao", usernameList: ["socialfy"] }, env).binding.eventTypeId).toBe(1);
  });
  it("rejects credential-bearing origins and cleartext production", () => {
    expect(() => resolveNexusBinding({ eventTypeId: 1 }, { ...env, NODE_ENV: "production" })).toThrow();
    expect(() => resolveNexusBinding({ eventTypeId: 1 }, { ...env, NEXUS_BOOKING_ORIGIN: "https://user:secret@example.test" })).toThrow();
  });
  it("maps UTC slots to visitor calendar day, sorts and deduplicates", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, timezone: "America/Sao_Paulo", slots: [
      { startAt: "2026-09-10T01:00:00Z", endAt: null }, { startAt: "2026-09-10T01:00:00Z", endAt: null },
    ] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getNexusSchedule({ ...input, duration: "" }, env)).toEqual({ slots: { "2026-09-09": [{ time: "2026-09-10T01:00:00.000Z" }] } });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", redirect: "error" });
  });
  it("splits multi-month reads into windows of at most 31 days", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, timezone: "UTC", slots: [] }));
    fetcher.mockImplementation(async () => Response.json({ success: true, timezone: "UTC", slots: [] }));
    vi.stubGlobal("fetch", fetcher);
    await getNexusSchedule({ ...input, endTime: "2026-11-10T00:00:00Z" }, env);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url] of fetcher.mock.calls) {
      const query = new URL(url).searchParams;
      expect(Date.parse(query.get("endAt")!) - Date.parse(query.get("startAt")!)).toBeLessThanOrEqual(31 * 86400000);
    }
  });
  it("does not fall back or expose the private token after network failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error(`bad URL ${token}`));
    vi.stubGlobal("fetch", fetcher);
    await expect(getNexusSchedule(input, env)).rejects.toThrow("Não foi possível consultar a agenda");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("requires explicit consent and international phone before any fetch", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(submitNexusBooking({ ...body, responses: { ...body.responses, nexusTransactionalMessages: false } }, key, env)).rejects.toThrow();
    await expect(submitNexusBooking({ ...body, responses: { ...body.responses, attendeePhoneNumber: "111" } }, key, env)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("projects only allowed contact, slot and consent fields and preserves the retry key", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ success: true, status: "confirmed" }, { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    const forged = { ...body, tenantId: "other", metadata: { calendarId: "other" } };
    expect(await submitNexusBooking(forged, key, env)).toEqual({ agendaStatus: "confirmed" });
    await submitNexusBooking(forged, key, env);
    const sent = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(Object.keys(sent)).toEqual(["contact", "slot", "consent"]);
    expect(sent.slot.endAt).toBe("2026-09-10T12:30:00.000Z");
    expect(fetcher.mock.calls[0][1].headers["idempotency-key"]).toBe(fetcher.mock.calls[1][1].headers["idempotency-key"]);
    expect(fetcher.mock.calls[0][0]).toContain(token);
  });
  it("keeps 202 as processing without fabricating a reservation UID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true, status: "processing" }, { status: 202 })));
    expect(await submitNexusBooking(body, key, env)).toEqual({ agendaStatus: "processing" });
  });
  it("rejects a mismatched response and unsupported reschedule without native fallback", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, status: "confirmed" }, { status: 202 })); vi.stubGlobal("fetch", fetcher);
    await expect(submitNexusBooking({ ...body, rescheduleUid: "old" }, key, env)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(submitNexusBooking(body, key, env)).rejects.toThrow("Não foi possível confirmar");
  });
  it("preserves slot rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: false }, { status: 409 })));
    await expect(submitNexusBooking(body, key, env)).rejects.toMatchObject({ statusCode: 409 });
  });
});
