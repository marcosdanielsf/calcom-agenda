// Criado: 2026-10-05 23:36 BRT. Suite isolada de apresentacao, sem banco ou rede.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "https://agenda.socialfy.me" } },
    include: ["apps/web/modules/shell/Shell.nexus.test.tsx"],
    passWithNoTests: false,
  },
});
