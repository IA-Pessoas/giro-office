import { wasmModule } from "../runtime/src/vitestWasmModule";

export default { plugins: [wasmModule()] };
