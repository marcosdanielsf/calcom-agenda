// Criado: 2026-10-12 BRT. O que a loja de apps mostra dentro do quadro do Nexus.
// A Agenda embutida oferece so o que a casa sustenta; fora do modo Nexus a loja fica inteira.
// Atualizado: 2026-10-15 BRT. Porta unica: no quadro do Nexus toda conexao de agenda nasce em
// Integracoes do Nexus (plano docs/plans/2026-10-15-0920-nexus-porta-unica-integracoes.md no Nexus).

export const NEXUS_INTEGRATIONS_URL = "https://nexus.socialfy.me/#/conta/integracoes";

// Com o credential sync ligado, credencial de agenda criada pelo motor nao renova: quem conecta e o Nexus.
// Vale para TODA agenda de proposito: a que o Nexus ainda nao oferece (Exchange, CalDAV) fica sem porta no
// quadro ate entrar em Integracoes, em vez de nascer no motor e quebrar no primeiro vencimento.
export function isNexusManagedConnection(nexus: boolean, categories: readonly string[]): boolean {
  return nexus && categories.includes("calendar");
}

const NEXUS_APPS_BY_CATEGORY: Readonly<Record<string, readonly string[]>> = {
  calendar: ["google-calendar"],
};

const NEXUS_APP_DESCRIPTION_KEYS: Readonly<Record<string, string>> = {
  "google-calendar": "nexus_app_description_google_calendar",
};

// Nome que o Nexus usa para o app (a aba do Nexus chama "Google Agenda", nome oficial em pt-BR).
const NEXUS_APP_NAME_KEYS: Readonly<Record<string, string>> = {
  "google-calendar": "nexus_app_name_google_calendar",
};

export function appsForNexusCategory<T extends { slug: string }>(
  apps: T[],
  category: string | null | undefined
): T[] {
  const allowed = category ? NEXUS_APPS_BY_CATEGORY[category] : undefined;
  if (!allowed) return apps;
  return apps.filter((app) => allowed.includes(app.slug));
}

export function nexusAppDescriptionKey(slug: string): string | null {
  return NEXUS_APP_DESCRIPTION_KEYS[slug] ?? null;
}

export function nexusAppNameKey(slug: string): string | null {
  return NEXUS_APP_NAME_KEYS[slug] ?? null;
}

export type NexusAppPageSections = {
  showVendorContact: boolean;
  descriptionKey: string | null;
  // Galeria do fornecedor: prints em ingles com a marca dele dentro da imagem.
  showGallery: boolean;
  // Preco nao serve a quem so quer conectar a conta.
  showPrice: boolean;
  nameKey: string | null;
  categoryKey: string | null;
  compactTitle: boolean;
};

// Pagina de detalhes do app no quadro do Nexus: sem contato, site, galeria e aviso legal do
// fornecedor do motor, com nome, categoria e descricao da casa e titulo na escala do Nexus.
export function nexusAppPageSections(nexus: boolean, slug: string, category?: string): NexusAppPageSections {
  if (!nexus) {
    return {
      showVendorContact: true,
      descriptionKey: null,
      showGallery: true,
      showPrice: true,
      nameKey: null,
      categoryKey: null,
      compactTitle: false,
    };
  }
  return {
    showVendorContact: false,
    descriptionKey: nexusAppDescriptionKey(slug),
    showGallery: false,
    showPrice: false,
    nameKey: nexusAppNameKey(slug),
    categoryKey: category ?? null,
    compactTitle: true,
  };
}
