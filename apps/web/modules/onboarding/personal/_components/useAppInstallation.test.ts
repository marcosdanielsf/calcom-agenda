// Criado: 2026-10-12 BRT. No quadro do Nexus o OAuth abre em outra aba e a instalacao fica pendente:
// o onboarding nao pode anunciar "instalado" nem chamar o passo seguinte antes da autorizacao.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn(), invalidate: vi.fn() }));
vi.mock("@calcom/ui/components/toast", () => ({ showToast: mocks.toast }));
vi.mock("@calcom/lib/hooks/useLocale", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
vi.mock("@calcom/trpc/react", () => ({
  trpc: { useUtils: () => ({ viewer: { apps: { integrations: { invalidate: mocks.invalidate } } } }) },
}));

import { useAppInstallation } from "./useAppInstallation";

beforeEach(() => vi.clearAllMocks());

describe("useAppInstallation no onboarding", () => {
  it("instalacao pendente (OAuth em outra aba) solta o card sem anunciar sucesso", () => {
    const next = vi.fn();
    const { result } = renderHook(() => useAppInstallation());
    act(() => result.current.setInstallingAppSlug("google-calendar"));
    act(() =>
      result.current
        .createInstallHandlers("google-calendar", next)
        .onSuccess({ setupPending: true, awaitingAuthorization: true })
    );
    expect(result.current.installingAppSlug).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("instalacao concluida anuncia sucesso e segue o passo", () => {
    const next = vi.fn();
    const { result } = renderHook(() => useAppInstallation());
    act(() =>
      result.current.createInstallHandlers("google-calendar", next).onSuccess({ setupPending: false })
    );
    expect(mocks.toast).toHaveBeenCalledWith("app_successfully_installed", "success");
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith("google-calendar");
  });
});
