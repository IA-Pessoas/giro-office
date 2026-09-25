import { createCertificateWorkerApp, runScheduledCertificateNotifications } from "./app.js";

export { createCertificateWorkerApp } from "./app.js";
export type { CertificateWorkerEnv } from "./env.js";

export default {
  async fetch(request: Request, env: import("./env.js").CertificateWorkerEnv): Promise<Response> {
    return createCertificateWorkerApp({ env }).fetch(request, env);
  },
  scheduled(
    _event: unknown,
    env: import("./env.js").CertificateWorkerEnv,
    context: { waitUntil(promise: Promise<unknown>): void },
  ) {
    context.waitUntil(runScheduledCertificateNotifications({ env }));
  },
};
