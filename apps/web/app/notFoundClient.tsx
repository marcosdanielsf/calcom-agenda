"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

// Página vista por paciente: sem links para fora do domínio nem nome de fornecedor.
export function NotFound({ host: _host }: { host: string }) {
  const { t } = useLocale();
  const pathname = usePathname() ?? "";
  const isBookingSuccessPage = pathname.startsWith("/booking");

  useLayoutEffect(() => {
    if (typeof window !== "undefined") {
      window.CalComPageStatus = "404";
    }
  }, []);

  return (
    <div className="min-h-screen bg-default px-4" data-testid="404-page">
      <main className="mx-auto max-w-xl pt-16 pb-6 sm:pt-24">
        <div className="text-center">
          <p className="font-semibold text-emphasis text-sm uppercase tracking-wide">{t("error_404")}</p>
          <h1 className="mt-2 font-cal font-extrabold text-4xl text-emphasis sm:text-5xl">
            {isBookingSuccessPage ? t("nexus_booking_not_found") : t("nexus_page_not_found_title")}
          </h1>
          <p className="mt-4 text-lg text-default">{t("nexus_page_not_found_description")}</p>
        </div>
      </main>
    </div>
  );
}
