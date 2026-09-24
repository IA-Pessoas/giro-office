import { createFiscalWorkerApp } from "./app.js";

export { createFiscalWorkerApp } from "./app.js";
export type { FiscalWorkerEnv } from "./env.js";

export default {
  async fetch(request: Request, env: import("./env.js").FiscalWorkerEnv): Promise<Response> {
    return createFiscalWorkerApp({ env }).fetch(request, env);
  },
};
