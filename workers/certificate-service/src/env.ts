import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface CertificateWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  CERTIFICATE_PASSWORD_ENCRYPTION_KEY: string;
  CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION?: string;
  AUDIT_SERVICE?: ServiceBinding;
}
