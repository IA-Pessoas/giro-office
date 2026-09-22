import { withWorkerPrisma } from "@workspace/runtime";
import { createCommercialWorkerApp } from "./app.js";
import type { CommercialWorkerEnv } from "./env.js";
import { CommercialOutboxWorkerService } from "./outbox.js";
import { CommercialOutboxBindingDelivery } from "./outboxDelivery.js";
import { PrismaClient } from "./prisma.js";

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  fetch(request: Request, env: CommercialWorkerEnv) {
    return createCommercialWorkerApp({ env }).fetch(request, env);
  },
  scheduled(_event: unknown, env: CommercialWorkerEnv, context: ScheduledContext) {
    context.waitUntil(
      withWorkerPrisma(env, PrismaClient, async (prisma) => {
        const worker = new CommercialOutboxWorkerService(
          prisma as never,
          new CommercialOutboxBindingDelivery(env),
        );
        await worker.processNext();
      }),
    );
  },
};
