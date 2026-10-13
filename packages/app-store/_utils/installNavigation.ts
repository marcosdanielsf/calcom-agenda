// Criado: 2026-10-12 BRT. Para onde vai o navegador ao instalar um app.
// Dentro do quadro do Nexus (iframe), o OAuth do provedor abre em aba propria: o Google recusa a
// tela de consentimento dentro de iframe e o quadro ficava numa pagina 403. Fora do quadro, nada muda.

export const INSTALL_POPUP_BLOCKED_MESSAGE =
  "O navegador bloqueou a janela de autorização. Libere pop-ups para a Agenda e clique em instalar de novo.";

export const INSTALL_CONTINUE_IN_NEW_TAB_MESSAGE =
  "Conclua a autorização na aba que abriu. Ao voltar para cá, a lista se atualiza sozinha.";

export function isInsideFrame(win: Window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    // Acesso ao top negado so acontece quando a pagina esta num quadro de outra origem.
    return true;
  }
}

export function navigateToInstallUrl(
  win: Window,
  url: string,
  { external, newTab }: { external: boolean; newTab?: boolean }
): { openedInNewTab: boolean; message?: string } {
  if (external && isInsideFrame(win)) {
    const opened = win.open(url, "_blank");
    if (!opened) throw new Error(INSTALL_POPUP_BLOCKED_MESSAGE);
    return { openedInNewTab: true, message: INSTALL_CONTINUE_IN_NEW_TAB_MESSAGE };
  }
  if (newTab) {
    win.open(url, "_blank");
    return { openedInNewTab: true };
  }
  win.location.href = url;
  return { openedInNewTab: false };
}
