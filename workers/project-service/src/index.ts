import { createProjectWorkerApp } from "./app.js";
import type { ProjectWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: ProjectWorkerEnv) {
    return createProjectWorkerApp({ env }).fetch(request, env);
  },
};
