import { describe, expect, it } from "vitest";
import { withProfileUsernamePlusHostname } from "./profileUrlHint";

describe("withProfileUsernamePlusHostname", () => {
  it("troca o hostname de exemplo pelo dominio publico configurado", () => {
    expect(
      withProfileUsernamePlusHostname(
        "Dica: use cal.diy/anna+brian para uma reuniao de grupo.",
        "https://agenda.socialfy.me"
      )
    ).toBe("Dica: use agenda.socialfy.me/anna+brian para uma reuniao de grupo.");
  });
});
