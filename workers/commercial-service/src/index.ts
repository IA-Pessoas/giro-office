import { withWorkerPrisma } from "@workspace/runtime";
import { createCommercialWorkerApp } from "./app.js";
import {
  CommercialEmailNotificationService,
  createCommercialEmailAdapter,
} from "./commercialEmail.js";
import { createCommercialAudit } from "./commercialService.js";
import type { CommercialWorkerEnv } from "./env.js";
import { CommercialOutboxWorkerService } from "./outbox.js";
import { CommercialOutboxBindingDelivery } from "./outboxDelivery.js";
import { PrismaClient } from "./prisma.js";

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

function assertScheduledDependencies(env: CommercialWorkerEnv): void {
  if (!env.HYPERDRIVE?.connectionString && !env.DATABASE_URL) {
    throw new Error("Commercial outbox scheduler requer HYPERDRIVE ou DATABASE_URL.");
  }
  if (!env.INTERNAL_REQUEST_ORIGIN) {
    throw new Error("Commercial outbox scheduler requer INTERNAL_REQUEST_ORIGIN.");
  }
  if (!env.CLIENT_SERVICE || !env.CLIENT_SERVICE_INTERNAL_TOKEN) {
    throw new Error("Commercial outbox scheduler requer binding/token do client-service.");
  }
  if (!env.TASK_SERVICE || !env.TASK_SERVICE_INTERNAL_TOKEN) {
    throw new Error("Commercial outbox scheduler requer binding/token do task-service.");
  }
}

export default {
  fetch(request: Request, env: CommercialWorkerEnv) {
    return createCommercialWorkerApp({ env }).fetch(request, env);
  },
  scheduled(_event: unknown, env: CommercialWorkerEnv, context: ScheduledContext) {
    assertScheduledDependencies(env);
    context.waitUntil(
      withWorkerPrisma(env, PrismaClient, async (prisma) => {
        const audit = createCommercialAudit(env, env.INTERNAL_REQUEST_ORIGIN as string);
        const worker = new CommercialOutboxWorkerService(
          prisma as never,
          new CommercialOutboxBindingDelivery(
            env,
            new CommercialEmailNotificationService(
              prisma as never,
              createCommercialEmailAdapter(env),
              audit,
            ),
          ),
        );
        await worker.processNext();
      }),
    );
  },
};
