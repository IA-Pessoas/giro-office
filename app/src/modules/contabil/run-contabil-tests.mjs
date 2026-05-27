import assert from "node:assert/strict";

import {
  buildContabilControlParams,
  CONTABIL_ENDPOINTS,
  executeNullableContabilRequest,
  isNotFoundError,
  unwrapContabilEnvelope,
} from "./services/contabilService.contract.ts";
import {
  contabilControlQueryKey,
  contabilRelationshipQueryKey,
  contabilResponsibleQueryKey,
  CONTABIL_QUERY_KEY,
} from "./hooks/queryKeys.ts";
import { getContabilErrorMessage } from "./services/contabilError.ts";
import { resolveContabilPermissionAccess } from "./hooks/contabilPermissionAccess.ts";
import {
  CONTABIL_CONTROL_CHECKLIST_FIELDS,
  CONTABIL_CONTROL_FIELDS,
  CONTABIL_CONTROL_NOTES_FIELD,
} from "./components/contabilControlFields.ts";
import {
  applyLocalContabilFieldValue,
  createContabilFieldStatusMap,
  getCurrentContabilCompetence,
  rollbackContabilFieldValue,
  updateContabilControlFieldStatus,
} from "./components/contabilControlSection.helpers.ts";

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await (async () => {
  await runTest("contabil endpoints use the expected contract", () => {
    assert.equal(CONTABIL_ENDPOINTS.controls, "/contabil/controls");
    assert.equal(CONTABIL_ENDPOINTS.controlById("10"), "/contabil/controls/10");
    assert.equal(
      CONTABIL_ENDPOINTS.responsibleByClient("20"),
      "/contabil/responsibles/client/20",
    );
    assert.equal(
      CONTABIL_ENDPOINTS.relationshipByClient("30"),
      "/contabil/relationships/client/30",
    );
  });

  await runTest("buildContabilControlParams maps clientId and competence to API params", () => {
    assert.deepEqual(
      buildContabilControlParams({
        clientId: "client-1",
        competence: "2026-05",
      }),
      {
        client_id: "client-1",
        competence: "2026-05",
      },
    );
  });

  await runTest("unwrapContabilEnvelope extracts data directly from the backend response", () => {
    const payload = {
      id: "control-1",
      client_id: "client-1",
      competence: "2026-05",
      notes: null,
    };

    assert.deepEqual(unwrapContabilEnvelope({ data: payload }), payload);
    assert.deepEqual(unwrapContabilEnvelope(payload), payload);
  });

  await runTest("control field registry matches the backend-updatable fields", () => {
    assert.equal(CONTABIL_CONTROL_FIELDS.length, 18);
    assert.equal(CONTABIL_CONTROL_CHECKLIST_FIELDS.length, 17);
    assert.equal(CONTABIL_CONTROL_NOTES_FIELD?.field, "notes");
    assert.deepEqual(
      CONTABIL_CONTROL_CHECKLIST_FIELDS.map((field) => field.field),
      [
        "regenerate_accounting_entries",
        "check_summary_by_accumulator",
        "post_accounting_transaction",
        "import_bank_statements",
        "reconcile_bank_statements",
        "reconcile_vendors",
        "integrate_taxes",
        "settle_federal_taxes_via_ecac",
        "settle_state_taxes_via_sefaz_ba",
        "integrate_payroll",
        "suspense_accounts",
        "check_overdrawn_accounts",
        "general_account_reconciliation",
        "check_loan_and_interest_accounts",
        "monthly_closing",
        "reconcile_icms_pis_cofins",
        "depreciation",
      ],
    );
  });

  await runTest("getCurrentContabilCompetence formats the current month as YYYY-MM", () => {
    assert.equal(getCurrentContabilCompetence(new Date("2026-05-20T12:00:00.000Z")), "2026-05");
    assert.equal(getCurrentContabilCompetence(new Date(2026, 10, 1, 12, 0, 0)), "2026-11");
  });

  await runTest("field status helpers start idle and update individual fields", () => {
    const initialStatusMap = createContabilFieldStatusMap(CONTABIL_CONTROL_FIELDS);

    assert.equal(initialStatusMap.notes, "idle");
    assert.equal(initialStatusMap.regenerate_accounting_entries, "idle");

    const updatedStatusMap = updateContabilControlFieldStatus(
      initialStatusMap,
      "regenerate_accounting_entries",
      "saving",
    );

    assert.equal(updatedStatusMap.regenerate_accounting_entries, "saving");
    assert.equal(updatedStatusMap.notes, "idle");
  });

  await runTest("control field helpers apply local updates and rollback checklist values", () => {
    const baseControl = {
      id: "control-1",
      client_id: "client-1",
      competence: "2026-05",
      regenerate_accounting_entries: false,
      check_summary_by_accumulator: false,
      post_accounting_transaction: false,
      import_bank_statements: false,
      reconcile_bank_statements: false,
      reconcile_vendors: false,
      integrate_taxes: false,
      settle_federal_taxes_via_ecac: false,
      settle_state_taxes_via_sefaz_ba: false,
      integrate_payroll: false,
      suspense_accounts: false,
      check_overdrawn_accounts: false,
      general_account_reconciliation: false,
      check_loan_and_interest_accounts: false,
      monthly_closing: false,
      reconcile_icms_pis_cofins: false,
      depreciation: false,
      notes: "",
    };

    const locallyUpdated = applyLocalContabilFieldValue(
      baseControl,
      "regenerate_accounting_entries",
      true,
    );
    assert.equal(locallyUpdated.regenerate_accounting_entries, true);

    const notesUpdated = applyLocalContabilFieldValue(baseControl, "notes", "Fechamento iniciado");
    assert.equal(notesUpdated.notes, "Fechamento iniciado");

    const rolledBack = rollbackContabilFieldValue(
      locallyUpdated,
      baseControl,
      "regenerate_accounting_entries",
    );
    assert.equal(rolledBack.regenerate_accounting_entries, false);
  });

  await runTest("executeNullableContabilRequest returns null on 404 responses", async () => {
    const result = await executeNullableContabilRequest(() =>
      Promise.reject({
        isAxiosError: true,
        response: {
          status: 404,
        },
      }),
    );

    assert.equal(result, null);
  });

  await runTest("executeNullableContabilRequest rethrows non-404 errors", async () => {
    const failure = {
      isAxiosError: true,
      response: {
        status: 500,
      },
    };

    await assert.rejects(() => executeNullableContabilRequest(() => Promise.reject(failure)));
  });

  await runTest("isNotFoundError only recognizes axios 404 responses", () => {
    assert.equal(
      isNotFoundError({
        isAxiosError: true,
        response: {
          status: 404,
        },
      }),
      true,
    );
    assert.equal(
      isNotFoundError({
        isAxiosError: true,
        response: {
          status: 400,
        },
      }),
      false,
    );
    assert.equal(isNotFoundError(new Error("boom")), false);
  });

  await runTest("contabil query keys vary by client and competence", () => {
    assert.deepEqual(CONTABIL_QUERY_KEY, ["contabil"]);
    assert.deepEqual(contabilControlQueryKey("client-1", "2026-05"), [
      "contabil",
      "control",
      "client-1",
      "2026-05",
    ]);
    assert.deepEqual(contabilResponsibleQueryKey("client-1"), [
      "contabil",
      "responsible",
      "client-1",
    ]);
    assert.deepEqual(contabilRelationshipQueryKey("client-1"), [
      "contabil",
      "relationship",
      "client-1",
    ]);
  });

  await runTest("resolveContabilPermissionAccess blocks normal users without contabil permission", () => {
    assert.deepEqual(resolveContabilPermissionAccess(null, 1), {
      canViewContabil: false,
      canEditContabil: false,
      isReadOnlyContabil: false,
    });
  });

  await runTest("resolveContabilPermissionAccess enables read-only mode for contabil viewer", () => {
    assert.deepEqual(resolveContabilPermissionAccess(0, 1), {
      canViewContabil: true,
      canEditContabil: false,
      isReadOnlyContabil: true,
    });
  });

  await runTest("resolveContabilPermissionAccess enables edit mode for contabil users", () => {
    assert.deepEqual(resolveContabilPermissionAccess(1, 1), {
      canViewContabil: true,
      canEditContabil: true,
      isReadOnlyContabil: false,
    });
  });

  await runTest("resolveContabilPermissionAccess always unlocks global admins", () => {
    assert.deepEqual(resolveContabilPermissionAccess(null, 2), {
      canViewContabil: true,
      canEditContabil: true,
      isReadOnlyContabil: false,
    });
  });

  await runTest("getContabilErrorMessage prefers backend error strings and falls back otherwise", () => {
    assert.equal(
      getContabilErrorMessage({
        isAxiosError: true,
        response: {
          data: {
            error: "Mensagem do backend",
          },
        },
      }),
      "Mensagem do backend",
    );

    assert.equal(
      getContabilErrorMessage(new Error("boom")),
      "N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o cont\u00e1bil agora. Tente novamente em instantes.",
    );
  });
})();
