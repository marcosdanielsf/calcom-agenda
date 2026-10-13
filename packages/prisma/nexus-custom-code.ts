export const NEXUS_CUSTOM_CODE_MAX_LENGTH = 20000;

export type NexusCustomCodeValidation = { ok: true } | { ok: false; reason: "script" };

const FORBIDDEN_PATTERNS: RegExp[] = [
  /<\s*script/i,
  /(^|[\s"'/])on\w+\s*=/i,
  /javascript\s*:/i,
  /<\s*(iframe|object|embed|base|meta)\b/i,
];

export function validateNexusCustomCode(code: string): NexusCustomCodeValidation {
  const forbidden = FORBIDDEN_PATTERNS.some((pattern) => pattern.test(code));
  return forbidden ? { ok: false, reason: "script" } : { ok: true };
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
