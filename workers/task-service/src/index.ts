import { createTaskWorkerApp } from "./app.js";
import type { TaskWorkerEnv } from "./env.js";

export default {
  fetch(request: Request, env: TaskWorkerEnv) {
    return createTaskWorkerApp({ env }).fetch(request, env);
  },
};
