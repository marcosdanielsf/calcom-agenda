import { afterEach, expect, it, vi } from "vitest";
import { createAgendaRequestTracker, getAgendaAttempt, readAgendaAttempt, readAgendaReservationStatus, settleAgendaAttempt } from "./client";
afterEach(() => vi.unstubAllGlobals());

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } };
}
const data = { eventTypeId: 1, start: "2026-09-10T12:00:00Z", responses: { name: "Pessoa Teste", email: "test@example.test" } };
it("preserves key across reload/retry without storing contact data and blocks changed ambiguous requests", async () => {
  const state = storage();
  const first = await getAgendaAttempt(data, state);
  expect(await getAgendaAttempt({ ...data }, state)).toBe(first);
  expect(state.getItem(state.key(0)!)).not.toContain("Pessoa");
  expect(state.getItem(state.key(0)!)).not.toContain("example.test");
  await expect(getAgendaAttempt({ ...data, start: "2026-09-11T12:00:00Z" }, state)).rejects.toThrow("sem confirmação");
  settleAgendaAttempt(1, "confirmed", state);
  expect(await getAgendaAttempt(data, state)).toBe(first);
  expect(await getAgendaAttempt({ ...data, start: "2026-09-11T12:00:00Z" }, state)).not.toBe(first);
});
it("permits a new attempt after a definitive rejection", async () => {
  const state = storage();
  const first = await getAgendaAttempt(data, state);
  settleAgendaAttempt(1, "rejected", state);
  expect(await getAgendaAttempt(data, state)).not.toBe(first);
});

it("recovers pending identity after reload and a stale lookup cannot erase a different attempt", async () => {
  const state = storage();
  const first = await getAgendaAttempt(data, state);
  expect(readAgendaAttempt(1, state)).toMatchObject({ key: first, confirmed: false });
  settleAgendaAttempt(1, "rejected", state, "different_attempt_key");
  expect(readAgendaAttempt(1, state)?.key).toBe(first);
  state.setItem(state.key(0)!, "invalid stored record");
  await expect(getAgendaAttempt(data, state)).rejects.toThrow("Não foi possível recuperar");
  expect(state.getItem(state.key(0)!)).toBe("invalid stored record");
});

it("checks existing status using only GET and rejects non-string confirmation", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ agendaStatus: "confirmed" })).mockResolvedValueOnce(Response.json({ agendaStatus: ["confirmed"] }));
  vi.stubGlobal("fetch", fetcher);
  expect(await readAgendaReservationStatus(1, "same_attempt_key_12345")).toBe("confirmed");
  await expect(readAgendaReservationStatus(1, "same_attempt_key_12345")).rejects.toThrow("Não foi possível consultar");
  expect(fetcher.mock.calls[0][0]).toBe("/api/book/status?eventTypeId=1");
  expect(fetcher.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
});

it("late submit callbacks cannot reject or confirm the following attempt", async () => {
  const state = storage();
  const requests = createAgendaRequestTracker<typeof data>();
  const first = { data }, second = { data: { ...data, start: "2026-09-11T12:00:00Z" } };
  const firstKey = await requests.prepare(first, state);
  requests.settle(first, "rejected", state);
  const secondKey = await requests.prepare(second, state);
  expect(secondKey).not.toBe(firstKey);
  expect(requests.isCurrent(first, state)).toBe(false);
  requests.settle(first, "confirmed", state);
  expect(readAgendaAttempt(1, state)).toMatchObject({ key: secondKey, confirmed: false });
  requests.settle(first, "rejected", state);
  expect(readAgendaAttempt(1, state)).toMatchObject({ key: secondKey, confirmed: false });
  requests.settle({ data }, "rejected", state);
  expect(readAgendaAttempt(1, state)?.key).toBe(secondKey);
  requests.settle(second, "confirmed", state);
  expect(readAgendaAttempt(1, state)).toMatchObject({ key: secondKey, confirmed: true });
});
