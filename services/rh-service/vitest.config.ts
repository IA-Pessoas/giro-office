import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runner do CI tem 2 vCPUs: o primeiro teste que monta o app paga o cold start
    // do esbuild e estoura o default de 5s do Vitest sob paralelismo.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    environment: "node",
    globals: false,
    pool: "forks",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
