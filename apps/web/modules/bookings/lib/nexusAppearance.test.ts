import { describe, expect, it } from "vitest";
import { getNexusAppearance, sanitizeNexusHtml, validNexusHex } from "./nexusAppearance";

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

describe("getNexusAppearance com valor corrompido", () => {
  it("troca cor inválida e código com script por null e não lança", () => {
    expect(
      getNexusAppearance({
        nexusAppearance: { primaryColor: "red;}</style><script>", customCode: "<script>1</script>" },
      })
    ).toEqual({ primaryColor: null, customCode: null });
  });

  it("devolve undefined quando nexusAppearance não é objeto", () => {
    expect(getNexusAppearance({ nexusAppearance: "x" })).toBeUndefined();
  });
});

describe("validNexusHex", () => {
  it("aceita hex de 3 e 6 dígitos e recusa o resto", () => {
    expect(validNexusHex("#003ff1")).toBe("#003ff1");
    expect(validNexusHex("#abc")).toBe("#abc");
    expect(validNexusHex("red")).toBeNull();
    expect(validNexusHex("#12345")).toBeNull();
    expect(validNexusHex("#fff;}</style>")).toBeNull();
    expect(validNexusHex(null)).toBeNull();
    expect(validNexusHex(undefined)).toBeNull();
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
