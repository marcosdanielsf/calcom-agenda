// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  type AgendaIaBooking,
  type AgendaIaDeps,
  NexusAgendaIaError,
  nexusAgendaIaInputSchema,
  runNexusAgendaIaOp,
} from "./agendaIa";

const NOW = new Date("2026-11-03T12:00:00Z");
const OWNER = 7;
const FUTURE = "2026-11-04T14:00:00.000Z";
const atendido: AgendaIaBooking = {
  uid: "abcdefgh12345678",
  startTime: "2026-11-05T14:00:00.000Z",
  endTime: "2026-11-05T14:30:00.000Z",
  status: "accepted",
  title: "Consulta",
  eventTypeId: 11,
  attendee: { name: "Ana", email: "ana@example.com", phone: "+5511999990000" },
};

function deps(over: Partial<AgendaIaDeps> = {}): AgendaIaDeps {
  return {
    eventTypeOwner: vi.fn(async (id: number) => (id === 11 ? OWNER : 99)),
    slots: vi.fn(async () => ({
      "2026-11-04": [{ time: FUTURE }, { time: "2026-11-02T10:00:00.000Z" }],
    })),
    createBooking: vi.fn(async () => ({ uid: "novo-uid-12345678" })),
    cancelBooking: vi.fn(async () => ({ success: true })),
    findBookings: vi.fn(async () => [atendido]),
    now: () => NOW,
    ...over,
  };
}

describe("agenda da IA", () => {
  it("horarios: devolve so os futuros e recusa tipo de outra conta", async () => {
    const d = deps();
    const input = nexusAgendaIaInputSchema.parse({
      op: "slots",
      eventTypeId: 11,
      startTime: "2026-11-03T00:00:00Z",
      endTime: "2026-11-10T00:00:00Z",
    });
    expect(await runNexusAgendaIaOp(OWNER, input, d)).toEqual({
      slots: [FUTURE],
    });
    await expect(
      runNexusAgendaIaOp(OWNER, ({ ...input, eventTypeId: 12 } as typeof input), d)
    ).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("reservar: nao grava em tipo alheio nem no passado, e horario ocupado vira 409", async () => {
    const d = deps();
    const input = nexusAgendaIaInputSchema.parse({
      op: "book",
      eventTypeId: 11,
      start: FUTURE,
      attendee: { name: "Ana", email: "ana@example.com" },
    });
    await expect(
      runNexusAgendaIaOp(OWNER, ({ ...input, eventTypeId: 12 } as typeof input), d)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      runNexusAgendaIaOp(OWNER, ({ ...input, start: "2026-11-01T10:00:00Z" } as typeof input), d)
    ).rejects.toMatchObject({ code: "slot_unavailable" });
    expect(d.createBooking).not.toHaveBeenCalled();
    expect(await runNexusAgendaIaOp(OWNER, input, d)).toEqual({
      uid: "novo-uid-12345678",
    });
    const busy = deps({
      createBooking: vi.fn(async () => {
        throw Object.assign(new Error("busy"), { statusCode: 409 });
      }),
    });
    await expect(runNexusAgendaIaOp(OWNER, input, busy)).rejects.toMatchObject({
      code: "slot_unavailable",
      status: 409,
    });
  });

  it("reserva sem uid de volta nao conta como confirmada", async () => {
    const d = deps({ createBooking: vi.fn(async () => ({ uid: null })) });
    const input = nexusAgendaIaInputSchema.parse({
      op: "book",
      eventTypeId: 11,
      start: FUTURE,
      attendee: { name: "Ana", email: "ana@example.com" },
    });
    await expect(runNexusAgendaIaOp(OWNER, input, d)).rejects.toMatchObject({
      code: "failed",
      status: 502,
    });
  });

  it("remarcar: reaproveita o participante da reserva e manda o uid antigo", async () => {
    const d = deps();
    const input = nexusAgendaIaInputSchema.parse({
      op: "reschedule",
      uid: atendido.uid,
      start: FUTURE,
    });
    expect(await runNexusAgendaIaOp(OWNER, input, d)).toEqual({
      uid: "novo-uid-12345678",
    });
    expect(d.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        eventTypeId: 11,
        email: "ana@example.com",
        rescheduleUid: atendido.uid,
        ownerId: OWNER,
      })
    );
    const none = deps({ findBookings: vi.fn(async () => []) });
    await expect(runNexusAgendaIaOp(OWNER, input, none)).rejects.toMatchObject({
      status: 404,
    });
    expect(none.createBooking).not.toHaveBeenCalled();
  });

  it("cancelar: so reserva do dono, e falha do motor nao vira sucesso", async () => {
    const input = nexusAgendaIaInputSchema.parse({
      op: "cancel",
      uid: atendido.uid,
    });
    const none = deps({ findBookings: vi.fn(async () => []) });
    await expect(runNexusAgendaIaOp(OWNER, input, none)).rejects.toBeInstanceOf(
      NexusAgendaIaError
    );
    expect(none.cancelBooking).not.toHaveBeenCalled();
    const d = deps();
    expect(await runNexusAgendaIaOp(OWNER, input, d)).toEqual({
      uid: atendido.uid,
      status: "cancelled",
    });
    const fail = deps({
      cancelBooking: vi.fn(async () => ({ success: false })),
    });
    await expect(runNexusAgendaIaOp(OWNER, input, fail)).rejects.toMatchObject({
      status: 502,
    });
  });

  it("entrada: listar exige e-mail ou telefone e campo extra e recusado", async () => {
    const bare = nexusAgendaIaInputSchema.parse({ op: "list" });
    await expect(runNexusAgendaIaOp(OWNER, bare, deps())).rejects.toMatchObject(
      { status: 400 }
    );
    expect(
      nexusAgendaIaInputSchema.safeParse({
        op: "list",
        phone: "+5511999990000",
      }).success
    ).toBe(true);
    expect(
      nexusAgendaIaInputSchema.safeParse({
        op: "cancel",
        uid: "abcdefgh12345678",
        userId: 1,
      }).success
    ).toBe(false);
  });
});
