// Criado: 2026-10-12 BRT. Loja de apps dentro do Nexus mostra so o que a casa sustenta.
import { describe, expect, it } from "vitest";
import { appsForNexusCategory, nexusAppDescriptionKey, nexusAppPageSections } from "./nexusAppCatalog";

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

describe("nexusAppPageSections", () => {
  it("no modo Nexus esconde contato e aviso do fornecedor e usa a descricao traduzida", () => {
    expect(nexusAppPageSections(true, "google-calendar")).toStrictEqual({
      showVendorContact: false,
      descriptionKey: "nexus_app_description_google_calendar",
    });
  });

  it("no modo Nexus, app sem descricao propria mantem o corpo original", () => {
    expect(nexusAppPageSections(true, "caldav-calendar")).toStrictEqual({
      showVendorContact: false,
      descriptionKey: null,
    });
  });

  it("fora do modo Nexus a pagina fica igual", () => {
    expect(nexusAppPageSections(false, "google-calendar")).toStrictEqual({
      showVendorContact: true,
      descriptionKey: null,
    });
  });
});
