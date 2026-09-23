import { createTiWorkerApp } from "./app.js";
import type { TiWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: TiWorkerEnv) {
    return createTiWorkerApp({ env }).fetch(request, env);
  },
};
