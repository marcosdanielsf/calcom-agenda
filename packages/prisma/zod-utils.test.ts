import { describe, expect, it } from "vitest";
import z from "zod";
import { EventTypeMetaDataSchema, excludeOrRequireEmailSchema } from "./zod-utils";

describe("excludeOrRequireEmailSchema", () => {
  const parse = (input: string) => z.object({ v: excludeOrRequireEmailSchema }).safeParse({ v: input });

  describe("valid inputs", () => {
    it("accepts single TLD domains", () => {
      expect(parse("gmail.com").success).toBe(true);
    });

    it("accepts uppercase domains", () => {
      expect(parse("GMAIL.COM").success).toBe(true);
    });

    it("accepts multi-level TLD domains (co.uk)", () => {
      expect(parse("hotmail.co.uk").success).toBe(true);
    });

    it("accepts multi-level TLD domains (k12.us)", () => {
      expect(parse("mail.school.k12.us").success).toBe(true);
    });

    it("accepts full email addresses", () => {
      expect(parse("user@example.co.uk").success).toBe(true);
    });

    it("accepts @domain format", () => {
      expect(parse("@example.co.uk").success).toBe(true);
    });

    it("accepts multiple comma-separated entries", () => {
      expect(parse("gmail.com, @example.com, user@example.co.uk").success).toBe(true);
    });

    it("accepts domains with trailing comma (ignores empty entry)", () => {
      expect(parse("gmail.com, hotmail.co.uk,").success).toBe(true);
    });

    it("accepts domains with extra spaces", () => {
      expect(parse("  gmail.com  ,  hotmail.co.uk  ").success).toBe(true);
    });

    it("accepts domains with numbers and hyphens", () => {
      expect(parse("example123.com").success).toBe(true);
      expect(parse("my-domain.com").success).toBe(true);
    });

    it("accepts very short domains (min 2-char TLD)", () => {
      expect(parse("a.co").success).toBe(true);
    });

    it("accepts long multi-level domains", () => {
      expect(parse("example.co.uk.test.com").success).toBe(true);
    });

    it("accepts single-label domains and missing dots", () => {
      expect(parse("example").success).toBe(true);
      expect(parse("@example").success).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("rejects invalid TLD lengths", () => {
      expect(parse("example.c").success).toBe(false);
    });

    it("rejects leading/trailing hyphens in labels", () => {
      expect(parse("-bad.com").success).toBe(false);
      expect(parse("bad-.com").success).toBe(false);
    });

    it("rejects leading/trailing dots and consecutive dots", () => {
      expect(parse(".bad.com").success).toBe(false);
      expect(parse("bad.com.").success).toBe(false);
      expect(parse("ex..ample.com").success).toBe(false);
    });

    it("allows empty input but rejects commas-only", () => {
      expect(parse("").success).toBe(true);
      expect(parse("   ").success).toBe(true);
      expect(parse(",,,").success).toBe(false);
    });

    it("rejects Unicode domains (ASCII-only)", () => {
      expect(parse("münchen.de").success).toBe(false);
    });
  });
});

describe("EventTypeMetaDataSchema nexusAppearance", () => {
  it("passa igual quando não há nexusAppearance", () => {
    const result = EventTypeMetaDataSchema.safeParse({ multipleDuration: [15, 30] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ multipleDuration: [15, 30] });
  });

  it("preserva a chave nexusAppearance no parse", () => {
    const nexusAppearance = {
      coverImageUrl: "https://exemplo.com/capa.png",
      primaryColor: "#003ff1",
      backgroundColor: "#0b1220",
      buttonText: "Agendar",
      showTitle: false,
      showDescription: true,
      customCode: "<style>.a{color:red}</style>",
    };
    const result = EventTypeMetaDataSchema.safeParse({ multipleDuration: [30], nexusAppearance });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data?.nexusAppearance).toEqual(nexusAppearance);
  });

  it("falha quando o customCode tem script", () => {
    const result = EventTypeMetaDataSchema.safeParse({
      nexusAppearance: { customCode: "<script>alert(1)</script>" },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("nexus_custom_code_script_not_allowed");
  });

  it("recusa cor que não é hex", () => {
    expect(EventTypeMetaDataSchema.safeParse({ nexusAppearance: { primaryColor: "azul" } }).success).toBe(
      false
    );
  });
});
