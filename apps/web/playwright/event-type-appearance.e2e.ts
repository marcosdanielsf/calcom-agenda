import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";
import { gotoFirstEventType, saveEventType, selectFirstAvailableTimeSlotNextMonth } from "./lib/testUtils";

test.describe.configure({ mode: "parallel" });

const houseCss = fs.readFileSync(path.join(__dirname, "fixtures/nexus-appearance-mottivme.css")).toString();

const COVER_URL = "https://example.com/capa.png";

async function openAppearanceTab(page: Page) {
  await page.goto("/event-types");
  await page.waitForSelector('[data-testid="event-types"]');
  await gotoFirstEventType(page);
  const editorId = new URL(page.url()).pathname.split("/").pop();
  const editorUrl = `/event-types/${editorId}?tabName=appearance`;
  await page.goto(editorUrl);
  await expect(page.getByTestId("nexus-appearance-tab")).toBeVisible();
  const bookingHref = await page.locator("[data-testid=preview-button]").getAttribute("href");
  return { editorUrl, bookingHref: bookingHref ?? "" };
}

test.describe("Aparência do tipo de agendamento", () => {
  test.beforeEach(async ({ page, users }) => {
    const user = await users.create();
    await user.apiLogin();
    await page.goto("/event-types");
  });

  test.afterEach(async ({ users }) => {
    await users.deleteAll();
  });

  test("o CSS do molde da casa aparece na página pública", async ({ page }) => {
    const { bookingHref } = await openAppearanceTab(page);
    await page.getByTestId("nexus-custom-code").fill(houseCss);
    await saveEventType(page);

    await page.goto(bookingHref);
    await selectFirstAvailableTimeSlotNextMonth(page);

    await expect(page.locator('[data-nexus="booker"]')).toHaveCSS("background-color", "rgb(11, 18, 32)");
    await expect(page.locator('[data-nexus="cta"]')).toHaveCSS("background-color", "rgb(0, 63, 241)");
    await expect(page.locator("style[data-nexus-custom-css]")).toHaveCount(1);
  });

  test("script no código personalizado é recusado e nada é salvo", async ({ page }) => {
    const { editorUrl } = await openAppearanceTab(page);
    await page.getByTestId("nexus-custom-code").fill("<script>alert(1)</script>");

    await expect(page.getByTestId("nexus-custom-code-error")).toContainText(
      "Script is not accepted in the custom code. Use only CSS and HTML."
    );
    await page.locator("[data-testid=update-eventtype]").click();

    await page.goto(editorUrl);
    await expect(page.getByTestId("nexus-custom-code")).toHaveValue("");
  });

  test("tipo sem código personalizado renderiza sem a folha de estilo do cliente", async ({ page }) => {
    const { bookingHref } = await openAppearanceTab(page);

    await page.goto(bookingHref);
    await expect(page.locator('[data-nexus="booker"]')).toBeVisible();
    await expect(page.locator("style[data-nexus-custom-css]")).toHaveCount(0);
    await expect(page.locator('[data-nexus="cover"]')).toHaveCount(0);
  });

  test("capa e texto do botão aparecem na página pública", async ({ page }) => {
    const { bookingHref } = await openAppearanceTab(page);
    await page.getByTestId("nexus-cover-url").fill(COVER_URL);
    await page.getByTestId("nexus-button-text").fill("Agendar agora");
    await saveEventType(page);

    await page.goto(bookingHref);
    await expect(page.locator('[data-nexus="cover"]')).toHaveAttribute("src", COVER_URL);
    await selectFirstAvailableTimeSlotNextMonth(page);
    await expect(page.locator('[data-nexus="cta"]')).toHaveText("Agendar agora");
  });

  test("a cor do tipo vence a cor da conta", async ({ page, users, prisma }) => {
    const user = users.get().at(0);
    if (!user) throw new Error("usuário de teste não encontrado");
    await prisma.user.update({
      where: { id: user.id },
      data: { brandColor: "#ff0000", darkBrandColor: "#ff0000" },
    });

    const { bookingHref } = await openAppearanceTab(page);
    await page.getByTestId("nexus-primary-color").fill("#003ff1");
    await saveEventType(page);

    await page.goto(bookingHref);
    await selectFirstAvailableTimeSlotNextMonth(page);
    await expect(page.locator('[data-nexus="cta"]')).toHaveCSS("background-color", "rgb(0, 63, 241)");
  });

  test("em 390 px a aba é usável e a prévia fica abaixo do formulário", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAppearanceTab(page);

    const coverField = page.getByTestId("nexus-cover-url");
    const preview = page.getByTestId("nexus-appearance-preview");
    await expect(coverField).toBeVisible();
    await preview.scrollIntoViewIfNeeded();

    const coverBox = await coverField.boundingBox();
    const previewBox = await preview.boundingBox();
    if (!coverBox || !previewBox) throw new Error("caixas não encontradas");
    expect(previewBox.y).toBeGreaterThan(coverBox.y);
    expect(previewBox.x).toBeLessThan(coverBox.x + coverBox.width);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
