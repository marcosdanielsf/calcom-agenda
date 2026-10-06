"use client";

// Criado: 2026-10-05 23:36 BRT. Preferencia visual, nunca autoridade de acesso.
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

export const NEXUS_SHELL_COOKIE = "nexus_agenda_shell";
const routes = ["/event-types", "/bookings", "/availability", "/apps", "/settings"];
const NexusShellContext = createContext(false);

export function isNexusShellRoute(pathname: string | null) {
  return routes.some((route) => pathname === route || pathname?.startsWith(`${route}/`));
}

export function NexusShellProvider({
  initialPreference,
  children,
}: {
  initialPreference?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const requested = search?.get("shell");
  const [preference, setPreference] = useState(initialPreference === "nexus");
  const allowed = isNexusShellRoute(pathname);
  // A URL explicita ganha do cookie, inclusive para sair do modo integrado.
  const active =
    allowed &&
    search?.get("standalone") !== "true" &&
    (requested == null ? preference : requested === "nexus");

  useEffect(() => {
    if (!allowed || (requested !== "nexus" && requested !== "standalone")) return;
    const enabled = requested === "nexus";
    setPreference(enabled);
    try {
      document.cookie = `${NEXUS_SHELL_COOKIE}=${enabled ? "nexus" : ""}; Path=/; SameSite=Lax; Max-Age=${enabled ? 86400 : 0}${window.location.protocol === "https:" ? "; Secure" : ""}`;
    } catch {
      // Bloqueio de cookies nao deve impedir o modo explicito nesta aba.
    }
  }, [allowed, requested]);

  return (
    <NexusShellContext.Provider value={active}>
      {active && <span hidden data-nexus-shell="true" />}
      {children}
    </NexusShellContext.Provider>
  );
}

export const useNexusShell = () => useContext(NexusShellContext);
