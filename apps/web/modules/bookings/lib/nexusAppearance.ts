import type { NexusAppearance } from "@calcom/prisma/zod-utils";
import DOMPurify from "dompurify";

export const NEXUS_HTML_FORBIDDEN_TAGS = ["script", "iframe", "object", "embed", "form", "base", "meta"];

export function getNexusAppearance(metadata: unknown): NexusAppearance | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const appearance = (metadata as { nexusAppearance?: NexusAppearance }).nexusAppearance;
  return appearance ?? undefined;
}

export function sanitizeNexusHtml(html: string): string {
  if (!html || typeof window === "undefined" || !DOMPurify.isSupported) return "";
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: NEXUS_HTML_FORBIDDEN_TAGS,
    FORBID_ATTR: ["srcdoc", "formaction"],
  });
}
