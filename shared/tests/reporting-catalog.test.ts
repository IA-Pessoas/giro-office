import assert from "node:assert/strict";
import { test } from "node:test";

import { getClientIntegrationReportingFields } from "../src/reporting/clientIntegrationReportingCatalog.js";

test("clients report publishes CPF/CNPJ", () => {
  assert.ok(getClientIntegrationReportingFields("integracao.clients").includes("cpf_cnpj"));
});
