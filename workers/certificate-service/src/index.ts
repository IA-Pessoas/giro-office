import { createCertificateWorkerApp, runScheduledCertificateNotifications } from "./app.js";
import type { CertificateWorkerEnv } from "./env.js";

export { createCertificateWorkerApp } from "./app.js";
export type { CertificateWorkerEnv } from "./env.js";

type ScheduledContext = { waitUntil(promise: Promise<unknown>): void };

export default {
  async fetch(request: Request, env: CertificateWorkerEnv): Promise<Response> {
    return createCertificateWorkerApp({ env }).fetch(request, env);
  },
  scheduled(_event: unknown, env: CertificateWorkerEnv, context: ScheduledContext) {
    context.waitUntil(runScheduledCertificateNotifications({ env }));
  },
};
