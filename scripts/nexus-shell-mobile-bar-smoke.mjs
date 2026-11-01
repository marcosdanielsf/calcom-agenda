// Atualizado: 2026-11-01 BRT. Prova mecanica da barra da Agenda a 390 px no modo Nexus.
// Replica o DOM das barras (BookingListContainer, BookingCalendarContainer, ToggleGroup) com o CSS dos
// utilitarios Tailwind que elas usam e aplica o nexus-shell.css real. Nao prova o app, prova a regra.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const css = await readFile(new URL("../apps/web/styles/nexus-shell.css", import.meta.url), "utf8");
const utilities = `
  *{box-sizing:border-box}body{margin:0;font:14px/21px sans-serif}
  .flex{display:flex}.inline-flex{display:inline-flex}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}
  .gap-2{gap:8px}.gap-0\\.5{gap:2px}.shrink-0{flex-shrink:0}.min-w-0{min-width:0}.flex-1{flex:1 1 0%}
  .w-full{width:100%}.overflow-x-auto{overflow-x:auto}.order-first{order:-9999}
  .-mx-1{margin-inline:-4px}.px-1{padding-inline:4px}.py-0\\.5{padding-block:2px}.p-3{padding:12px}
  .btn{white-space:nowrap;padding:6px 12px;border:1px solid #ccc}
  .tg{padding:2px;border-radius:10px;background:#eee}.tg .btn{padding:6px}
  .wide{min-width:96px}`;
const toggle = (labels) =>
  `<div class="tg inline-flex gap-0.5">${labels.map((l) => `<button class="btn">${l}</button>`).join("")}</div>`;
const html = (hook) => `<html><head><style>${utilities}${hook ? css : ""}</style></head><body>
<span hidden data-nexus-shell="true" data-nexus-theme="light"></span><main class="p-3">
 <div class="flex flex-wrap items-center gap-2">
  <div class="w-full md:w-auto"><div data-testid="booking-status-tabs" class="overflow-x-auto md:overflow-visible">
   ${toggle(["Próximas", "Não confirmadas", "Recorrentes", "Passadas", "Canceladas"])}</div></div>
  <div data-testid="booking-list-toolbar" class="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-0.5">
   <button class="btn">Filtrar</button><button class="btn">Segmentos</button><button class="btn shrink-0">Novo agendamento</button>
   <div class="order-first shrink-0">${toggle(["Lista", "Calendário"])}</div>
  </div>
 </div>
 <div data-testid="booking-calendar-toolbar" class="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5">
  <div class="flex shrink-0 items-center gap-2"><button class="btn wide">1 a 7 nov</button></div>
  <div class="flex shrink-0 items-center gap-2">${toggle(["Dia", "Semana", "Mês"])}
   <button class="btn">Hoje</button><button class="btn shrink-0">Novo agendamento</button><button class="btn">&lt;</button><button class="btn">&gt;</button></div>
  <div class="order-first shrink-0">${toggle(["Lista", "Calendário"])}</div>
 </div></main></body></html>`;

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROME_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } : {}),
});
const measure = (page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = (sel) => {
      const root = document.querySelector(sel);
      const overflow = [...root.querySelectorAll("button")].filter(
        (b) => b.getBoundingClientRect().right > vw + 0.5 || b.getBoundingClientRect().left < -0.5
      ).length;
      return { overflow, rows: new Set([...root.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().top))).size };
    };
    const tabs = document.querySelector('[data-testid="booking-status-tabs"]');
    return {
      vw,
      page: document.documentElement.scrollWidth,
      list: out('[data-testid="booking-list-toolbar"]'),
      calendar: out('[data-testid="booking-calendar-toolbar"]'),
      tabsScrolls: tabs.scrollWidth > tabs.clientWidth,
      tabsCoverage: getComputedStyle(tabs).scrollbarWidth,
    };
  });
try {
  const run = async (width, withCss) => {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.setContent(html(withCss));
    const m = await measure(page);
    await page.close();
    return m;
  };
  const before = await run(390, false);
  assert.ok(before.list.overflow > 0 && before.calendar.overflow > 0, "sem a regra, os controles passam de 390 px");
  const after = await run(390, true);
  assert.equal(after.vw, 390);
  assert.equal(after.page, 390, "a pagina nao ganha rolagem horizontal");
  assert.equal(after.list.overflow, 0, "barra de acoes cabe em 390 px");
  assert.equal(after.calendar.overflow, 0, "barra do calendario cabe em 390 px");
  assert.ok(after.list.rows > 1 && after.calendar.rows > 1, "quebram em linhas proprias");
  assert.ok(after.tabsScrolls, "abas rolam na horizontal");
  assert.equal(after.tabsCoverage, "none", "sem barra de rolagem visivel");
  const desktop = await run(1024, true);
  const desktopBase = await run(1024, false);
  assert.deepEqual(desktop, desktopBase, "desktop (>= 600 px) nao muda");
  console.log("NEXUS_SHELL_MOBILE_BAR_PASS", JSON.stringify({ before, after }));
} finally {
  await browser.close();
}
