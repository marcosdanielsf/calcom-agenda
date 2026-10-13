import { describe, expect, it } from "vitest";
import { escapeCssForStyleTag, splitNexusCustomCode, validateNexusCustomCode } from "./nexus-custom-code";

describe("validateNexusCustomCode", () => {
  it.each([
    "<script>alert(1)</script>",
    "<SCRIPT src=x></SCRIPT>",
    "<  script>alert(1)</script>",
    "<\tscript>alert(1)</script>",
    "<ScRiPt\n>alert(1)</script>",
  ])("recusa script em %j", (code) => {
    expect(validateNexusCustomCode(code)).toEqual({ ok: false, reason: "script" });
  });

  it("recusa atributo on*", () => {
    expect(validateNexusCustomCode("<img src=x onerror=alert(1)>")).toEqual({ ok: false, reason: "script" });
    expect(validateNexusCustomCode('<a onclick = "x()">a</a>')).toEqual({ ok: false, reason: "script" });
  });

  it("recusa javascript:", () => {
    expect(validateNexusCustomCode('<a href="JavaScript:alert(1)">a</a>')).toEqual({
      ok: false,
      reason: "script",
    });
  });

  it.each([
    "<iframe src=x>",
    "<object data=x>",
    "<embed src=x>",
    "<base href=x>",
    "<meta http-equiv=refresh>",
  ])("recusa %s", (code) => {
    expect(validateNexusCustomCode(code)).toEqual({ ok: false, reason: "script" });
  });

  it("aceita CSS puro e HTML simples", () => {
    expect(validateNexusCustomCode("<style>[data-nexus='cta']{background:#003ff1}</style>")).toEqual({
      ok: true,
    });
    expect(validateNexusCustomCode('<p class="x">Olá <b>mundo</b></p>')).toEqual({ ok: true });
    expect(validateNexusCustomCode("")).toEqual({ ok: true });
  });
});

describe("splitNexusCustomCode", () => {
  it("separa CSS dos blocos style e devolve o resto como HTML sem comentários", () => {
    const code = "<style>.a{color:red}</style><!-- nota --><p>oi</p><STYLE media='x'>.b{color:blue}</STYLE>";
    expect(splitNexusCustomCode(code)).toEqual({ css: ".a{color:red}\n.b{color:blue}", html: "<p>oi</p>" });
  });

  it("devolve vazio quando não há nada", () => {
    expect(splitNexusCustomCode("")).toEqual({ css: "", html: "" });
  });
});

describe("escapeCssForStyleTag", () => {
  it("neutraliza o fechamento da tag style e comentário HTML", () => {
    const out = escapeCssForStyleTag("a{}</style><script>x</script><!-- y");
    expect(out.toLowerCase()).not.toContain("</style");
    expect(out).not.toContain("<!--");
    expect(out).not.toContain("<script");
  });

  it("não altera CSS comum", () => {
    expect(escapeCssForStyleTag(".a > .b{color:red}")).toBe(".a > .b{color:red}");
  });
});
