import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["packages/lib/nexus-booking/*.test.ts"] } });
