import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface PessoalWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  PESSOAL_PASSWORD_ENCRYPTION_KEY?: string;
  PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION?: string;
  AUDIT_SERVICE?: ServiceBinding;
  /** Rotas /internal/reporting/* chamadas pelo reports-service. Sem eles: 503. */
  REPORTS_INTERNAL_TOKEN?: string;
  REPORTS_GRANT_SECRET?: string;
}
