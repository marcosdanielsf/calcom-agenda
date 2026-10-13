import { escapeCssForStyleTag, splitNexusCustomCode } from "@calcom/prisma/nexus-custom-code";
import type { NexusAppearance } from "@calcom/prisma/zod-utils";
import { sanitizeNexusHtml } from "@calcom/web/modules/bookings/lib/nexusAppearance";

const PREVIEW_SLOTS = ["09:00", "09:30", "10:00", "10:30"];

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type PreviewInput = {
  appearance?: NexusAppearance;
  title: string;
  durationLabel: string;
  buttonLabel: string;
};

export function buildPreviewDocument({
  appearance,
  title,
  durationLabel,
  buttonLabel,
}: PreviewInput): string {
  const primary = validHex(appearance?.primaryColor) ?? "#111827";
  const background = validHex(appearance?.backgroundColor) ?? "#ffffff";
  const { css, html } = splitNexusCustomCode(appearance?.customCode ?? "");
  const cover = appearance?.coverImageUrl
    ? `<img data-nexus="cover" src="${escapeHtml(appearance.coverImageUrl)}" alt="">`
    : "";
  const heading =
    appearance?.showTitle === false ? "" : `<h1 data-nexus="event-title">${escapeHtml(title)}</h1>`;
  const slots = PREVIEW_SLOTS.map(
    (slot, index) => `<button type="button" data-nexus="slot" aria-pressed="${index === 1}">${slot}</button>`
  ).join("");
  const label = escapeHtml(appearance?.buttonText || buttonLabel);

  const baseCss = `
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,sans-serif;font-size:14px}
    [data-nexus="booker"]{padding:16px;min-height:100vh;background:${background};color:${isDark(background) ? "#eaeefb" : "#111827"}}
    [data-nexus="cover"]{display:block;max-width:100%;height:auto;border-radius:8px;margin-bottom:12px}
    h1{font-size:18px;margin:0 0 4px}
    p.meta{margin:0 0 12px;opacity:.7}
    .slots{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
    [data-nexus="slot"]{padding:8px;border-radius:6px;border:1px solid ${primary};background:transparent;color:inherit;cursor:pointer}
    [data-nexus="slot"][aria-pressed="true"]{background:${primary};color:#fff}
    [data-nexus="cta"]{width:100%;padding:10px;border:0;border-radius:6px;background:${primary};color:#fff;font-weight:600}
  `;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${escapeCssForStyleTag(baseCss)}</style><style>${escapeCssForStyleTag(css)}</style></head><body><div data-nexus="booker">${cover}${heading}<p class="meta">${escapeHtml(durationLabel)}</p><div class="slots">${slots}</div><button type="button" data-nexus="cta">${label}</button></div>${sanitizeNexusHtml(html)}</body></html>`;
}

function validHex(value?: string | null): string | null {
  return value && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : null;
}

function isDark(hex: string): boolean {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.replace(/./g, "$&$&") : value;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
