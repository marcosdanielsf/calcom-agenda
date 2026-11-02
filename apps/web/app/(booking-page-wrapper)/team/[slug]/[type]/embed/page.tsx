// Criado: 2026-11-02 BRT. Versao para embutir no site da reserva de calendario de equipe.
import { buildLegacyCtx } from "@lib/buildLegacyCtx";
import { getServerSideProps } from "@server/lib/team/[slug]/[type]/getServerSideProps";
import type { PageProps } from "app/_types";
import withEmbedSsrAppDir from "app/WithEmbedSSR";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import TypePage, { type PageProps as ClientPageProps } from "~/users/views/users-type-public-view";

const getData = withEmbedSsrAppDir<ClientPageProps>(getServerSideProps);

export const metadata: Metadata = { robots: { follow: false, index: false } };

const ServerPage = async ({ params, searchParams }: PageProps) => {
  const context = buildLegacyCtx(await headers(), await cookies(), await params, await searchParams);
  return <TypePage {...await getData(context)} />;
};

export default ServerPage;
