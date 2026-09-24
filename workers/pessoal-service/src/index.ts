import { createPessoalWorkerApp } from "./app.js";
import type { PessoalWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: PessoalWorkerEnv) {
    return createPessoalWorkerApp({ env }).fetch(request, env);
  },
};
