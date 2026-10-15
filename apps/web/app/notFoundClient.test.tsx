// @vitest-environment-options {"url":"https://agenda.socialfy.me"}
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFound } from "./notFoundClient";

const state = vi.hoisted(() => ({ pathname: "/demo/peeling" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({
    t: (key: string) =>
      ({
        error_404: "Erro 404",
        nexus_page_not_found_title: "Esta página não existe",
        nexus_page_not_found_description:
          "O link pode estar errado ou ter sido desativado. Fale com quem te enviou.",
        nexus_booking_not_found: "Reserva não encontrada",
      })[key] ?? key,
  }),
}));

afterEach(() => cleanup());

function renderAt(pathname: string) {
  state.pathname = pathname;
  return render(<NotFound host="agenda.socialfy.me" />).container;
}

describe("página 404 vista pelo paciente", () => {
  it("não tem link nenhum nem cita fornecedor", () => {
    const html = renderAt("/demo/peeling").innerHTML;
    expect(html).not.toMatch(/cal\.com/i);
    expect(html).not.toMatch(/cal\.diy/i);
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toContain("href=");
  });

  it("não oferece cadastro de nome de usuário nem páginas populares", () => {
    const text = renderAt("/demo/peeling").textContent ?? "";
    expect(text).not.toMatch(/dispon[ií]vel|registre|documenta|blog|populares|peeling/i);
    expect(text).toContain("Esta página não existe");
    expect(text).toContain("Fale com quem te enviou");
  });

  it("mantém o caso de reserva não encontrada, traduzido e neutro", () => {
    const container = renderAt("/booking/abc");
    expect(container.textContent).toContain("Reserva não encontrada");
    expect(container.innerHTML).not.toMatch(/cal\.com|<a[\s>]/i);
  });
});
