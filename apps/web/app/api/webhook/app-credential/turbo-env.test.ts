import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// O servidor de producao sobe pelo turbo, que repassa ao Next so as envs do globalEnv.
// Env do credential sync fora dessa lista chega ao container mas nao ao Next: o motor deixa de
// aceitar o empurrao do Nexus e de pedir token renovado a ele, sem erro visivel.
const FILES = ["packages/lib/constants.ts", "apps/web/app/api/webhook/app-credential/route.ts"];
const REQUIRED = [
  "CALCOM_CREDENTIAL_SYNC_SECRET",
  "CALCOM_APP_CREDENTIAL_ENCRYPTION_KEY",
  "CALCOM_CREDENTIAL_SYNC_ENDPOINT",
  "CALCOM_CREDENTIAL_SYNC_HEADER_NAME",
];

describe("envs do credential sync no turbo", () => {
  const globalEnv: string[] = JSON.parse(readFileSync("turbo.json", "utf8")).globalEnv;

  it("as quatro envs da ponte estao no globalEnv", () => {
    expect(REQUIRED.filter((name) => !globalEnv.includes(name))).toEqual([]);
  });

  it("toda env de credential sync lida no codigo esta no globalEnv", () => {
    const used = new Set<string>();
    for (const file of FILES) {
      for (const match of Array.from(
        readFileSync(file, "utf8").matchAll(/process\.env\.(CALCOM_(?:CREDENTIAL_SYNC|APP_CREDENTIAL)[A-Z0-9_]*)/g)
      )) {
        used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    expect(Array.from(used).filter((name) => !globalEnv.includes(name))).toEqual([]);
  });
});
