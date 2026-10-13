// Criado: 2026-10-12 BRT. Configuracoes dentro do Nexus: sem senha, sem desenvolvedor e sem Admin do motor.
import { describe, expect, it } from "vitest";
import { NEXUS_SETTINGS_HOME, nexusSettingsTabs } from "./nexusSettings";

const tabs = [
  { name: "my_account", children: [{ name: "profile" }, { name: "push_notifications" }] },
  { name: "security", children: [{ name: "password" }] },
  { name: "developer", children: [{ name: "api_keys" }] },
  { name: "admin", children: [{ name: "features" }, { name: "users" }] },
];

describe("nexusSettingsTabs", () => {
  it("tira Admin, Seguranca e Desenvolvedor do menu", () => {
    expect(nexusSettingsTabs(tabs).map((tab) => tab.name)).toEqual(["my_account"]);
  });

  it("tira as notificacoes push de dentro de Minha conta", () => {
    expect(nexusSettingsTabs(tabs)[0].children?.map((child) => child.name)).toEqual(["profile"]);
  });

  it("aba sem filhos continua sem filhos", () => {
    expect(nexusSettingsTabs([{ name: "teams" }])).toEqual([{ name: "teams", children: undefined }]);
  });

  it("casa da Configuracoes no Nexus e o perfil", () => {
    expect(NEXUS_SETTINGS_HOME).toBe("/settings/my-account/profile");
  });
});
