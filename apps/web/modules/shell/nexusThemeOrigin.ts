// Atualizado: 2026-10-06 10:12 BRT. Configuracao server-owned e tema antes do primeiro paint.
export function resolveLocalThemeMessageOrigin(
  configuredOrigin: string | undefined,
  nodeEnv: string | undefined
): string | undefined {
  if (!configuredOrigin || nodeEnv === "production") return undefined;
  try {
    const url = new URL(configuredOrigin);
    const isLoopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    const isOriginOnly =
      url.pathname === "/" && url.search === "" && url.hash === "" && !url.username && !url.password;
    if (!isLoopback || !isOriginOnly || (url.protocol !== "http:" && url.protocol !== "https:"))
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function applyNexusThemeBeforePaint(): void {
  const root = document.documentElement;
  const params = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname;
  const routes = ["/event-types", "/bookings", "/availability", "/apps", "/settings"];
  const allowed = routes.some((route) => pathname === route || pathname.startsWith(route + "/"));
  const cookies = Object.fromEntries(
    document.cookie.split(";").map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [part.trim(), ""];
      return [part.slice(0, separator).trim(), part.slice(separator + 1)];
    })
  );
  const shell = params.get("shell");
  const active =
    allowed &&
    params.get("standalone") !== "true" &&
    (shell === "nexus" || (shell === null && cookies.nexus_agenda_shell === "nexus"));
  if (!active) return;
  const requestedTheme = params.get("theme");
  const theme =
    requestedTheme === null
      ? cookies.nexus_agenda_theme === "dark"
        ? "dark"
        : "light"
      : requestedTheme === "dark"
        ? "dark"
        : "light";
  if (root.dataset.nexusThemeOwned !== "true") {
    root.dataset.nexusPreviousDark = root.classList.contains("dark") ? "true" : "false";
    root.dataset.nexusPreviousColorScheme = root.style.colorScheme;
  }
  root.dataset.nexusThemeOwned = "true";
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export const NEXUS_THEME_BOOT_SCRIPT = `(${applyNexusThemeBeforePaint.toString()})();`;
