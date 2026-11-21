import { describe, expect, it } from "vitest";

import { bookingMetadataFromSearch } from "./bookingMetadata";

describe("bookingMetadataFromSearch", () => {
  it("preserva nexusLocationRef pelo metadata nativo do Booker", () => {
    const params = new URLSearchParams({
      "metadata[nexusLocationRef]": "a".repeat(32),
      "metadata[campaign]": "clinic-a",
      "metadata[custom key/legacy]": "preservada",
    });

    expect(bookingMetadataFromSearch([...params.keys()], params)).toEqual({
      nexusLocationRef: "a".repeat(32),
      campaign: "clinic-a",
      "custom key/legacy": "preservada",
    });
  });

  it("ignora formas parecidas que nao sao metadata nativo", () => {
    const params = new URLSearchParams({
      metadatax: "forjada",
      "metadata[nexusLocationRef": "aberta",
    });

    expect(bookingMetadataFromSearch([...params.keys()], params)).toEqual({});
  });

  it("tolera searchParams ainda indisponivel", () => {
    expect(
      bookingMetadataFromSearch(["metadata[nexusLocationRef]"], null)
    ).toEqual({});
  });
});
