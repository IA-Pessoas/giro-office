export { createClientWorkerApp } from "./app.js";
export type { ClientWorkerEnv } from "./env.js";

import { createClientWorkerApp } from "./app.js";

export default {
  async fetch(request: Request, env: import("./env.js").ClientWorkerEnv): Promise<Response> {
    return await createClientWorkerApp({ env }).fetch(request, env);
  },
};
