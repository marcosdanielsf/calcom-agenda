import { useState } from "react";

import { isAwaitingAuthorization } from "@calcom/app-store/_utils/installNavigation";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";

type InstallSuccessCallback = (appSlug: string) => void;

export const useAppInstallation = () => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [installingAppSlug, setInstallingAppSlug] = useState<string | null>(null);

  const createInstallHandlers = (appSlug: string, onSuccess?: InstallSuccessCallback) => {
    return {
      onSuccess: (data?: unknown) => {
        setInstallingAppSlug(null);
        // OAuth aberto em outra aba (quadro do Nexus): ainda nao instalou, o aviso ja saiu pelo hook.
        if (isAwaitingAuthorization(data)) return;
        utils.viewer.apps.integrations.invalidate();
        showToast(t("app_successfully_installed"), "success");

        // Call custom success callback if provided
        onSuccess?.(appSlug);
      },
      onError: (error: unknown) => {
        setInstallingAppSlug(null);
        if (error instanceof Error) {
          showToast(error.message || t("app_could_not_be_installed"), "error");
        }
      },
    };
  };

  return {
    installingAppSlug,
    setInstallingAppSlug,
    createInstallHandlers,
  };
};
