import { createLogger } from "@workspace/shared/logger";
import { createTaskApp } from "@workspace/task-service/src/app.js";
import { getTaskServiceEnv } from "./shims/env.js";

let app: ReturnType<typeof createTaskApp> | undefined;

/**
 * O app Express do task-service Node, sem porte: as 55 rotas, validação e erros são
 * os mesmos. Montado na primeira requisição (precisa do env dela) e reaproveitado no
 * isolate; secrets só mudam com novo deploy, que recria o isolate.
 */
export function getTaskApp(): ReturnType<typeof createTaskApp> {
  if (!app) {
    const env = getTaskServiceEnv();
    app = createTaskApp(
      env,
      createLogger({
        service: "task-service",
        env: env.nodeEnv,
        level: env.logLevel,
        pretty: false,
      }),
    );
  }
  return app;
}
