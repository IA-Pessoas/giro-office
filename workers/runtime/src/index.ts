export { createWorkerApp } from "./app.js";
export type { HyperdriveBinding, ServiceBinding, WorkerBindings, WorkerEnv } from "./env.js";
export { verifyHs256Jwt } from "./jwt.js";
export {
  createWorkerPrismaClient,
  type WorkerPrismaClient,
  type WorkerPrismaClientConstructor,
  withWorkerPrisma,
} from "./prisma.js";
export {
  AUTH_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  createCsrfToken,
  createExpiredSessionCookieHeaders,
  createSessionCookieHeaders,
  hashCsrfToken,
  readCookie,
  SESSION_MAX_AGE_SECONDS,
  type SessionCookieOptions,
  stripBrowserAuth,
  verifyCsrfToken,
} from "./session.js";
export {
  createSupabaseStorageClient,
  type SupabaseStorageClient,
  type SupabaseStorageEnvironment,
  type SupabaseStorageUploadOptions,
} from "./storage.js";

import type { ServiceBinding, WorkerEnv } from "./env.js";

type ServiceBindingName<Bindings extends WorkerEnv> = {
  [Key in keyof Bindings]-?: Bindings[Key] extends ServiceBinding ? Key : never;
}[keyof Bindings] &
  string;

export function forwardToService<
  Bindings extends WorkerEnv,
  ServiceName extends ServiceBindingName<Bindings>,
>(bindings: Bindings, serviceName: ServiceName, request: Request): Promise<Response> {
  return (bindings[serviceName] as ServiceBinding).fetch(request);
}
