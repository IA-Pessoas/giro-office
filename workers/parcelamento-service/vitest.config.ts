import { wasmModule } from "../runtime/src/vitestWasmModule";

export default {
  plugins: [wasmModule()],
  resolve: {
    alias: [
      { find: "@workspace/shared/http", replacement: "../../shared/src/http/index.ts" },
      { find: "@workspace/shared/auth", replacement: "../../shared/src/auth/index.ts" },
      { find: "@workspace/shared", replacement: "../../shared/src/index.ts" },
      { find: "@workspace/runtime", replacement: "../runtime/src/index.ts" },
      {
        find: /^@workspace\/parcelamento-service\/(.*)$/,
        replacement: "../../services/parcelamento-service/$1",
      },
      { find: "hono", replacement: "../department-service/node_modules/hono" },
      { find: "zod", replacement: "../department-service/node_modules/zod" },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
  },
};
