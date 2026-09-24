import { createRhWorkerApp } from "./app.js";
import type { RhWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: RhWorkerEnv) {
    return createRhWorkerApp({ env }).fetch(request, env);
  },
};
