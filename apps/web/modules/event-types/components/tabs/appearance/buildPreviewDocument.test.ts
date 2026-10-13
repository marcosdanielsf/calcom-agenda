import { describe, expect, it } from "vitest";
import { buildPreviewDocument } from "./buildPreviewDocument";

const base = { title: "Sessão", durationLabel: "30 min", buttonLabel: "Confirmar" };

describe("buildPreviewDocument", () => {
  it("aplica cores, capa e texto do botão", () => {
    const doc = buildPreviewDocument({
      ...base,
      appearance: {
        primaryColor: "#003ff1",
        backgroundColor: "#0b1220",
        coverImageUrl: "https://exemplo.com/capa.png",
        buttonText: "Agendar",
      },
    });
    expect(doc).toContain("#003ff1");
    expect(doc).toContain("#0b1220");
    expect(doc).toContain('src="https://exemplo.com/capa.png"');
    expect(doc).toContain(">Agendar<");
    expect(doc).toContain('data-nexus="cta"');
  });

  it("usa o texto padrão do botão e esconde título e descrição quando desligados", () => {
    const doc = buildPreviewDocument({ ...base, appearance: { showTitle: false } });
    expect(doc).toContain(">Confirmar<");
    expect(doc).not.toContain('data-nexus="event-title"');
  });

  it("escapa o título e neutraliza o fechamento de style no CSS", () => {
    const doc = buildPreviewDocument({
      ...base,
      title: "<img src=x onerror=alert(1)>",
      appearance: { customCode: "<style>a{}</style></style><p>oi</p>" },
    });
    expect(doc).not.toContain("<img src=x");
    expect(doc).toContain("<p>oi</p>");
  });

  it("não deixa script passar mesmo que cheguem dados sem validar", () => {
    const doc = buildPreviewDocument({
      ...base,
      appearance: { customCode: "<p>a</p><script>alert(1)</script>" },
    });
    expect(doc).not.toMatch(/<script/i);
  });
});
