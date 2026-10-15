"use client";

// Criado: 2026-10-15 BRT. Porta unica: no quadro do Nexus a conexao de agenda mora em Integracoes do
// Nexus. O link sai do quadro (target _top) porque a tela de Integracoes e do Nexus, nao do motor.
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { NEXUS_INTEGRATIONS_URL } from "@calcom/web/modules/apps/nexusAppCatalog";

export function NexusIntegrationsButton({ className }: { className?: string }) {
  const { t } = useLocale();
  return (
    <Button
      className={className}
      color="secondary"
      EndIcon="external-link"
      href={NEXUS_INTEGRATIONS_URL}
      target="_top"
      data-testid="nexus-open-integrations">
      {t("nexus_open_integrations")}
    </Button>
  );
}

export function NexusIntegrationsNotice({ className }: { className?: string }) {
  const { t } = useLocale();
  return (
    <div className={className}>
      <p className="text-subtle text-sm">{t("nexus_calendar_connection_lives_in_integrations")}</p>
      <NexusIntegrationsButton className="mt-3" />
    </div>
  );
}
