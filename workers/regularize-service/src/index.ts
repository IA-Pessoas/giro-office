import { createRegularizeWorkerApp } from "./app.js";
import type { RegularizeWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: RegularizeWorkerEnv) {
    return createRegularizeWorkerApp({ env }).fetch(request, env);
  },
};
