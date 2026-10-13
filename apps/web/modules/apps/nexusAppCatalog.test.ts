// Criado: 2026-10-12 BRT. Loja de apps dentro do Nexus mostra so o que a casa sustenta.
import { describe, expect, it } from "vitest";
import { appsForNexusCategory, nexusAppDescriptionKey } from "./nexusAppCatalog";

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
