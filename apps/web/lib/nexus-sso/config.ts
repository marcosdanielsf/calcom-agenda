import process from "node:process";
import { resolveLocalThemeMessageOrigin } from "../../modules/shell/nexusThemeOrigin";

export const NEXUS_SSO_ISSUER = "https://nexus.socialfy.me";
export const NEXUS_SSO_AUDIENCE = "https://agenda.socialfy.me";
// Chamada servidor a servidor do Nexus para criar o tipo de agendamento de um servico do
// catalogo. Destino proprio: o token do login unico nao serve aqui, e este nao serve no login.
export const NEXUS_EVENT_TYPES_AUDIENCE = `${NEXUS_SSO_AUDIENCE}/api/nexus/event-types`;
export const NEXUS_SSO_PROVIDER = "nexus";
export const NEXUS_SSO_JTI_IDENTIFIER = "nexus-sso";
export const NEXUS_SSO_MAX_TOKEN_TTL_SECONDS = 60;
export const NEXUS_SSO_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const DEST_ROUTES = {
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

export function normalizeTheme(theme: unknown): "light" | "dark" {
  return theme === "dark" ? "dark" : "light";
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === NEXUS_SSO_ISSUER) return true;
  const local = resolveLocalThemeMessageOrigin(
    process.env.NEXUS_AGENDA_LOCAL_PARENT_ORIGIN,
    process.env.NODE_ENV
  );
  return local !== undefined && origin === local;
}
