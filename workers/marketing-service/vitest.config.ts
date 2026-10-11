import { defineConfig } from "vitest/config";
import { wasmModule } from "../runtime/src/vitestWasmModule";

export default defineConfig({
  plugins: [wasmModule()],
  test: { include: ["src/**/*.test.ts"] },
});
