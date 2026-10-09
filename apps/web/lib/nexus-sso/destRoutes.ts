// Modulo puro (sem node:*), importado pelo servidor (login unico) e pelo navegador (NexusShell).
// Mapa unico de destino do Nexus para rota do motor.
export const DEST_ROUTES = {
  "event-types": "/event-types",
  bookings: "/bookings/upcoming",
  availability: "/availability",
  // Integrações do Nexus abre direto nos calendários conectados: a loja de apps mostra nome de fornecedor.
  apps: "/settings/my-account/calendars",
  settings: "/settings/my-account/profile",
} as const;

export type NexusSsoDest = keyof typeof DEST_ROUTES;

export function resolveDestRoute(dest: unknown): string | null {
  if (typeof dest !== "string" || !Object.hasOwn(DEST_ROUTES, dest)) return null;
  return DEST_ROUTES[dest as NexusSsoDest];
}

// Abas que o Nexus mostra. "apps" fica de fora: a aba Integrações caiu dentro de Configurações.
const SEGMENT_TO_DEST: Record<string, NexusSsoDest> = {
  "event-types": "event-types",
  bookings: "bookings",
  availability: "availability",
  settings: "settings",
};

// Aba do Nexus a que um pathname do motor pertence (/bookings/past vira bookings), ou null.
export function routeToDest(pathname: string | null | undefined): NexusSsoDest | null {
  if (!pathname) return null;
  const segment = pathname.split("/")[1] ?? "";
  return Object.hasOwn(SEGMENT_TO_DEST, segment) ? SEGMENT_TO_DEST[segment] : null;
}
