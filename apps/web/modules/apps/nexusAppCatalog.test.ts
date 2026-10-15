// Criado: 2026-10-12 BRT. Loja de apps dentro do Nexus mostra so o que a casa sustenta.
import { describe, expect, it } from "vitest";
import {
  appsForNexusCategory,
  isNexusManagedConnection,
  NEXUS_INTEGRATIONS_URL,
  nexusAppDescriptionKey,
  nexusAppNameKey,
  nexusAppPageSections,
} from "./nexusAppCatalog";

// Porta unica (2026-10-15): no quadro do Nexus toda conexao de agenda nasce em Integracoes do Nexus.
describe("isNexusManagedConnection", () => {
  it("no modo Nexus, qualquer app de agenda conecta pelo Nexus, nao so o Google", () => {
    expect(isNexusManagedConnection(true, ["calendar"])).toBe(true);
    expect(isNexusManagedConnection(true, ["other", "calendar"])).toBe(true);
  });

  it("fora do modo Nexus o motor segue conectando sozinho", () => {
    expect(isNexusManagedConnection(false, ["calendar"])).toBe(false);
  });

  it("app que nao e de agenda nao muda", () => {
    expect(isNexusManagedConnection(true, ["conferencing"])).toBe(false);
    expect(isNexusManagedConnection(true, [])).toBe(false);
  });
});

describe("NEXUS_INTEGRATIONS_URL", () => {
  it("aponta para a tela de Integracoes da conta no Nexus", () => {
    expect(NEXUS_INTEGRATIONS_URL).toBe("https://nexus.socialfy.me/#/conta/integracoes");
  });
});

const apps = [
  { slug: "google-calendar", description: "Google Calendar is a time management service" },
  { slug: "office365-calendar", description: "Microsoft Office 365" },
  { slug: "apple-calendar", description: "Apple calendar" },
  { slug: "caldav-calendar", description: "CalDav" },
];

describe("appsForNexusCategory", () => {
  it("na categoria de calendario mostra so o Google", () => {
    expect(appsForNexusCategory(apps, "calendar").map((app) => app.slug)).toEqual(["google-calendar"]);
  });

  it("categoria sem lista propria do Nexus fica como esta", () => {
    expect(appsForNexusCategory(apps, "video")).toBe(apps);
  });

  it("sem categoria fica como esta", () => {
    expect(appsForNexusCategory(apps, undefined)).toBe(apps);
  });
});

describe("nexusAppDescriptionKey", () => {
  it("Google tem descricao propria traduzida", () => {
    expect(nexusAppDescriptionKey("google-calendar")).toBe("nexus_app_description_google_calendar");
  });

  it("app sem descricao propria devolve null", () => {
    expect(nexusAppDescriptionKey("caldav-calendar")).toBeNull();
  });
});

describe("nexusAppNameKey", () => {
  it("Google usa o nome da casa", () => {
    expect(nexusAppNameKey("google-calendar")).toBe("nexus_app_name_google_calendar");
  });

  it("app sem nome proprio devolve null", () => {
    expect(nexusAppNameKey("caldav-calendar")).toBeNull();
  });
});

describe("nexusAppPageSections", () => {
  it("no modo Nexus esconde contato, galeria e preco do fornecedor e usa nome, categoria e descricao da casa", () => {
    expect(nexusAppPageSections(true, "google-calendar", "calendar")).toStrictEqual({
      showVendorContact: false,
      descriptionKey: "nexus_app_description_google_calendar",
      showGallery: false,
      showPrice: false,
      nameKey: "nexus_app_name_google_calendar",
      categoryKey: "calendar",
      compactTitle: true,
    });
  });

  it("no modo Nexus, app sem descricao nem nome proprio mantem os originais", () => {
    expect(nexusAppPageSections(true, "caldav-calendar")).toStrictEqual({
      showVendorContact: false,
      descriptionKey: null,
      showGallery: false,
      showPrice: false,
      nameKey: null,
      categoryKey: null,
      compactTitle: true,
    });
  });

  it("fora do modo Nexus a pagina fica igual", () => {
    expect(nexusAppPageSections(false, "google-calendar", "calendar")).toStrictEqual({
      showVendorContact: true,
      descriptionKey: null,
      showGallery: true,
      showPrice: true,
      nameKey: null,
      categoryKey: null,
      compactTitle: false,
    });
  });
});
