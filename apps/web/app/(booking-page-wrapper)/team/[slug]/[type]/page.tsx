// Criado: 2026-11-02 BRT. Reserva publica de calendario de equipe; a tela e a mesma da pessoal.
import { buildLegacyCtx } from "@lib/buildLegacyCtx";
import { getServerSideProps } from "@server/lib/team/[slug]/[type]/getServerSideProps";
import type { PageProps } from "app/_types";
import { withAppDirSsr } from "app/WithAppDirSsr";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import type { PageProps as LegacyPageProps } from "~/users/views/users-type-public-view";
import LegacyPage from "~/users/views/users-type-public-view";

const getData = withAppDirSsr<LegacyPageProps>(getServerSideProps);

export const metadata: Metadata = { robots: { follow: false, index: false } };

const ServerPage = async ({ params, searchParams }: PageProps) => {
  const context = buildLegacyCtx(await headers(), await cookies(), await params, await searchParams);
  return <LegacyPage {...await getData(context)} />;
};

export default ServerPage;
