import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const shim = (name: string) => fileURLToPath(new URL(`./src/shims/${name}.ts`, import.meta.url));

/** Mesmas trocas do `alias` do wrangler.jsonc: o app Node roda com os módulos do Worker. */
export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: [
      { find: /^\.\.?\/prisma\/index\.js$/, replacement: shim("prisma") },
      { find: /^\.\.\/config\/env\.js$/, replacement: shim("env") },
      { find: /^\.\.\/middlewares\/isAuthenticated\.js$/, replacement: shim("isAuthenticated") },
      { find: /^\.\.\/integrations\/audit\.js$/, replacement: shim("audit") },
      { find: /^\.\.\/integrations\/projectProgress\.js$/, replacement: shim("projectProgress") },
    ],
  },
});
