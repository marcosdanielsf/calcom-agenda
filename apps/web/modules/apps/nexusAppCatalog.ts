// Criado: 2026-10-12 BRT. O que a loja de apps mostra dentro do quadro do Nexus.
// A Agenda embutida oferece so o que a casa sustenta; fora do modo Nexus a loja fica inteira.
// Outlook e Apple ficam fora por ora: a conexao unica com o Nexus cobre so o Google.

const NEXUS_APPS_BY_CATEGORY: Readonly<Record<string, readonly string[]>> = {
  calendar: ["google-calendar"],
};

const NEXUS_APP_DESCRIPTION_KEYS: Readonly<Record<string, string>> = {
  "google-calendar": "nexus_app_description_google_calendar",
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

// Pagina de detalhes do app no quadro do Nexus: sem contato, site e aviso legal do fornecedor do
// motor, e com a descricao traduzida quando a casa tem uma.
export function nexusAppPageSections(
  nexus: boolean,
  slug: string
): { showVendorContact: boolean; descriptionKey: string | null } {
  if (!nexus) return { showVendorContact: true, descriptionKey: null };
  return { showVendorContact: false, descriptionKey: nexusAppDescriptionKey(slug) };
}
