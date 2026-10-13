// Criado: 2026-10-12 BRT. Instalar app dentro do quadro do Nexus nao pode navegar o iframe para o
// provedor de OAuth: o Google recusa a tela de consentimento dentro de iframe (pagina 403).
import { describe, expect, it, vi } from "vitest";
import {
  INSTALL_CONTINUE_IN_NEW_TAB_MESSAGE,
  INSTALL_POPUP_BLOCKED_MESSAGE,
  isInsideFrame,
  navigateToInstallUrl,
} from "./installNavigation";

const GOOGLE_URL = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x";

function fakeWindow({ framed, opened = {} }: { framed: boolean; opened?: unknown }) {
  const win = {
    location: { href: "https://agenda.socialfy.me/apps/google-calendar" },
    open: vi.fn(() => opened),
  } as unknown as Window & { open: ReturnType<typeof vi.fn> };
  Object.assign(win, { self: win, top: framed ? {} : win });
  return win;
}

describe("isInsideFrame", () => {
  it("diz que nao esta em quadro quando top e a propria janela", () => {
    expect(isInsideFrame(fakeWindow({ framed: false }))).toBe(false);
  });

  it("diz que esta em quadro quando top e outra janela", () => {
    expect(isInsideFrame(fakeWindow({ framed: true }))).toBe(true);
  });

  it("trata acesso negado ao top como quadro", () => {
    const win = fakeWindow({ framed: false });
    Object.defineProperty(win, "top", {
      get() {
        throw new Error("SecurityError");
      },
    });
    expect(isInsideFrame(win)).toBe(true);
  });
});

describe("navigateToInstallUrl", () => {
  it("dentro do quadro, abre o OAuth externo em aba propria e nao navega o iframe", () => {
    const win = fakeWindow({ framed: true });
    const result = navigateToInstallUrl(win, GOOGLE_URL, {
      external: true,
      newTab: undefined,
    });
    expect(win.open).toHaveBeenCalledWith(GOOGLE_URL, "_blank");
    expect(win.location.href).toBe("https://agenda.socialfy.me/apps/google-calendar");
    expect(result.message).toEqual(expect.stringContaining("aba"));
    expect(result).toStrictEqual({ openedInNewTab: true, message: INSTALL_CONTINUE_IN_NEW_TAB_MESSAGE });
  });

  it("dentro do quadro com pop-up bloqueado, falha com mensagem clara em vez de navegar o iframe", () => {
    const win = fakeWindow({ framed: true, opened: null });
    expect(() =>
      navigateToInstallUrl(win, GOOGLE_URL, {
        external: true,
        newTab: undefined,
      })
    ).toThrow(INSTALL_POPUP_BLOCKED_MESSAGE);
    expect(win.location.href).toBe("https://agenda.socialfy.me/apps/google-calendar");
  });

  it("dentro do quadro, URL interna continua navegando no proprio quadro", () => {
    const win = fakeWindow({ framed: true });
    const result = navigateToInstallUrl(win, "/apps/installation/event-types?slug=x", {
      external: false,
      newTab: undefined,
    });
    expect(win.open).not.toHaveBeenCalled();
    expect(win.location.href).toBe("/apps/installation/event-types?slug=x");
    expect(result).toEqual({ openedInNewTab: false });
  });

  it("fora do quadro, mantem o comportamento original: navega a pagina", () => {
    const win = fakeWindow({ framed: false });
    const result = navigateToInstallUrl(win, GOOGLE_URL, {
      external: true,
      newTab: undefined,
    });
    expect(win.open).not.toHaveBeenCalled();
    expect(win.location.href).toBe(GOOGLE_URL);
    expect(result).toEqual({ openedInNewTab: false });
  });

  it("fora do quadro, respeita newTab do app", () => {
    const win = fakeWindow({ framed: false });
    const result = navigateToInstallUrl(win, GOOGLE_URL, {
      external: true,
      newTab: true,
    });
    expect(win.open).toHaveBeenCalledWith(GOOGLE_URL, "_blank");
    expect(result).toEqual({ openedInNewTab: true });
  });
});
