"use client";

import { escapeCssForStyleTag, splitNexusCustomCode } from "@calcom/prisma/nexus-custom-code";
import type { NexusAppearance } from "@calcom/prisma/zod-utils";
import { sanitizeNexusHtml } from "@calcom/web/modules/bookings/lib/nexusAppearance";
import { useEffect, useMemo, useRef } from "react";

export const NexusAppearanceLayer = ({ appearance }: { appearance?: NexusAppearance }) => {
  const htmlRef = useRef<HTMLDivElement>(null);
  const customCode = appearance?.customCode ?? "";
  const { css, html } = useMemo(() => splitNexusCustomCode(customCode), [customCode]);

  useEffect(() => {
    if (htmlRef.current) htmlRef.current.innerHTML = sanitizeNexusHtml(html);
  }, [html]);

  if (!appearance) return null;

  return (
    <>
      {appearance.backgroundColor && (
        <style
          data-nexus-appearance-vars
          // biome-ignore lint/security/noDangerouslySetInnerHtml: valor validado como hex pelo schema
          dangerouslySetInnerHTML={{
            __html: `[data-nexus="booker"]{background-color:${appearance.backgroundColor}}`,
          }}
        />
      )}
      {css && (
        <style
          data-nexus-custom-css
          // biome-ignore lint/security/noDangerouslySetInnerHtml: CSS do dono do tipo, com fechamento de tag neutralizado
          dangerouslySetInnerHTML={{ __html: escapeCssForStyleTag(css) }}
        />
      )}
      {html && <div data-nexus-custom-html ref={htmlRef} />}
    </>
  );
};
