import assert from "node:assert/strict";
import { test } from "node:test";

import { getClientIntegrationReportingFields } from "../src/reporting/clientIntegrationReportingCatalog.js";

test("clients report publishes CPF/CNPJ", () => {
  assert.ok(getClientIntegrationReportingFields("integracao.clients").includes("cpf_cnpj"));
});

test("group reporting publishes group dimensions on persisted client memberships", () => {
  assert.deepEqual(getClientIntegrationReportingFields("integracao.client_groups"), [
    "client_id",
    "group_id",
    "group_name",
    "name",
    "company_name",
    "fantasy_name",
    "cpf_cnpj",
    "status",
    "type",
    "city",
    "state",
    "segment",
    "regime",
  ]);
});
