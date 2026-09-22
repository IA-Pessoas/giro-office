import { createTaskWorkerApp } from "./app.js";

// Uma app por isolate: o rate limit em memória precisa sobreviver entre requisições.
const app = createTaskWorkerApp();

export default { fetch: app.fetch };
