import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildContabilPortfolioParams,
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

function readWorkspaceSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const contabilServiceSources = {
  authMiddleware: readWorkspaceSource(
    "../../../../services/contabil-service/src/middlewares/isAuthenticated.ts",
  ),
  controlRoute: readWorkspaceSource(
    "../../../../services/contabil-service/src/routes/control.routes.ts",
  ),
  responsibleRoute: readWorkspaceSource(
    "../../../../services/contabil-service/src/routes/responsible.routes.ts",
  ),
  relationshipRoute: readWorkspaceSource(
    "../../../../services/contabil-service/src/routes/relationship.routes.ts",
  ),
  controlRouteTest: readWorkspaceSource(
    "../../../../services/contabil-service/src/test/control.routes.test.ts",
  ),
  responsibleRouteTest: readWorkspaceSource(
    "../../../../services/contabil-service/src/test/responsible.routes.test.ts",
  ),
  relationshipRouteTest: readWorkspaceSource(
    "../../../../services/contabil-service/src/test/relationship.routes.test.ts",
  ),
  gatewayServiceRegistry: readWorkspaceSource(
    "../../../../services/gateway/src/config/serviceRegistry.ts",
  ),
};

await (async () => {
  await runTest("carteira operacional usa o contrato mensal de leitura", () => {
    assert.equal(CONTABIL_ENDPOINTS.controlsList, "/contabil/controls/list");
    assert.deepEqual(buildContabilPortfolioParams("2026-09"), { competence: "2026-09" });
  });

  await runTest("carteira operacional mostra competência, resumo, ausência e recuperação", () => {
    const source = readWorkspaceSource("./components/ContabilPortfolioSection.tsx");

    assert.match(source, /type="month"/);
    assert.match(source, /Carteira operacional/);
    assert.match(source, /sem controle mensal/i);
    assert.match(source, /Tentar novamente/);
    assert.match(source, /—/);
  });

  await runTest("carteira associa o fechamento e o controle às colunas corretas", () => {
    const source = readWorkspaceSource("./components/ContabilPortfolioSection.tsx");
    const closingStatus = source.indexOf('NOT_RECEIVED: "Não recebido"');
    const monthlyControl = source.indexOf('item.control ? "Iniciado" : "—"');

    assert.ok(closingStatus >= 0);
    assert.ok(monthlyControl >= 0);
    assert.ok(
      closingStatus < monthlyControl,
      "o status do fechamento deve ser renderizado antes do estado do controle mensal",
    );
  });

  await runTest("contabil page preserva o seletor de cliente da organização", () => {
    const source = readFileSync(new URL("../../pages/contabil.tsx", import.meta.url), "utf8");

    assert.match(source, /ClientPickerModal/);
    assert.match(source, /headerAction=\{/);
    assert.doesNotMatch(source, /clientPickerContent=/);
    assert.match(source, /status:\s*"Ativo"/);
    assert.match(source, /legacyIntegrationStatusFilter:\s*false/);
    assert.doesNotMatch(source, /ref:\s*"deps"/);
    assert.doesNotMatch(source, /Departamento contabil/);
    assert.doesNotMatch(source, /useClients\(/);
    assert.doesNotMatch(source, /page:\s*1/);
  });

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
    assert.equal(CONTABIL_ENDPOINTS.triageMonthly, "/triagem/monthly");
    assert.equal(CONTABIL_ENDPOINTS.triageEditability, "/triagem/editability");
    assert.equal(CONTABIL_ENDPOINTS.triageStatements, "/triagem/statements");
    assert.equal(CONTABIL_ENDPOINTS.triageClosing, "/triagem/closing");
  });

  await runTest("triagem só mostra mutações após verificar a atribuição do cliente", () => {
    const pageSource = readFileSync(new URL("../../pages/triagem.tsx", import.meta.url), "utf8");

    assert.match(pageSource, /useTriageEditability/);
    assert.match(pageSource, /canEdit=\{editability\.data\?\.can_edit === true\}/);
    assert.doesNotMatch(pageSource, /canEdit\s*\/>/);
  });

  await runTest("triagem apresenta os nove documentos, indicador e banco sem dados de conta", () => {
    const source = readWorkspaceSource("./components/TriageDocumentsSection.tsx");

    assert.equal((source.match(/\["[a-z_]+", "/g) ?? []).length, 9);
    assert.match(source, /não entram no\s+indicador/i);
    assert.match(source, /Marcar todos os itens abertos/);
    assert.match(source, /Identificador do banco/);
    assert.match(source, /dados de\s+conta não são solicitados/i);
    assert.match(source, /useTriageStatements/);
    assert.match(source, /useTriageClosing/);
    assert.match(source, /Fechamento recebido/);
    assert.match(source, /NOT_RECEIVED/);
  });

  await runTest("contabil-service blocks viewer writes and allows editor writes", () => {
    assert.match(contabilServiceSources.authMiddleware, /const CONTABIL_WRITE_PERMISSION = 2;/);
    assert.match(contabilServiceSources.authMiddleware, /requireContabilWritePermission/);

    assert.equal(
      contabilServiceSources.controlRoute.match(/requireContabilWritePermission/g)?.length,
      7,
    );
    assert.equal(
      contabilServiceSources.responsibleRoute.match(/requireContabilWritePermission/g)?.length,
      4,
    );
    assert.equal(
      contabilServiceSources.relationshipRoute.match(/requireContabilWritePermission/g)?.length,
      4,
    );

    for (const source of [
      contabilServiceSources.controlRouteTest,
      contabilServiceSources.responsibleRouteTest,
      contabilServiceSources.relationshipRouteTest,
    ]) {
      assert.match(source, /function gatewayHeaders\(permission = 2\)/);
      assert.match(source, /gatewayHeaders\(1\)/);
    }

    assert.match(
      contabilServiceSources.gatewayServiceRegistry,
      /key:\s*"contabil-service",[\s\S]*internalServiceToken:\s*env\.auditServiceToken,[\s\S]*permissionModule:\s*"contabil"/,
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

  await runTest("viewer control section reads existing control without bootstrap write", () => {
    const componentSource = readFileSync(
      new URL("./components/ContabilControlSection.tsx", import.meta.url),
      "utf8",
    );
    const hookSource = readFileSync(
      new URL("./hooks/useContabilControl.ts", import.meta.url),
      "utf8",
    );

    assert.match(hookSource, /useContabilControlDetail/);
    assert.match(componentSource, /enabled:\s*!canEdit/);
    assert.match(componentSource, /canEdit\s*\?\s*bootstrapMutation\.data\s*:\s*detailQuery\.data/);
    assert.match(componentSource, /if\s*\(!canEdit\)\s*\{/);
    assert.match(hookSource, /contabilControlService\.getControl/);
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

  await runTest("relationship field registry keeps bidding beside system in the UI order", () => {
    assert.deepEqual(
      CONTABIL_RELATIONSHIP_FIELDS.map((field) => field.field),
      ["chart_accounts", "tool", "system", "bidding", "note"],
    );
    assert.equal(CONTABIL_RELATIONSHIP_FIELDS[3]?.field, "bidding");
    assert.equal(CONTABIL_RELATIONSHIP_FIELDS[3]?.requiredOnCreate, true);
  });

  await runTest("relationship bidding checkbox uses compact form proportions", () => {
    const source = readFileSync(
      new URL("./components/ContabilRelationshipSection.tsx", import.meta.url),
      "utf8",
    );
    const textFieldsStart = source.indexOf("{CONTABIL_RELATIONSHIP_TEXT_FIELDS.map");
    const textareaStart = source.indexOf("{CONTABIL_RELATIONSHIP_TEXTAREA_FIELDS.map");
    const checkboxStart = source.indexOf("{CONTABIL_RELATIONSHIP_BOOLEAN_FIELDS.map");
    const checkboxSource = source.slice(
      checkboxStart,
      source.indexOf("{submitError", checkboxStart),
    );

    assert.ok(textFieldsStart < textareaStart);
    assert.ok(textFieldsStart < checkboxStart);
    assert.ok(checkboxStart < textareaStart);
    assert.match(checkboxSource, /className="flex h-11 items-center gap-3/);
    assert.match(checkboxSource, /className="h-4 w-4/);
    assert.doesNotMatch(
      checkboxSource,
      /rounded-xl border border-gray-200 bg-gray-50\/70 px-4 py-3/,
    );
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

  await runTest("assignable user helper limits selector options to accounting users", () => {
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
        departmentName: "RH",
        photoUrl: null,
      },
      {
        id: "user-3",
        name: "Carla",
        status: "active",
        departmentName: "Contabil Fiscal",
        photoUrl: null,
      },
      {
        id: "user-4",
        name: "Diego",
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
      { value: "user-3", label: "Carla - Contabil Fiscal" },
    ]);
    assert.equal(getContabilSelectLabel("user-1", options), "Ana - Contábil");
    assert.equal(getContabilSelectLabel(null, options), "Não informado");
    assert.equal(getContabilSelectLabel("missing-user", options), "Usuário não encontrado");
    assert.deepEqual(
      mapAssignableUsersToContabilOptions([
        {
          id: "user-2",
          name: "Bruno",
          status: "active",
          departmentName: "RH",
          photoUrl: null,
        },
      ], ["user-2"]),
      [{ value: "user-2", label: "Bruno - RH" }],
    );
  });

  await runTest("responsible display loads user labels without exposing IDs", () => {
    const source = readFileSync(
      new URL("./components/ContabilResponsibleSection.tsx", import.meta.url),
      "utf8",
    );

    assert.match(source, /enabled:\s*Boolean\([\s\S]*responsible\?\./);
    assert.doesNotMatch(source, /return options\.find\(\(option\) => option\.value === value\)\?\.label \?\? value/);
  });

  await runTest("client accounting page shows unavailable service before opening the shell", () => {
    const source = readFileSync(
      new URL("../../pages/clients/[id]/contabil.tsx", import.meta.url),
      "utf8",
    );
    const unavailableIndex = source.indexOf("client.contabil === false");
    const shellIndex = source.indexOf("<ContabilShell");

    assert.ok(unavailableIndex >= 0);
    assert.ok(shellIndex >= 0);
    assert.ok(unavailableIndex < shellIndex);
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

  await runTest("resolveModuleAccess ignores the current department without a module grant", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 0,
        departmentModule: "contabil",
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
      },
    );
  });

  await runTest("resolveModuleAccess ignores legacy user permission levels", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 1,
        departmentModule: "contabil",
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
      },
    );
  });

  await runTest("resolveModuleAccess uses persisted module permissions", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 1,
        departmentModule: "rh",
        additionalModulePermissions: { contabil: 1 },
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

  await runTest("resolveModuleAccess does not restore department access when module permission is absent", () => {
    assert.deepEqual(
      resolveModuleAccess({
        module: "contabil",
        userPermission: 1,
        departmentModule: "contabil",
        additionalModulePermissions: { contabil: null },
      }),
      {
        level: "none",
        canView: false,
        canEdit: false,
        isAdmin: false,
        source: "none",
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
