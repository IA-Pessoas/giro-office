import { createTriagemWorkerApp } from "./app.js";
import type { TriagemWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: TriagemWorkerEnv) {
    return createTriagemWorkerApp({ env }).fetch(request, env);
  },
};
