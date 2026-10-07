// Atualizado: 2026-10-06 10:12 BRT. Prova mecanica da cascata, nao do login ou produto em dominio.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const css = await readFile(new URL("../apps/web/styles/nexus-shell.css", import.meta.url), "utf8");
const compiledCss = await readFile(
  new URL("../packages/platform/atoms/globals.css", import.meta.url),
  "utf8"
);
const darkTextUtility = compiledCss.match(/\.dark\\:text-white:is\(\.dark \*\) \{[^}]+\}/)?.[0];
const darkBackgroundUtility = compiledCss.match(/\.dark\\:bg-cal-muted:is\(\.dark \*\) \{[^}]+\}/)?.[0];
assert.ok(darkTextUtility);
assert.ok(darkBackgroundUtility);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<html class="dark" style="--cal-brand: red"><head><style>
    :root { --font-nexus: Roboto; --font-sans: serif; --cal-bg: black; --radius-md: 2px; --color-white: #fff; }
    body { font: 16px/24px serif; }
    button { border-radius: var(--radius-md); background: var(--cal-brand); color: var(--cal-brand-text); }
    dialog { background: var(--cal-bg); color: var(--cal-text); border-color: var(--cal-border); }
    [data-card] { background: var(--card); color: var(--foreground); }
    [data-muted] { background: var(--muted); color: var(--muted-foreground); }
    [data-accent] { background: var(--accent); color: var(--accent-foreground); }
    input { border-color: var(--input); }
    a { color: var(--link); }
    [data-dark-utility] { color: var(--cal-text); background: var(--cal-bg); }
    ${darkTextUtility}
    ${darkBackgroundUtility}
    ${css}
    </style></head><body><button>Salvar</button><div data-card>Card</div><div data-muted>Muted</div><div data-accent>Accent</div><div data-dark-utility class="dark:text-white dark:bg-cal-muted">Utility</div><input><a href="#">Link</a><dialog open>Detalhes</dialog></body></html>`);
  const measure = () =>
    page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const button = getComputedStyle(document.querySelector("button"));
      const dialog = getComputedStyle(document.querySelector("dialog"));
      const card = getComputedStyle(document.querySelector("[data-card]"));
      const muted = getComputedStyle(document.querySelector("[data-muted]"));
      const accent = getComputedStyle(document.querySelector("[data-accent]"));
      const input = getComputedStyle(document.querySelector("input"));
      const link = getComputedStyle(document.querySelector("a"));
      const darkUtility = getComputedStyle(document.querySelector("[data-dark-utility]"));
      return {
        scheme: root.colorScheme,
        bgSubtle: root.getPropertyValue("--cal-bg-subtle").trim(),
        bgEmphasis: root.getPropertyValue("--cal-bg-emphasis").trim(),
        textInverted: root.getPropertyValue("--cal-text-inverted").trim(),
        background: root.getPropertyValue("--background").trim(),
        primary: root.getPropertyValue("--primary").trim(),
        secondary: root.getPropertyValue("--secondary").trim(),
        popover: root.getPropertyValue("--popover").trim(),
        ring: root.getPropertyValue("--ring").trim(),
        font: body.fontFamily,
        size: body.fontSize,
        line: body.lineHeight,
        bodyBackground: body.backgroundColor,
        radius: button.borderRadius,
        brand: button.backgroundColor,
        brandText: button.color,
        panel: dialog.backgroundColor,
        panelText: dialog.color,
        panelBorder: dialog.borderColor,
        card: card.backgroundColor,
        cardText: card.color,
        muted: muted.backgroundColor,
        mutedText: muted.color,
        accent: accent.backgroundColor,
        accentText: accent.color,
        input: input.borderColor,
        link: link.color,
        utilityBackground: darkUtility.backgroundColor,
        utilityText: darkUtility.color,
      };
    });
  const original = await measure();
  assert.equal(original.size, "16px");
  assert.equal(original.brand, "rgb(255, 0, 0)");
  await page.evaluate(() => {
    const marker = document.createElement("span");
    marker.hidden = true;
    marker.dataset.nexusShell = "true";
    marker.dataset.nexusTheme = "light";
    document.body.append(marker);
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  });
  const light = await measure();
  assert.equal(light.scheme, "light");
  assert.match(light.font, /Roboto/);
  assert.equal(light.size, "14px");
  assert.equal(light.line, "21px");
  assert.equal(light.radius, "8px");
  assert.equal(light.bgSubtle, "transparent");
  assert.equal(light.background, "transparent");
  assert.equal(light.bodyBackground, "rgba(0, 0, 0, 0)");
  assert.equal(light.brand, "rgb(21, 94, 239)");
  assert.equal(light.brandText, "rgb(255, 255, 255)");
  assert.equal(light.panel, "rgb(255, 255, 255)");
  assert.equal(light.panelText, "rgb(16, 24, 40)");
  assert.equal(light.panelBorder, "rgb(234, 236, 240)");
  assert.equal(light.utilityBackground, "rgb(255, 255, 255)");
  assert.equal(light.utilityText, "rgb(16, 24, 40)");

  await page.evaluate(() => {
    document.querySelector("[data-nexus-shell]").dataset.nexusTheme = "dark";
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  });
  const dark = await measure();
  assert.equal(dark.scheme, "dark");
  assert.equal(dark.bgSubtle, "transparent");
  assert.equal(dark.bgEmphasis, "#2d3748");
  assert.equal(dark.textInverted, "#0f172a");
  assert.equal(dark.background, "transparent");
  assert.equal(dark.primary, "#2563eb");
  assert.equal(dark.secondary, "#273449");
  assert.equal(dark.popover, "#1e293b");
  assert.equal(dark.ring, "#60a5fa");
  assert.match(dark.font, /Roboto/);
  assert.equal(dark.size, "14px");
  assert.equal(dark.line, "21px");
  assert.equal(dark.radius, "8px");
  assert.equal(dark.bodyBackground, "rgba(0, 0, 0, 0)");
  assert.equal(dark.brand, "rgb(37, 99, 235)");
  assert.equal(dark.brandText, "rgb(255, 255, 255)");
  assert.equal(dark.panel, "rgb(30, 41, 59)");
  assert.equal(dark.panelText, "rgb(241, 245, 249)");
  assert.equal(dark.panelBorder, "rgb(51, 65, 85)");
  assert.equal(dark.card, "rgb(30, 41, 59)");
  assert.equal(dark.cardText, "rgb(241, 245, 249)");
  assert.equal(dark.muted, "rgb(39, 52, 73)");
  assert.equal(dark.mutedText, "rgb(148, 163, 184)");
  assert.equal(dark.accent, "rgba(59, 130, 246, 0.16)");
  assert.equal(dark.accentText, "rgb(96, 165, 250)");
  assert.equal(dark.input, "rgb(71, 85, 105)");
  assert.equal(dark.link, "rgb(96, 165, 250)");
  assert.equal(dark.utilityBackground, "rgb(39, 52, 73)");
  assert.equal(dark.utilityText, "rgb(255, 255, 255)");
  await page.evaluate(() => {
    document.querySelector("[data-nexus-shell]").remove();
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "";
  });
  assert.deepEqual(await measure(), original);
  console.log(
    "NEXUS_SHELL_STYLE_PASS: claro, escuro, tipografia, raio, portal e restauracao; sem prova de login"
  );
} finally {
  await browser.close();
}
