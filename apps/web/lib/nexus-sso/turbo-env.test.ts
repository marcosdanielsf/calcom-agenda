import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// O servidor de producao sobe pelo turbo, que repassa ao Next so as envs do globalEnv.
// Env do login unico fora dessa lista chega ao container mas nao ao Next, e a rota
// responde 503 sem log (aconteceu em 2026-10-06). Toda NEXUS_* lida aqui tem que estar declarada.
const ROOTS = ["apps/web/lib/nexus-sso", "apps/web/app/api/nexus/sso"];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });
}

describe("envs do login unico no turbo", () => {
  it("toda process.env.NEXUS_* lida pelo login unico esta no globalEnv do turbo.json", () => {
    const used = new Set<string>();
    for (const file of ROOTS.flatMap(sources)) {
      for (const match of Array.from(
        readFileSync(file, "utf8").matchAll(/process\.env\.(NEXUS_[A-Z0-9_]+)/g)
      )) {
        used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    const globalEnv: string[] = JSON.parse(readFileSync("turbo.json", "utf8")).globalEnv;
    expect(Array.from(used).filter((name) => !globalEnv.includes(name))).toEqual([]);
  });
});
