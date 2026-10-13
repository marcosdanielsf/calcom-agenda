"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import React, { useEffect } from "react";

import type { UserPermissionRole } from "@calcom/prisma/enums";
import { ErrorBoundary } from "@calcom/ui/components/errorBoundary";
import { NEXUS_SETTINGS_HOME } from "@calcom/web/modules/settings/nexusSettings";
import { useNexusShell, useNexusTheme } from "@calcom/web/modules/shell/NexusShell";

import type Shell from "~/shell/Shell";

export type AdminLayoutProps = {
  children: React.ReactNode;
  userRole: UserPermissionRole | "INACTIVE_ADMIN" | undefined;
} & ComponentProps<typeof Shell>;
export default function AdminLayoutAppDirClient({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  // A administracao do motor e feita por fora: dentro do quadro do Nexus, volta para o perfil.
  // Leva shell e tema na URL, como o nexus:navigate: o modo nao fica dependendo so do cookie.
  const nexus = useNexusShell();
  const theme = useNexusTheme() ?? "light";
  useEffect(() => {
    if (nexus) router.replace(`${NEXUS_SETTINGS_HOME}?shell=nexus&theme=${theme}`);
  }, [nexus, router, theme]);

  const isAppsPage = pathname?.startsWith("/settings/admin/apps");
  if (nexus) return null;
  return (
    <div className="divide-subtle bg-default mx-auto flex max-w-4xl flex-row divide-y">
      <div className={isAppsPage ? "min-w-0" : "*:flex-1 flex flex-1"}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </div>
    </div>
  );
}
