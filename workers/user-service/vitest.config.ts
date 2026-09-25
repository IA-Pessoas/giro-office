import { wasmModule } from "../runtime/src/vitestWasmModule";

export default {
  plugins: [wasmModule()],
  resolve: {
    alias: [
      { find: "@workspace/shared/http", replacement: "../../shared/src/http/index.ts" },
      { find: "@workspace/shared/auth", replacement: "../../shared/src/auth/index.ts" },
      { find: "@workspace/shared/schemas", replacement: "../../shared/src/schemas/index.ts" },
      { find: "@workspace/runtime", replacement: "../runtime/src/index.ts" },
      { find: "@workspace/shared", replacement: "../../shared/src/index.ts" },
      { find: "hono", replacement: "../department-service/node_modules/hono" },
      { find: "zod", replacement: "../department-service/node_modules/zod" },
      {
        find: "@prisma/adapter-pg",
        replacement: "../department-service/node_modules/@prisma/adapter-pg",
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
};
