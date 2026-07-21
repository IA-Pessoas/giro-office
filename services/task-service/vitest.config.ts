import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["src/**/*.test.ts"],
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
