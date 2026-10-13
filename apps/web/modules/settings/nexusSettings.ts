// Criado: 2026-10-12 BRT. Configuracoes da Agenda dentro do quadro do Nexus.
// O login e o acesso vem do Nexus: conta, senha, chaves de desenvolvedor e a administracao do
// motor nao sao da pessoa do outro lado do quadro.
type SettingsTab = { name: string; children?: { name: string }[] };

export const NEXUS_HIDDEN_TABS: readonly string[] = ["security", "developer", "admin"];
export const NEXUS_HIDDEN_CHILDREN: readonly string[] = ["push_notifications"];
export const NEXUS_SETTINGS_HOME = "/settings/my-account/profile";

export function nexusSettingsTabs<T extends SettingsTab>(tabs: T[]): T[] {
  return tabs
    .filter((tab) => !NEXUS_HIDDEN_TABS.includes(tab.name))
    .map((tab) => ({
      ...tab,
      children: tab.children?.filter((child) => !NEXUS_HIDDEN_CHILDREN.includes(child.name)),
    }));
}
