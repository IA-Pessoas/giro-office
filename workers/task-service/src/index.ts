import { httpServerHandler } from "cloudflare:node";
import { createWorkerPrismaClient } from "@workspace/runtime";
import { PrismaClient } from "@workspace/task-service/src/generated/prisma/client.js";
import { getTaskApp } from "./app.js";
import { runInTaskContext } from "./context.js";
import type { TaskWorkerEnv } from "./env.js";

const PORT = 3032;
const handler = httpServerHandler({ port: PORT });
let listening = false;

export default {
  fetch(request: Request, env: TaskWorkerEnv, ctx: unknown) {
    return runInTaskContext(
      { env, createPrisma: () => createWorkerPrismaClient(env, PrismaClient) },
      () => {
        if (!listening) {
          getTaskApp().listen(PORT);
          listening = true;
        }
        return handler.fetch(request, env, ctx);
      },
    );
  },
};
