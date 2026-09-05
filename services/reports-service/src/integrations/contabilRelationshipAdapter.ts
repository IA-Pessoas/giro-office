import { contabilRelationshipReportingCatalog } from "@workspace/shared";

import type { ReportsServiceEnv } from "../config/env.js";
import { ContabilControlAdapter, type ContabilReportingCatalog } from "./contabilControlAdapter.js";

export class ContabilRelationshipAdapter extends ContabilControlAdapter {
  constructor(
    env: Pick<
      ReportsServiceEnv,
      "contabilServiceUrl" | "reportsInternalToken" | "reportsGrantSecret" | "sourceTimeoutMs"
    >,
  ) {
    super(env, contabilRelationshipReportingCatalog as ContabilReportingCatalog);
  }
}
