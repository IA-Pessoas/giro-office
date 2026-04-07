import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["src/**/*.spec.ts", "src/__tests__/**/*.ts"],
    globals: false,
  },
});
