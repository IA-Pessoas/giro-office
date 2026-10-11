import { contabilDocumentsReportingCatalog } from "@workspace/shared";

import type { ReportsServiceEnv } from "../config/env.js";
import { ContabilControlAdapter, type ContabilReportingCatalog } from "./contabilControlAdapter.js";

/** Documentos Contábeis por cliente e período: o checklist da Triagem, liberado pelo Contábil. */
export class ContabilDocumentsAdapter extends ContabilControlAdapter {
  constructor(
    env: Pick<
      ReportsServiceEnv,
      "contabilServiceUrl" | "reportsInternalToken" | "reportsGrantSecret" | "sourceTimeoutMs"
    >,
  ) {
    super(env, contabilDocumentsReportingCatalog as ContabilReportingCatalog);
  }
}
