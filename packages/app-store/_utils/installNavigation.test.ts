// Criado: 2026-10-12 BRT. Instalar app dentro do quadro do Nexus nao pode navegar o iframe para o
// provedor de OAuth: o Google recusa a tela de consentimento dentro de iframe (pagina 403).
// A aba nova abre no proprio clique (antes da rede), porque o Safari perde o gesto depois de um fetch.
import { describe, expect, it, vi } from "vitest";
import {
  closePendingInstallWindow,
  INSTALL_CONTINUE_IN_NEW_TAB_MESSAGE,
  INSTALL_POPUP_BLOCKED_MESSAGE,
  isInsideFrame,
  isInstallButtonLoading,
  navigateToInstallUrl,
  openPendingInstallWindow,
} from "./installNavigation";

const GOOGLE_URL = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x";
const PAGE_URL = "https://agenda.socialfy.me/apps/google-calendar";

function fakePopup({ closed = false }: { closed?: boolean } = {}) {
  return {
    closed,
    close: vi.fn(),
    location: { href: "about:blank" },
  } as unknown as Window & {
    close: ReturnType<typeof vi.fn>;
  };
}

function fakeWindow({ framed, opened }: { framed: boolean; opened?: unknown }) {
  const win = {
    location: { href: PAGE_URL },
    open: vi.fn(() => (opened === undefined ? fakePopup() : opened)),
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

describe("openPendingInstallWindow", () => {
  it("dentro do quadro abre uma aba em branco no proprio clique", () => {
    const popup = fakePopup();
    const win = fakeWindow({ framed: true, opened: popup });
    expect(openPendingInstallWindow(win)).toBe(popup);
    expect(win.open).toHaveBeenCalledWith("", "_blank");
  });

  it("fora do quadro nao abre nada", () => {
    const win = fakeWindow({ framed: false });
    expect(openPendingInstallWindow(win)).toBeNull();
    expect(win.open).not.toHaveBeenCalled();
  });

  it("pop-up bloqueado no clique devolve null sem lancar", () => {
    const win = fakeWindow({ framed: true, opened: null });
    expect(openPendingInstallWindow(win)).toBeNull();
  });
});

describe("closePendingInstallWindow", () => {
  it("fecha a aba que ainda esta aberta", () => {
    const popup = fakePopup();
    closePendingInstallWindow(popup);
    expect(popup.close).toHaveBeenCalled();
  });

  it("ignora aba ja fechada ou ausente", () => {
    const popup = fakePopup({ closed: true });
    closePendingInstallWindow(popup);
    closePendingInstallWindow(null);
    expect(popup.close).not.toHaveBeenCalled();
  });
});

describe("navigateToInstallUrl", () => {
  it("dentro do quadro, leva a aba aberta no clique para o OAuth e deixa a autorizacao pendente", () => {
    const win = fakeWindow({ framed: true });
    const popup = fakePopup();
    const result = navigateToInstallUrl(win, GOOGLE_URL, {
      external: true,
      pendingWindow: popup,
    });
    expect(popup.location.href).toBe(GOOGLE_URL);
    expect(win.open).not.toHaveBeenCalled();
    expect(win.location.href).toBe(PAGE_URL);
    expect(result).toStrictEqual({
      openedInNewTab: true,
      awaitingAuthorization: true,
      message: INSTALL_CONTINUE_IN_NEW_TAB_MESSAGE,
    });
  });

  it("dentro do quadro sem aba previa, tenta abrir na hora", () => {
    const win = fakeWindow({ framed: true });
    const result = navigateToInstallUrl(win, GOOGLE_URL, {
      external: true,
      pendingWindow: null,
    });
    expect(win.open).toHaveBeenCalledWith(GOOGLE_URL, "_blank");
    expect(win.location.href).toBe(PAGE_URL);
    expect(result.awaitingAuthorization).toBe(true);
  });

  it("dentro do quadro com aba fechada e pop-up bloqueado, falha com mensagem clara sem navegar o iframe", () => {
    const win = fakeWindow({ framed: true, opened: null });
    expect(() =>
      navigateToInstallUrl(win, GOOGLE_URL, {
        external: true,
        pendingWindow: fakePopup({ closed: true }),
      })
    ).toThrow(INSTALL_POPUP_BLOCKED_MESSAGE);
    expect(win.location.href).toBe(PAGE_URL);
  });

  it("dentro do quadro, URL interna fecha a aba previa e navega no proprio quadro", () => {
    const win = fakeWindow({ framed: true });
    const popup = fakePopup();
    const result = navigateToInstallUrl(win, "/apps/installation/event-types?slug=x", {
      external: false,
      pendingWindow: popup,
    });
    expect(popup.close).toHaveBeenCalled();
    expect(win.open).not.toHaveBeenCalled();
    expect(win.location.href).toBe("/apps/installation/event-types?slug=x");
    expect(result).toStrictEqual({
      openedInNewTab: false,
      awaitingAuthorization: false,
    });
  });

  it("fora do quadro, mantem o comportamento original: navega a pagina", () => {
    const win = fakeWindow({ framed: false });
    const result = navigateToInstallUrl(win, GOOGLE_URL, { external: true });
    expect(win.open).not.toHaveBeenCalled();
    expect(win.location.href).toBe(GOOGLE_URL);
    expect(result).toStrictEqual({
      openedInNewTab: false,
      awaitingAuthorization: false,
    });
  });

  it("fora do quadro, respeita newTab do app", () => {
    const win = fakeWindow({ framed: false });
    const result = navigateToInstallUrl(win, GOOGLE_URL, {
      external: true,
      newTab: true,
    });
    expect(win.open).toHaveBeenCalledWith(GOOGLE_URL, "_blank");
    expect(result).toStrictEqual({
      openedInNewTab: true,
      awaitingAuthorization: false,
    });
  });
});

describe("isInstallButtonLoading", () => {
  it("instalacao pendente de autorizacao em outra aba nao prende o botao", () => {
    expect(isInstallButtonLoading({ setupPending: true, awaitingAuthorization: true })).toBe(false);
  });

  it("setup pendente fora do quadro continua carregando, como antes", () => {
    expect(isInstallButtonLoading({ setupPending: true })).toBe(true);
  });

  it("sem dado ou instalado nao carrega", () => {
    expect(isInstallButtonLoading(undefined)).toBe(false);
    expect(isInstallButtonLoading({ setupPending: false })).toBe(false);
  });
});
