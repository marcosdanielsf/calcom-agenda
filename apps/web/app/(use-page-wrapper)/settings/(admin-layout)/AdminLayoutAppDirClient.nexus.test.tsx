// @vitest-environment-options {"url":"https://agenda.socialfy.me"}
// Criado: 2026-10-12 BRT. Rotas /settings/admin/* no quadro do Nexus voltam para o perfil: a
// administracao do motor e feita por fora, nunca pela V2.

import { NexusShellProvider } from "@calcom/web/modules/shell/NexusShell";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayoutAppDirClient from "./AdminLayoutAppDirClient";

const state = vi.hoisted(() => ({ pathname: "/settings/admin/users", search: "shell=nexus" }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => router,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NexusShellProvider>{children}</NexusShellProvider>
);

beforeEach(() => {
  state.pathname = "/settings/admin/users";
  state.search = "shell=nexus&theme=dark";
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("Admin do motor dentro do Nexus", () => {
  it("no modo Nexus nao mostra a pagina e volta para o perfil", () => {
    render(
      <AdminLayoutAppDirClient userRole="ADMIN">
        <p>Usuarios do motor</p>
      </AdminLayoutAppDirClient>,
      { wrapper }
    );
    expect(screen.queryByText("Usuarios do motor")).toBeNull();
    expect(router.replace).toHaveBeenCalledWith("/settings/my-account/profile?shell=nexus&theme=dark");
  });

  it("fora do modo Nexus o admin continua igual", () => {
    state.search = "shell=standalone";
    render(
      <AdminLayoutAppDirClient userRole="ADMIN">
        <p>Usuarios do motor</p>
      </AdminLayoutAppDirClient>,
      { wrapper }
    );
    expect(screen.getByText("Usuarios do motor")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
