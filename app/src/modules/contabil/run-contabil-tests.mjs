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
  resolveDepartmentModuleKey,
  resolveModuleAccess,
} from "../auth/utils/moduleAccess.ts";
import {
  CONTABIL_CONTROL_CHECKLIST_FIELDS,
  CONTABIL_CONTROL_FIELDS,
  CONTABIL_CONTROL_NOTES_FIELD,
} from "./components/contabilControlFields.ts";
import { CONTABIL_RELATIONSHIP_FIELDS } from "./components/contabilRelationshipFields.ts";
import {
  applyLocalContabilFieldValue,
  createContabilFieldStatusMap,
  getCurrentContabilCompetence,
  rollbackContabilFieldValue,
  updateContabilControlFieldStatus,
} from "./components/contabilControlSection.helpers.ts";
import {
  buildContabilRelationshipFormValues,
  buildContabilResponsibleFormValues,
  getContabilSelectLabel,
  isContabilTextValueFilled,
  mapAssignableUsersToContabilOptions,
} from "./components/contabilPartySection.helpers.ts";
import {
  getContabilCardState,
  shouldShowContabilNav,
} from "./hooks/contabilAccessUi.ts";

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

  await runTest("relationship field registry matches the backend contract", () => {
    assert.deepEqual(
      CONTABIL_RELATIONSHIP_FIELDS.map((field) => field.field),
      ["bidding", "chart_accounts", "tool", "system", "note"],
    );
    assert.equal(CONTABIL_RELATIONSHIP_FIELDS[0].requiredOnCreate, true);
  });

  await runTest("responsible and relationship form helpers normalize nullable backend values", () => {
    assert.deepEqual(buildContabilResponsibleFormValues(null), {
      person_responsible_id: "",
      posted_by_id: "",
      customer_with_movement: false,
    });

    assert.deepEqual(buildContabilRelationshipFormValues(null), {
      bidding: false,
      chart_accounts: "",
      tool: "",
      system: "",
      note: "",
    });
  });

  await runTest("assignable user helper maps active users into select labels", () => {
    const options = mapAssignableUsersToContabilOptions([
      {
        id: "user-1",
        name: "Ana",
        status: "active",
        departmentName: "Contábil",
        photoUrl: null,
      },
      {
        id: "user-2",
        name: "Bruno",
        status: "active",
        departmentName: null,
        photoUrl: null,
      },
    ]);

    assert.deepEqual(options, [
      {
        value: "user-1",
        label: "Ana - Contábil",
      },
      {
        value: "user-2",
        label: "Bruno",
      },
    ]);
    assert.equal(getContabilSelectLabel("user-1", options), "Ana - Contábil");
    assert.equal(getContabilSelectLabel(null, options), "Não informado");
  });

  await runTest("text helper distinguishes filled and blank values", () => {
    assert.equal(isContabilTextValueFilled(" ERP X "), true);
    assert.equal(isContabilTextValueFilled("   "), false);
  });

  await runTest("resolveModuleAccess blocks normal users without department or additional access", () => {
    assert.deepEqual(resolveModuleAccess({ module: "contabil", userPermission: 1 }), {
      level: "none",
      canView: false,
      canEdit: false,
      isAdmin: false,
      source: "none",
    });
  });

  await runTest("resolveModuleAccess enables read-only mode for the module of the current department", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 0,
        departmentModule: "contabil",
      }),
      {
        level: "view",
        canView: true,
        canEdit: false,
        isAdmin: false,
        source: "department",
      },
    );
  });

  await runTest("resolveModuleAccess enables edit mode for department users", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 1,
        departmentModule: "contabil",
      }),
      {
        level: "edit",
        canView: true,
        canEdit: true,
        isAdmin: false,
        source: "department",
      },
    );
  });

  await runTest("resolveModuleAccess uses additional modules outside the primary department", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 1,
        departmentModule: "rh",
        additionalModulePermissions: { contabil: 0 },
      }),
      {
        level: "view",
        canView: true,
        canEdit: false,
        isAdmin: false,
        source: "additional-module",
      },
    );
  });

  await runTest("resolveModuleAccess keeps department precedence over matching additional module values", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 1,
        departmentModule: "contabil",
        additionalModulePermissions: { contabil: null },
      }),
      {
        level: "edit",
        canView: true,
        canEdit: true,
        isAdmin: false,
        source: "department",
      },
    );
  });

  await runTest("resolveModuleAccess unlocks global admins only when owner scope is explicit", () => {
    assert.deepEqual(resolveModuleAccess({ module: "contabil", isGlobalAdmin: true }), {
      level: "admin",
      canView: true,
      canEdit: true,
      isAdmin: true,
      source: "admin",
    });
  });

  await runTest("resolveDepartmentModuleKey maps known department names to shared module keys", () => {
    assert.equal(resolveDepartmentModuleKey("Contábil"), "contabil");
    assert.equal(resolveDepartmentModuleKey("Recursos Humanos"), "rh");
    assert.equal(resolveDepartmentModuleKey("Tecnologia"), "ti");
    assert.equal(resolveDepartmentModuleKey("Juridico"), null);
  });

  await runTest("resolveContabilPermissionAccess adapts shared module access to accounting flags", () => {
    assert.deepEqual(
      resolveContabilPermissionAccess({
        canView: false,
        canEdit: false,
      }),
      {
        canViewContabil: false,
        canEditContabil: false,
        isReadOnlyContabil: false,
      },
    );

    assert.deepEqual(
      resolveContabilPermissionAccess({
        canView: true,
        canEdit: false,
      }),
      {
        canViewContabil: true,
        canEditContabil: false,
        isReadOnlyContabil: true,
      },
    );

    assert.deepEqual(
      resolveContabilPermissionAccess({
        canView: true,
        canEdit: true,
      }),
      {
        canViewContabil: true,
        canEditContabil: true,
        isReadOnlyContabil: false,
      },
    );
  });

  await runTest("shouldShowContabilNav mirrors view permission", () => {
    assert.equal(shouldShowContabilNav(true), true);
    assert.equal(shouldShowContabilNav(false), false);
  });

  await runTest("getContabilCardState hides, disables and enables the client card correctly", () => {
    assert.equal(getContabilCardState(true, false), "hidden");
    assert.equal(getContabilCardState(false, true), "disabled");
    assert.equal(getContabilCardState(true, true), "enabled");
    assert.equal(getContabilCardState(undefined, true), "enabled");
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
      getContabilErrorMessage({
        isAxiosError: true,
        response: {
          data: {
            message: "Já está cadastrado para esta organização.",
          },
        },
      }),
      "Já está cadastrado para esta organização.",
    );

    assert.equal(
      getContabilErrorMessage(new Error("boom")),
      "boom",
    );
  });
})();
