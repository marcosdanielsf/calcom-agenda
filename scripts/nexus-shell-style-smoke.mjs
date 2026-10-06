// Criado: 2026-10-05 23:36 BRT. Prova mecanica da cascata, nao do login ou produto em dominio.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const css = await readFile(new URL("../apps/web/styles/nexus-shell.css", import.meta.url), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<html class="dark" style="--cal-brand: red"><head><style>
    :root { --font-nexus: Roboto; --font-sans: serif; --cal-bg: black; --radius-md: 2px; }
    body { font: 16px/24px serif; }
    button { border-radius: var(--radius-md); background: var(--cal-brand); }
    dialog { background: var(--cal-bg); color: var(--cal-text); }
    ${css}
    </style></head><body><button>Salvar</button><dialog open>Detalhes</dialog></body></html>`);
  const measure = () =>
    page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const button = getComputedStyle(document.querySelector("button"));
      const dialog = getComputedStyle(document.querySelector("dialog"));
      return {
        font: body.fontFamily,
        size: body.fontSize,
        line: body.lineHeight,
        radius: button.borderRadius,
        brand: button.backgroundColor,
        panel: dialog.backgroundColor,
      };
    });
  const original = await measure();
  assert.equal(original.size, "16px");
  assert.equal(original.brand, "rgb(255, 0, 0)");
  await page.evaluate(() => {
    const marker = document.createElement("span");
    marker.hidden = true;
    marker.dataset.nexusShell = "true";
    document.body.append(marker);
  });
  const themed = await measure();
  assert.match(themed.font, /Roboto/);
  assert.equal(themed.size, "14px");
  assert.equal(themed.line, "21px");
  assert.equal(themed.radius, "8px");
  assert.equal(themed.brand, "rgb(21, 94, 239)");
  assert.equal(themed.panel, "rgb(255, 255, 255)");
  await page.evaluate(() => document.querySelector("[data-nexus-shell]").remove());
  assert.deepEqual(await measure(), original);
  console.log("NEXUS_SHELL_STYLE_PASS: ativacao, portal e restauracao; sem prova de login");
} finally {
  await browser.close();
}
