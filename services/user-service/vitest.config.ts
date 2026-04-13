import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["src/**/*.spec.ts"],
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
