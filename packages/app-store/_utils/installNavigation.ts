// Criado: 2026-10-12 BRT. Para onde vai o navegador ao instalar um app.
// Dentro do quadro do Nexus (iframe), o OAuth do provedor abre em aba propria: o Google recusa a
// tela de consentimento dentro de iframe e o quadro ficava numa pagina 403. Fora do quadro, nada muda.
// A aba abre em branco no proprio clique (openPendingInstallWindow) e so depois recebe a URL: o
// Safari perde o gesto do clique depois de uma chamada de rede e bloquearia o pop-up.

export const INSTALL_POPUP_BLOCKED_MESSAGE =
  "O navegador bloqueou a janela de autorização. Libere pop-ups para a Agenda e clique em instalar de novo.";

export const INSTALL_CONTINUE_IN_NEW_TAB_MESSAGE =
  "Conclua a autorização na aba que abriu. Ao voltar para cá, a lista se atualiza sozinha.";

export type InstallNavigation = {
  openedInNewTab: boolean;
  /** OAuth aberto em outra aba a partir do quadro: a instalacao so termina quando a pessoa autorizar. */
  awaitingAuthorization: boolean;
  message?: string;
};

export function isInsideFrame(win: Window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    // Acesso ao top negado so acontece quando a pagina esta num quadro de outra origem.
    return true;
  }
}

/** Chamar de dentro do clique, antes de qualquer await. Fora do quadro nao abre nada. */
export function openPendingInstallWindow(win: Window): Window | null {
  if (!isInsideFrame(win)) return null;
  return win.open("", "_blank") ?? null;
}

export function closePendingInstallWindow(pendingWindow: Window | null | undefined): void {
  if (pendingWindow && !pendingWindow.closed) pendingWindow.close();
}

export function navigateToInstallUrl(
  win: Window,
  url: string,
  {
    external,
    newTab,
    pendingWindow = null,
  }: { external: boolean; newTab?: boolean; pendingWindow?: Window | null }
): InstallNavigation {
  if (external && isInsideFrame(win)) {
    if (pendingWindow && !pendingWindow.closed) {
      pendingWindow.location.href = url;
    } else if (!win.open(url, "_blank")) {
      throw new Error(INSTALL_POPUP_BLOCKED_MESSAGE);
    }
    return {
      openedInNewTab: true,
      awaitingAuthorization: true,
      message: INSTALL_CONTINUE_IN_NEW_TAB_MESSAGE,
    };
  }
  closePendingInstallWindow(pendingWindow);
  if (newTab) {
    win.open(url, "_blank");
    return { openedInNewTab: true, awaitingAuthorization: false };
  }
  win.location.href = url;
  return { openedInNewTab: false, awaitingAuthorization: false };
}
