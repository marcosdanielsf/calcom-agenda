export const NEXUS_CUSTOM_CODE_MAX_LENGTH = 20000;

export type NexusCustomCodeValidation = { ok: true } | { ok: false; reason: "script" };

const NAMED_ENTITIES: Record<string, string> = {
  tab: "\t",
  newline: "\n",
  colon: ":",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lpar: "(",
  rpar: ")",
};

function safeFromCodePoint(codePoint: number): string {
  return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => safeFromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => safeFromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "data",
  "poster",
  "background",
]);
const FORBIDDEN_TAGS = new Set(["script", "iframe", "object", "embed", "base", "meta"]);

function compact(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: o navegador ignora controles e espaços dentro do esquema da URL
  return decodeHtmlEntities(value).replace(/[\u0000- ]/g, "");
}

function isJavascriptUrl(value: string): boolean {
  return /^javascript:/i.test(compact(value));
}

function hasJavascriptInCssUrl(css: string): boolean {
  return /url\(['"]?javascript:/i.test(compact(css));
}

/** Varre as tags do HTML e diz se alguma tem tag, atributo de evento ou URL javascript: proibidos. */
function htmlHasForbiddenMarkup(html: string): boolean {
  if (/<\s*script/i.test(html)) return true;
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf("<", i);
    if (open === -1) return false;
    const first = html[open + 1];
    if (!first || !/[a-zA-Z]/.test(first)) {
      i = open + 1;
      continue;
    }
    let j = open + 1;
    while (j < html.length && !/[\s/>]/.test(html[j])) j++;
    if (FORBIDDEN_TAGS.has(html.slice(open + 1, j).toLowerCase())) return true;
    while (j < html.length && html[j] !== ">") {
      while (j < html.length && /[\s/]/.test(html[j])) j++;
      if (j >= html.length || html[j] === ">") break;
      const nameStart = j;
      while (j < html.length && !/[\s/=>]/.test(html[j])) j++;
      const name = html.slice(nameStart, j).toLowerCase();
      while (j < html.length && /\s/.test(html[j])) j++;
      let value = "";
      if (html[j] === "=") {
        j++;
        while (j < html.length && /\s/.test(html[j])) j++;
        const quote = html[j];
        if (quote === '"' || quote === "'") {
          const close = html.indexOf(quote, j + 1);
          const end = close === -1 ? html.length : close;
          value = html.slice(j + 1, end);
          j = end + 1;
        } else {
          const valueStart = j;
          while (j < html.length && !/[\s>]/.test(html[j])) j++;
          value = html.slice(valueStart, j);
        }
      }
      if (name.startsWith("on")) return true;
      if (URL_ATTRIBUTES.has(name) && isJavascriptUrl(value)) return true;
      if (name === "style" && hasJavascriptInCssUrl(value)) return true;
    }
    i = j + 1;
  }
  return false;
}

const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const STYLE_BLOCK_PATTERN = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

function variantIsForbidden(code: string): boolean {
  const cssBlocks: string[] = [];
  const html = code.replace(STYLE_BLOCK_PATTERN, (_match, css: string) => {
    cssBlocks.push(css);
    return "";
  });
  return htmlHasForbiddenMarkup(html) || cssBlocks.some(hasJavascriptInCssUrl);
}

export function validateNexusCustomCode(code: string): NexusCustomCodeValidation {
  // O render tira os comentários antes de sanitizar, então valida o texto cru E o texto sem comentários.
  const variants = [code, code.replace(HTML_COMMENT_PATTERN, "")];
  return variants.some(variantIsForbidden) ? { ok: false, reason: "script" } : { ok: true };
}

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;

export function splitNexusCustomCode(code: string): { css: string; html: string } {
  const withoutComments = code.replace(HTML_COMMENT, "");
  const cssBlocks: string[] = [];
  const html = withoutComments
    .replace(STYLE_BLOCK, (_match, css: string) => {
      const trimmed = css.trim();
      if (trimmed) cssBlocks.push(trimmed);
      return "";
    })
    .trim();
  return { css: cssBlocks.join("\n"), html };
}

export function escapeCssForStyleTag(css: string): string {
  return css.replace(/<(?=\/style|!--|script)/gi, "\\3c ");
}
