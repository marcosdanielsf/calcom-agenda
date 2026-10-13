import { type NexusAppearance, nexusAppearanceReadSchema } from "@calcom/prisma/zod-utils";
import DOMPurify from "dompurify";

export const NEXUS_HTML_FORBIDDEN_TAGS = ["script", "iframe", "object", "embed", "form", "base", "meta"];

const NEXUS_HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Cor que pode ir para dentro de um <style> ou de um style inline: só hex, senão null. */
export function validNexusHex(value?: string | null): string | null {
  return value && NEXUS_HEX_COLOR.test(value) ? value : null;
}

export function getNexusAppearance(metadata: unknown): NexusAppearance | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const parsed = nexusAppearanceReadSchema.safeParse((metadata as { nexusAppearance?: unknown }).nexusAppearance);
  return parsed.success ? parsed.data : undefined;
}

export function sanitizeNexusHtml(html: string): string {
  if (!html || typeof window === "undefined" || !DOMPurify.isSupported) return "";
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: NEXUS_HTML_FORBIDDEN_TAGS,
    FORBID_ATTR: ["srcdoc", "formaction"],
  });
}
