import { contabilTriageReportingCatalog } from "@workspace/shared";

import type { ReportsServiceEnv } from "../config/env.js";
import { ContabilControlAdapter, type ContabilReportingCatalog } from "./contabilControlAdapter.js";

/** Áreas da Triagem servidas pelo contabil-service, liberadas pelo módulo Triagem. */
export class ContabilTriageAdapter extends ContabilControlAdapter {
  constructor(
    env: Pick<
      ReportsServiceEnv,
      "contabilServiceUrl" | "reportsInternalToken" | "reportsGrantSecret" | "sourceTimeoutMs"
    >,
  ) {
    super(env, contabilTriageReportingCatalog as ContabilReportingCatalog);
  }

  override isEnabled(scope: { modules: Readonly<Record<string, number>> }): boolean {
    return (scope.modules.triagem ?? 0) >= 1;
  }
}
