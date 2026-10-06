// @vitest-environment-options {"url":"https://agenda.socialfy.me"}
// Atualizado: 2026-10-06 10:12 BRT.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEXUS_SHELL_COOKIE, NEXUS_THEME_COOKIE, NexusShellProvider } from "./NexusShell";
import { applyNexusThemeBeforePaint, resolveLocalThemeMessageOrigin } from "./nexusThemeOrigin";
import Shell from "./Shell";

const wrapper = ({ children }: { children: ReactNode }) => (
  <NexusShellProvider>{children}</NexusShellProvider>
);

const state = vi.hoisted(() => ({ pathname: "/event-types", search: "shell=nexus" }));
const guards = vi.hoisted(() => ({ login: vi.fn(), onboarding: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
vi.mock("sonner", () => ({ Toaster: () => null }));
vi.mock("@calcom/web/modules/formbricks/hooks/useFormbricks", () => ({ useFormbricks: vi.fn() }));
vi.mock("@calcom/web/modules/auth/hooks/useRedirectToLoginIfUnauthenticated", () => ({
  useRedirectToLoginIfUnauthenticated: guards.login,
}));
vi.mock("@calcom/web/modules/auth/hooks/useRedirectToOnboardingIfNeeded", () => ({
  useRedirectToOnboardingIfNeeded: guards.onboarding,
}));
vi.mock("@calcom/web/modules/settings/components/TimezoneChangeDialog", () => ({
  default: () => <div data-testid="timezone" />,
}));
vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ isLocaleReady: true }) }));
vi.mock("@calcom/ui/classNames", () => ({ default: (...args: unknown[]) => args.filter(Boolean).join(" ") }));
vi.mock("@calcom/ui/components/button", () => ({ Button: () => <button type="button">Voltar</button> }));
vi.mock("@calcom/ui/components/errorBoundary", () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@calcom/ui/components/skeleton", () => ({ SkeletonText: () => null }));
vi.mock("./DynamicModals", () => ({ DynamicModals: () => <div data-testid="welcome" /> }));
vi.mock("./Kbar", () => ({
  KBarRoot: ({ children }: { children: ReactNode }) => <div data-testid="shortcuts">{children}</div>,
  KBarContent: () => null,
}));
vi.mock("./SideBar", () => ({ SideBarContainer: () => <nav data-testid="sidebar" /> }));
vi.mock("./TopNav", () => ({ TopNavContainer: () => <nav data-testid="topnav" /> }));
vi.mock("./banners/LayoutBanner", () => ({ BannerContainer: () => <div data-testid="banner" /> }));
vi.mock("./banners/useBanners", () => ({ useBanners: () => ({ banners: [], bannersHeight: 0 }) }));
vi.mock("./navigation/Navigation", () => ({ MobileNavigationContainer: () => <nav data-testid="mobile" /> }));
vi.mock("./useAppTheme", () => ({ useAppTheme: vi.fn() }));

beforeEach(() => {
  state.pathname = "/event-types";
  state.search = "shell=nexus";
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/event-types");
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
  delete document.documentElement.dataset.nexusThemeOwned;
  delete document.documentElement.dataset.nexusPreviousDark;
  delete document.documentElement.dataset.nexusPreviousColorScheme;
  document.cookie = `${NEXUS_SHELL_COOKIE}=; Max-Age=0; Path=/`;
  document.cookie = `${NEXUS_THEME_COOKIE}=; Max-Age=0; Path=/`;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Agenda dentro da casca Nexus", () => {
  it("grava somente preferencia host-only, Secure e SameSite=Lax", () => {
    const write = vi.spyOn(document, "cookie", "set");
    render(<Shell>Conteudo</Shell>, { wrapper });
    expect(write).toHaveBeenCalledWith(
      `${NEXUS_SHELL_COOKIE}=nexus; Path=/; SameSite=Lax; Max-Age=86400; Secure`
    );
    expect(document.cookie).toContain(`${NEXUS_SHELL_COOKIE}=nexus`);
  });

  it("cookie bloqueado nao quebra o modo explicito nem a navegacao da aba", () => {
    vi.spyOn(document, "cookie", "set").mockImplementation(() => {
      throw new Error("cookie bloqueado");
    });
    const { rerender } = render(<Shell>Conteudo</Shell>, { wrapper });
    state.pathname = "/apps";
    state.search = "";
    rerender(<Shell>Integracoes</Shell>);
    expect(screen.queryByTestId("sidebar")).toBeNull();
  });

  it.each([
    "/event-types",
    "/bookings/upcoming",
    "/availability",
    "/apps",
    "/settings/my-account/profile",
  ])("retira navegacao global e mantem acao local em %s", (pathname) => {
    state.pathname = pathname;
    const save = vi.fn();
    render(
      <Shell
        heading="Agenda"
        CTA={
          <button type="button" onClick={save}>
            Salvar
          </button>
        }>
        Conteudo
      </Shell>,
      { wrapper }
    );
    for (const id of ["sidebar", "topnav", "mobile", "shortcuts", "welcome"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId("banner")).toBeTruthy();
    fireEvent.click(screen.getByText("Salvar"));
    expect(save).toHaveBeenCalledOnce();
    expect(screen.getByText("Conteudo")).toBeTruthy();
    expect(screen.getByTestId("timezone")).toBeTruthy();
    expect(guards.login).toHaveBeenCalled();
    expect(guards.onboarding).toHaveBeenCalled();
  });

  it("mantem o tema e a navegacao reduzida ao navegar sem query, e permite sair", () => {
    const { rerender } = render(<Shell>Conteudo</Shell>, { wrapper });
    expect(document.cookie).toContain(`${NEXUS_SHELL_COOKIE}=nexus`);
    state.pathname = "/bookings/upcoming";
    state.search = "";
    rerender(<Shell>Reservas</Shell>);
    expect(screen.queryByTestId("sidebar")).toBeNull();
    expect(document.querySelector('[data-nexus-shell="true"]')).toBeTruthy();
    state.search = "shell=standalone";
    rerender(<Shell>Reservas</Shell>);
    expect(screen.getByTestId("sidebar")).toBeTruthy();
    expect(document.querySelector('[data-nexus-shell="true"]')).toBeNull();
    expect(document.cookie).not.toContain(NEXUS_SHELL_COOKIE);
    state.search = "";
    rerender(<Shell>Reservas</Shell>);
    expect(screen.getByTestId("sidebar")).toBeTruthy();
  });

  it.each([
    "/auth/login",
    "/signup",
    "/alguem/reserva",
    "/apps-malicioso",
    "/settings-other",
  ])("nao modifica rota fora do escopo: %s", (pathname) => {
    state.pathname = pathname;
    render(
      <NexusShellProvider initialPreference="nexus">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(screen.getByTestId("sidebar")).toBeTruthy();
    expect(document.querySelector('[data-nexus-shell="true"]')).toBeNull();
    expect(document.cookie).not.toContain(NEXUS_SHELL_COOKIE);
  });

  it.each(["", "shell=outro", "standalone=true"])("preserva modo original: %s", (search) => {
    state.search = search;
    render(<Shell>Conteudo</Shell>, { wrapper });
    expect(screen.getByTestId("sidebar")).toBeTruthy();
    expect(screen.getByTestId("shortcuts")).toBeTruthy();
    expect(document.querySelector('[data-nexus-shell="true"]')).toBeNull();
  });

  it("mantem navegacao injetada pelas configuracoes", () => {
    state.pathname = "/settings/my-account/profile";
    render(
      <Shell SidebarContainer={<nav>Menu configuracoes</nav>} TopNavContainer={<nav>Topo configuracoes</nav>}>
        Perfil
      </Shell>,
      { wrapper }
    );
    expect(screen.getByText("Menu configuracoes")).toBeTruthy();
    expect(screen.queryByText("Topo configuracoes")).toBeNull();
    expect(screen.getByText("Perfil")).toBeTruthy();
  });

  it.each(["shell=nexus", ""])("renderiza sem chrome duplicado no servidor: %s", (search) => {
    state.search = search;
    const html = renderToString(
      <NexusShellProvider initialPreference="nexus">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(html).toContain('data-nexus-shell="true"');
    expect(html).not.toContain('data-testid="sidebar"');
    expect(html).not.toContain('data-testid="shortcuts"');
  });

  it("entrega o tema escuro no HTML do servidor antes do primeiro paint", () => {
    state.search = "shell=nexus&theme=dark";
    const html = renderToString(
      <NexusShellProvider initialPreference="nexus" initialTheme="light">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(html).toContain('data-nexus-shell="true"');
    expect(html).toContain('data-nexus-theme="dark"');
  });

  it("entrega o marcador como primeiro filho do body no documento SSR", () => {
    state.search = "shell=nexus&theme=dark";
    const html = renderToString(
      <html lang="pt-BR">
        <head />
        <body>
          <NexusShellProvider initialPreference="nexus" initialTheme="light">
            <main id="app">Conteudo</main>
            <div id="portal">Portal</div>
          </NexusShellProvider>
        </body>
      </html>
    );
    expect(html).toMatch(/<body><span hidden="" data-nexus-shell="true" data-nexus-theme="dark"><\/span>/);
    expect(html.indexOf("data-nexus-theme")).toBeLessThan(html.indexOf('id="app"'));
    expect(html.indexOf("data-nexus-theme")).toBeLessThan(html.indexOf('id="portal"'));
  });

  it("aplica tema claro antes do body e restaura app-theme escuro ao sair", () => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
    document.cookie = `${NEXUS_SHELL_COOKIE}=nexus; Path=/`;
    document.cookie = `${NEXUS_THEME_COOKIE}=dark; Path=/`;
    state.search = "shell=nexus&theme=light";
    window.history.replaceState(null, "", "/event-types?shell=nexus&theme=light");
    applyNexusThemeBeforePaint();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");

    const { rerender } = render(
      <NexusShellProvider initialPreference="nexus" initialTheme="dark">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    state.search = "shell=standalone";
    rerender(
      <NexusShellProvider initialPreference="nexus" initialTheme="dark">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("aplica tema escuro antes do body e query clara nova remove html.dark", () => {
    state.search = "shell=nexus&theme=dark";
    window.history.replaceState(null, "", "/event-types?shell=nexus&theme=dark");
    applyNexusThemeBeforePaint();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    const { rerender } = render(
      <NexusShellProvider initialPreference="nexus" initialTheme="light">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    state.search = "shell=nexus&theme=light&revision=2";
    rerender(
      <NexusShellProvider initialPreference="nexus" initialTheme="light">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it.each([
    ["development", "http://localhost:3000", "http://localhost:3000"],
    ["test", "https://127.0.0.1:3100", "https://127.0.0.1:3100"],
    ["production", "http://localhost:3000", undefined],
    ["development", "https://agenda-preview.socialfy.me", undefined],
    ["development", "http://localhost:3000/caminho", undefined],
  ])("limita origem local configurada em %s: %s", (nodeEnv, configured, expected) => {
    expect(resolveLocalThemeMessageOrigin(configured, nodeEnv)).toBe(expected);
  });

  it("persiste tema escuro na navegacao e no HTML de um novo carregamento", () => {
    state.search = "shell=nexus&theme=dark";
    const { rerender, unmount } = render(
      <NexusShellProvider initialPreference="nexus" initialTheme="light">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(document.cookie).toContain(`${NEXUS_THEME_COOKIE}=dark`);

    state.pathname = "/bookings/upcoming";
    state.search = "";
    rerender(
      <NexusShellProvider initialPreference="nexus" initialTheme="light">
        <Shell>Reservas</Shell>
      </NexusShellProvider>
    );
    expect(document.querySelector("[data-nexus-theme]")?.getAttribute("data-nexus-theme")).toBe("dark");
    unmount();

    const html = renderToString(
      <NexusShellProvider initialPreference="nexus" initialTheme="dark">
        <Shell>Reservas</Shell>
      </NexusShellProvider>
    );
    expect(html).toContain('data-nexus-theme="dark"');
  });

  it.each([
    ["theme=light", "light"],
    ["theme=desconhecido", "light"],
  ])("usa tema claro para %s e substitui a preferencia escura", (search, expected) => {
    state.search = `shell=nexus&${search}`;
    render(
      <NexusShellProvider initialPreference="nexus" initialTheme="dark">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(document.querySelector("[data-nexus-theme]")?.getAttribute("data-nexus-theme")).toBe(expected);
    expect(document.cookie).toContain(`${NEXUS_THEME_COOKIE}=light`);
  });

  it.each([
    "https://nexus.socialfy.me",
    "https://nexus.local.test",
  ])("aceita tema estrito do parent na origem permitida %s", (origin) => {
    state.search = "shell=nexus&theme=light";
    render(
      <NexusShellProvider
        initialPreference="nexus"
        initialTheme="light"
        localThemeMessageOrigin="https://nexus.local.test">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          source: window,
          data: { type: "nexus:theme", theme: "dark" },
        })
      );
    });
    expect(document.querySelector("[data-nexus-theme]")?.getAttribute("data-nexus-theme")).toBe("dark");
    expect(document.cookie).toContain(`${NEXUS_THEME_COOKIE}=dark`);
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          source: window,
          data: { type: "nexus:theme", theme: "light" },
        })
      );
    });
    expect(document.querySelector("[data-nexus-theme]")?.getAttribute("data-nexus-theme")).toBe("light");
    expect(document.cookie).toContain(`${NEXUS_THEME_COOKIE}=light`);
  });

  it("instala listener antes de avisar ao parent que o tema esta pronto", () => {
    const parentPostMessage = vi.fn();
    const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
    const addEventListener = vi.spyOn(window, "addEventListener");
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });
    try {
      state.search = "shell=nexus&theme=light";
      render(
        <NexusShellProvider
          initialPreference="nexus"
          initialTheme="light"
          localThemeMessageOrigin="http://localhost:3000">
          <Shell>Conteudo</Shell>
        </NexusShellProvider>
      );
      expect(parentPostMessage).toHaveBeenCalledWith({ type: "nexus:theme-ready" }, "http://localhost:3000");
      const listenerCall = addEventListener.mock.calls.findIndex(([type]) => type === "message");
      expect(listenerCall).toBeGreaterThanOrEqual(0);
      expect(addEventListener.mock.invocationCallOrder[listenerCall]).toBeLessThan(
        parentPostMessage.mock.invocationCallOrder[0]
      );
      expect(Object.keys(parentPostMessage.mock.calls[0][0])).toEqual(["type"]);
    } finally {
      if (parentDescriptor) Object.defineProperty(window, "parent", parentDescriptor);
    }
  });

  it("faz uma query de tema nova ganhar da ultima mensagem do parent", () => {
    state.search = "shell=nexus&theme=light";
    const { rerender } = render(
      <NexusShellProvider initialPreference="nexus" initialTheme="light">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://nexus.socialfy.me",
          source: window,
          data: { type: "nexus:theme", theme: "dark" },
        })
      );
    });
    expect(document.querySelector("[data-nexus-theme]")?.getAttribute("data-nexus-theme")).toBe("dark");

    state.search = "shell=nexus&theme=light&revision=2";
    window.history.replaceState(window.history.state, "", "/event-types?shell=nexus&theme=light&revision=2");
    rerender(
      <NexusShellProvider initialPreference="nexus" initialTheme="light">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(document.querySelector("[data-nexus-theme]")?.getAttribute("data-nexus-theme")).toBe("light");
  });

  it("sincroniza mensagem no URL preservando history state e mantem o tema no F5", () => {
    const historyState = { __NA: true, keep: "next" };
    state.search = "shell=nexus&theme=dark";
    window.history.replaceState(historyState, "", "/event-types?shell=nexus&theme=dark");
    const { unmount } = render(
      <NexusShellProvider initialPreference="nexus" initialTheme="dark">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://nexus.socialfy.me",
          source: window,
          data: { type: "nexus:theme", theme: "light" },
        })
      );
    });
    expect(document.querySelector("[data-nexus-theme]")?.getAttribute("data-nexus-theme")).toBe("light");
    expect(new URLSearchParams(window.location.search).get("theme")).toBe("light");
    expect(window.history.state).toEqual(historyState);
    expect(document.cookie).toContain(`${NEXUS_THEME_COOKIE}=light`);
    unmount();

    state.search = window.location.search.slice(1);
    const html = renderToString(
      <NexusShellProvider initialPreference="nexus" initialTheme="light">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(html).toContain('data-nexus-theme="light"');
  });

  it.each([
    ["origem", "https://malicioso.example", window, { type: "nexus:theme", theme: "dark" }],
    ["source", "https://nexus.socialfy.me", null, { type: "nexus:theme", theme: "dark" }],
    ["tipo", "https://nexus.socialfy.me", window, { type: "nexus:tema", theme: "dark" }],
    ["tema", "https://nexus.socialfy.me", window, { type: "nexus:theme", theme: "auto" }],
    ["chave extra", "https://nexus.socialfy.me", window, { type: "nexus:theme", theme: "dark", extra: true }],
  ])("recusa postMessage com %s invalido", (_case, origin, source, data) => {
    state.search = "shell=nexus&theme=light";
    render(
      <NexusShellProvider initialPreference="nexus" initialTheme="light">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { origin, source, data }));
    });
    expect(document.querySelector("[data-nexus-theme]")?.getAttribute("data-nexus-theme")).toBe("light");
    expect(document.cookie).toContain(`${NEXUS_THEME_COOKIE}=light`);
  });

  it("o legado standalone explicito ganha de um cookie Nexus", () => {
    state.search = "standalone=true";
    render(
      <NexusShellProvider initialPreference="nexus">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(document.querySelector('[data-nexus-shell="true"]')).toBeNull();
  });

  it("remove a preferencia Nexus fora das rotas cobertas", () => {
    state.pathname = "/auth/login";
    state.search = "shell=standalone";
    render(
      <NexusShellProvider initialPreference="nexus">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(document.cookie).not.toContain(NEXUS_SHELL_COOKIE);
  });

  it("sair do escopo retira o tema e voltar recupera a preferencia", () => {
    const { rerender } = render(<Shell>Conteudo</Shell>, { wrapper });
    state.pathname = "/auth/login";
    state.search = "";
    rerender(<Shell>Login</Shell>);
    expect(document.querySelector('[data-nexus-shell="true"]')).toBeNull();
    state.pathname = "/availability";
    rerender(<Shell>Horarios</Shell>);
    expect(screen.queryByTestId("sidebar")).toBeNull();
  });
});
