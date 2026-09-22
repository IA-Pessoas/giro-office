import { createContabilWorkerApp } from "./app.js";
import type { ContabilWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: ContabilWorkerEnv) {
    return createContabilWorkerApp({ env }).fetch(request, env);
  },
};
