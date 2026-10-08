import { defineConfig } from "vitest/config";
import { wasmModule } from "../runtime/src/vitestWasmModule";

export default defineConfig({
  plugins: [wasmModule()],
  test: { environment: "node", testTimeout: 30_000, hookTimeout: 30_000 },
});
