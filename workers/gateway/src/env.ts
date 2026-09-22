import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface GatewayWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUDIT_SERVICE?: ServiceBinding;
  DEPARTMENT_SERVICE?: ServiceBinding;
  ORGANIZATION_SERVICE?: ServiceBinding;
  USER_SERVICE?: ServiceBinding;
  CLIENT_SERVICE?: ServiceBinding;
  FISCAL_SERVICE?: ServiceBinding;
  CERTIFICATE_SERVICE?: ServiceBinding;
  REPORTS_SERVICE?: ServiceBinding;
  PARCELAMENTO_SERVICE?: ServiceBinding;
  CONTABIL_SERVICE?: ServiceBinding;
  PROJECT_SERVICE?: ServiceBinding;
  TI_SERVICE?: ServiceBinding;
  RH_SERVICE?: ServiceBinding;
  COMMERCIAL_SERVICE?: ServiceBinding;
  TRIAGEM_SERVICE?: ServiceBinding;
  PESSOAL_SERVICE?: ServiceBinding;
  REGULARIZE_SERVICE?: ServiceBinding;
}
