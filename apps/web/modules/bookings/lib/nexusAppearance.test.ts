import { describe, expect, it } from "vitest";
import { getNexusAppearance, sanitizeNexusHtml } from "./nexusAppearance";

describe("getNexusAppearance", () => {
  it("devolve undefined sem a chave", () => {
    expect(getNexusAppearance({ multipleDuration: [30] })).toBeUndefined();
    expect(getNexusAppearance(null)).toBeUndefined();
  });

  it("devolve a aparência quando existe", () => {
    expect(getNexusAppearance({ nexusAppearance: { buttonText: "Agendar" } })).toEqual({
      buttonText: "Agendar",
    });
  });
});

describe("sanitizeNexusHtml", () => {
  it("remove script, iframe, form e atributos on*", () => {
    const out = sanitizeNexusHtml(
      '<p onclick="x()">oi</p><script>1</script><iframe src="x"></iframe><form><input></form><a href="javascript:alert(1)">a</a>'
    );
    expect(out).toContain("<p>oi</p>");
    expect(out).not.toMatch(/script|iframe|<form|onclick|javascript:/i);
  });

  it("mantém HTML simples", () => {
    expect(sanitizeNexusHtml('<p class="x">Olá <b>mundo</b></p>')).toBe('<p class="x">Olá <b>mundo</b></p>');
  });
});
