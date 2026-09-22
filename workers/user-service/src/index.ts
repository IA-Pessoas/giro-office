import { createUserWorkerApp } from "./app.js";
import type { UserWorkerEnv } from "./env.js";

export { createUserWorkerApp } from "./app.js";
export type { UserWorkerEnv } from "./env.js";

export default {
  async fetch(request: Request, env: UserWorkerEnv): Promise<Response> {
    return createUserWorkerApp({ env }).fetch(request, env);
  },
};
