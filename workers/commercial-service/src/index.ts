import { createCommercialWorkerApp } from "./app.js";
import type { CommercialWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: CommercialWorkerEnv) {
    return createCommercialWorkerApp({ env }).fetch(request, env);
  },
};
