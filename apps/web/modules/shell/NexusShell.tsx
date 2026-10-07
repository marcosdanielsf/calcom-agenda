"use client";

import { useIsStandalone } from "@calcom/lib/hooks/useIsStandalone";
// Atualizado: 2026-10-06 10:12 BRT. Preferencias visuais, nunca autoridade de acesso.
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

export const NEXUS_SHELL_COOKIE = "nexus_agenda_shell";
export const NEXUS_THEME_COOKIE = "nexus_agenda_theme";
const NEXUS_THEME_PARENT_ORIGIN = "https://nexus.socialfy.me";
const routes = ["/event-types", "/bookings", "/availability", "/apps", "/settings"];
const NexusShellContext = createContext(false);
type NexusTheme = "light" | "dark";
type ParentTheme = { theme: NexusTheme; requestSignature: string };
const NexusThemeContext = createContext<NexusTheme | null>(null);

function applyDocumentTheme(theme: NexusTheme) {
  const root = document.documentElement;
  if (root.dataset.nexusThemeOwned !== "true") {
    root.dataset.nexusPreviousDark = root.classList.contains("dark") ? "true" : "false";
    root.dataset.nexusPreviousColorScheme = root.style.colorScheme;
  }
  root.dataset.nexusThemeOwned = "true";
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function restoreDocumentTheme() {
  const root = document.documentElement;
  if (root.dataset.nexusThemeOwned !== "true") return;
  root.classList.toggle("dark", root.dataset.nexusPreviousDark === "true");
  root.style.colorScheme = root.dataset.nexusPreviousColorScheme ?? "";
  delete root.dataset.nexusThemeOwned;
  delete root.dataset.nexusPreviousDark;
  delete root.dataset.nexusPreviousColorScheme;
}

function writeThemeCookie(theme: NexusTheme) {
  try {
    document.cookie = `${NEXUS_THEME_COOKIE}=${theme}; Path=/; SameSite=Lax; Max-Age=86400${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {
    // O tema da aba continua valido quando o navegador bloqueia persistencia.
  }
}

function isThemeMessage(data: unknown): data is { type: "nexus:theme"; theme: NexusTheme } {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  const prototype = Object.getPrototypeOf(data);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(data).sort();
  if (keys.length !== 2 || keys[0] !== "theme" || keys[1] !== "type") return false;
  const message = data as Record<string, unknown>;
  return message.type === "nexus:theme" && (message.theme === "light" || message.theme === "dark");
}

export function isNexusShellRoute(pathname: string | null) {
  return routes.some((route) => pathname === route || pathname?.startsWith(`${route}/`));
}

export function NexusShellProvider({
  initialPreference,
  initialTheme,
  localThemeMessageOrigin,
  children,
}: {
  initialPreference?: string;
  initialTheme?: string;
  localThemeMessageOrigin?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const isStandalone = useIsStandalone();
  const requested = search?.get("shell");
  const requestedTheme = search?.get("theme");
  const requestSignature = search?.toString() ?? "";
  const [preference, setPreference] = useState(initialPreference === "nexus");
  const [themePreference, setThemePreference] = useState<NexusTheme>(
    initialTheme === "dark" ? "dark" : "light"
  );
  const [parentTheme, setParentTheme] = useState<ParentTheme | null>(null);
  const allowed = isNexusShellRoute(pathname);
  // A URL explicita ganha do cookie, inclusive para sair do modo integrado.
  const active = allowed && !isStandalone && (requested == null ? preference : requested === "nexus");
  const queryTheme: NexusTheme =
    requestedTheme == null ? themePreference : requestedTheme === "dark" ? "dark" : "light";
  const theme = parentTheme?.requestSignature === requestSignature ? parentTheme.theme : queryTheme;

  useEffect(() => {
    if (requested !== "nexus" && requested !== "standalone") return;
    if (!allowed && requested === "nexus") return;
    const enabled = requested === "nexus";
    setPreference(enabled);
    try {
      document.cookie = `${NEXUS_SHELL_COOKIE}=${enabled ? "nexus" : ""}; Path=/; SameSite=Lax; Max-Age=${enabled ? 86400 : 0}${window.location.protocol === "https:" ? "; Secure" : ""}`;
    } catch {
      // Bloqueio de cookies nao deve impedir o modo explicito nesta aba.
    }
  }, [allowed, requested]);

  useEffect(() => {
    if (!active || requestedTheme == null) return;
    setThemePreference(theme);
    writeThemeCookie(theme);
  }, [active, requestedTheme, theme]);

  useEffect(() => {
    if (active) {
      applyDocumentTheme(theme);
      return;
    }
    restoreDocumentTheme();
  }, [active, theme]);

  useEffect(() => {
    if (!active) return;
    const handleThemeMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (event.origin !== NEXUS_THEME_PARENT_ORIGIN && event.origin !== localThemeMessageOrigin) return;
      if (!isThemeMessage(event.data)) return;
      const url = new URL(window.location.href);
      url.searchParams.set("theme", event.data.theme);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      setParentTheme({ theme: event.data.theme, requestSignature });
      setThemePreference(event.data.theme);
      writeThemeCookie(event.data.theme);
    };
    window.addEventListener("message", handleThemeMessage);
    if (window.parent !== window) {
      window.parent.postMessage(
        { type: "nexus:theme-ready" },
        localThemeMessageOrigin ?? NEXUS_THEME_PARENT_ORIGIN
      );
    }
    return () => window.removeEventListener("message", handleThemeMessage);
  }, [active, localThemeMessageOrigin, requestSignature]);

  return (
    <NexusShellContext.Provider value={active}>
      <NexusThemeContext.Provider value={active ? theme : null}>
        {active && <span hidden data-nexus-shell="true" data-nexus-theme={theme} />}
        {children}
      </NexusThemeContext.Provider>
    </NexusShellContext.Provider>
  );
}

export const useNexusShell = () => useContext(NexusShellContext);
export const useNexusTheme = () => useContext(NexusThemeContext);
