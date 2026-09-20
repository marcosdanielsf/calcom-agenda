// Updated: 2026-09-09 08:06 BRT.
type Attempt = { key: string; fingerprint: string; confirmed: boolean };
export type AgendaStatus = "confirmed" | "processing" | "rejected";
type Submission = { eventTypeId: number; start: string; end?: string; responses?: unknown };
const storageKey = (eventTypeId: number) => `agenda-attempt-v1:${eventTypeId}`;

export function readAgendaAttempt(eventTypeId: number, storage: Storage = sessionStorage): Attempt | null {
  try {
    const raw = storage.getItem(storageKey(eventTypeId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("key" in value) || typeof value.key !== "string" || !/^[A-Za-z0-9_-]{16,200}$/.test(value.key)
      || !("fingerprint" in value) || typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint)
      || !("confirmed" in value) || typeof value.confirmed !== "boolean") throw new Error();
    return { key: value.key, fingerprint: value.fingerprint, confirmed: value.confirmed };
  } catch { throw new Error("Não foi possível recuperar a tentativa neste navegador. Não inicie outra reserva sem verificar a anterior."); }
}

export async function readAgendaReservationStatus(eventTypeId: number, key: string): Promise<AgendaStatus> {
  const response = await fetch(`/api/book/status?eventTypeId=${eventTypeId}`, {
    method: "GET", headers: { "idempotency-key": key }, cache: "no-store",
  }).catch(() => { throw new Error("Não foi possível consultar a reserva. Tente verificar novamente."); });
  if (response.status === 404) throw new Error("Não encontramos esta reserva. Você pode retomar o formulário com os mesmos dados, sem iniciar uma nova tentativa.");
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== "object" || !("agendaStatus" in data)
    || (data.agendaStatus !== "confirmed" && data.agendaStatus !== "processing" && data.agendaStatus !== "rejected")) throw new Error("Não foi possível consultar a reserva. Tente verificar novamente.");
  return data.agendaStatus;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

// Persist only a random key and SHA-256, never contact data or private page tokens.
export async function getAgendaAttempt(data: Submission, storage: Storage = sessionStorage): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical({ eventTypeId: data.eventTypeId, start: data.start, end: data.end, responses: data.responses })));
  const fingerprint = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
  const previous = readAgendaAttempt(data.eventTypeId, storage);
  if (previous?.fingerprint === fingerprint) return previous.key;
  if (previous && !previous.confirmed) throw new Error("Existe uma tentativa sem confirmação. Reenvie os mesmos dados antes de iniciar outra reserva.");
  const attempt: Attempt = { key: crypto.randomUUID(), fingerprint, confirmed: false };
  storage.setItem(storageKey(data.eventTypeId), JSON.stringify(attempt));
  return attempt.key;
}

export function settleAgendaAttempt(eventTypeId: number, outcome: "confirmed" | "rejected", storage: Storage = sessionStorage, expectedKey?: string) {
  const key = storageKey(eventTypeId);
  const attempt = readAgendaAttempt(eventTypeId, storage);
  if (!attempt || (expectedKey && attempt.key !== expectedKey)) return;
  if (outcome === "rejected") storage.removeItem(key);
  else storage.setItem(key, JSON.stringify({ ...attempt, confirmed: true }));
}

// Each mutation owns an object identity. Keep its key out of errors/results and
// never let callbacks from an earlier request settle a later stored attempt.
export function createAgendaRequestTracker<T extends Submission>() {
  const keys = new WeakMap<{ data: T }, string>();
  return {
    async prepare(request: { data: T }, storage: Storage = sessionStorage) {
      const key = await getAgendaAttempt(request.data, storage);
      keys.set(request, key);
      return key;
    },
    isCurrent(request: { data: T }, storage: Storage = sessionStorage) {
      const key = keys.get(request);
      return Boolean(key && readAgendaAttempt(request.data.eventTypeId, storage)?.key === key);
    },
    settle(request: { data: T }, outcome: "confirmed" | "rejected", storage: Storage = sessionStorage) {
      const key = keys.get(request);
      if (key) settleAgendaAttempt(request.data.eventTypeId, outcome, storage, key);
    },
  };
}
