// Criado: 2026-10-05 23:36 BRT.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEXUS_SHELL_COOKIE, NexusShellProvider } from "./NexusShell";
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
  document.cookie = `${NEXUS_SHELL_COOKIE}=; Max-Age=0; Path=/`;
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
    for (const id of ["sidebar", "topnav", "mobile", "shortcuts", "welcome", "banner"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
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

  it("retira tambem navegacao injetada pelas configuracoes", () => {
    state.pathname = "/settings/my-account/profile";
    render(
      <Shell SidebarContainer={<nav>Menu configuracoes</nav>} TopNavContainer={<nav>Topo configuracoes</nav>}>
        Perfil
      </Shell>,
      { wrapper }
    );
    expect(screen.queryByText("Menu configuracoes")).toBeNull();
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

  it("o legado standalone explicito ganha de um cookie Nexus", () => {
    state.search = "standalone=true";
    render(
      <NexusShellProvider initialPreference="nexus">
        <Shell>Conteudo</Shell>
      </NexusShellProvider>
    );
    expect(document.querySelector('[data-nexus-shell="true"]')).toBeNull();
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
