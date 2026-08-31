import { contabilResponsiblesReportingCatalog } from "@workspace/shared";

import type { ReportsServiceEnv } from "../config/env.js";
import { ContabilControlAdapter, type ContabilReportingCatalog } from "./contabilControlAdapter.js";

export class ContabilResponsiblesAdapter extends ContabilControlAdapter {
  constructor(
    env: Pick<
      ReportsServiceEnv,
      "contabilServiceUrl" | "reportsInternalToken" | "reportsGrantSecret" | "sourceTimeoutMs"
    >,
  ) {
    super(env, contabilResponsiblesReportingCatalog as ContabilReportingCatalog);
  }
}
