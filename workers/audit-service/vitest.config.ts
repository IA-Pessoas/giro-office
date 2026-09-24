import { wasmModule } from "../runtime/src/vitestWasmModule";

export default {
  plugins: [wasmModule()],
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
};
