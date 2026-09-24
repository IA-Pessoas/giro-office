import { createParcelamentoWorkerApp } from "./app.js";

export { createParcelamentoWorkerApp } from "./app.js";
export type { ParcelamentoWorkerEnv } from "./env.js";

export default {
  async fetch(request: Request, env: import("./env.js").ParcelamentoWorkerEnv): Promise<Response> {
    return createParcelamentoWorkerApp({ env }).fetch(request, env);
  },
};
