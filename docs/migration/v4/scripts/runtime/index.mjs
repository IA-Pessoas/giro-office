import { createExecutionRegistry, executionStepKey } from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID } from "../lib/mapping-contract.mjs";
import { ADMIN_BUSINESS_RULES } from "../rules/admin-business.mjs";
import { CERTIFICATE_RULES } from "../rules/certificates.mjs";
import { INTEGRACAO_REGULARIZE_RULES } from "../rules/integracao-regularize.mjs";
import { PARCELAMENTO_RULES } from "../rules/parcelamento.mjs";
import { REMAINING_RULES } from "../rules/remaining.mjs";
import { RH_PESSOAL_RULES } from "../rules/rh-pessoal.mjs";
import { TECHNOLOGY_RULES } from "../rules/tecnologia.mjs";
import { V2_RULES } from "../rules/v2.mjs";
import {
  ADMIN_BUSINESS_EXECUTION_ENTRIES,
  ADMIN_BUSINESS_TRANSFORMERS,
  buildAdminBusinessRuntimeState,
} from "./admin-business.mjs";
import {
  buildIntegracaoRegularizeRuntimeState,
  INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES,
  INTEGRACAO_REGULARIZE_TRANSFORMERS,
} from "./integracao-regularize.mjs";
import {
  buildRemainingRuntimeState,
  REMAINING_EXECUTION_ENTRIES,
  REMAINING_TRANSFORMERS,
} from "./remaining.mjs";
import {
  buildRhPessoalRuntimeState,
  RH_PESSOAL_EXECUTION_ENTRIES,
  RH_PESSOAL_TRANSFORMERS,
} from "./rh-pessoal.mjs";
import {
  buildSpecializedRuntimeState,
  SPECIALIZED_EXECUTION_ENTRIES,
  SPECIALIZED_TRANSFORMERS,
} from "./technology-certificates-parcelamento.mjs";
import { buildV2RuntimeState, V2_EXECUTION_ENTRIES, V2_TRANSFORMERS } from "./v2.mjs";

export const ALL_MAPPING_RULES = Object.freeze([
  ...V2_RULES,
  ...ADMIN_BUSINESS_RULES,
  ...INTEGRACAO_REGULARIZE_RULES,
  ...RH_PESSOAL_RULES,
  ...TECHNOLOGY_RULES,
  ...CERTIFICATE_RULES,
  ...PARCELAMENTO_RULES,
  ...REMAINING_RULES,
]);

export const ALL_EXECUTION_ENTRIES = Object.freeze([
  ...V2_EXECUTION_ENTRIES,
  ...ADMIN_BUSINESS_EXECUTION_ENTRIES,
  ...INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES,
  ...RH_PESSOAL_EXECUTION_ENTRIES,
  ...SPECIALIZED_EXECUTION_ENTRIES,
  ...REMAINING_EXECUTION_ENTRIES,
]);

export const ALL_TRANSFORMERS = Object.freeze({
  v2: V2_TRANSFORMERS,
  adminBusiness: ADMIN_BUSINESS_TRANSFORMERS,
  integracaoRegularize: INTEGRACAO_REGULARIZE_TRANSFORMERS,
  rhPessoal: RH_PESSOAL_TRANSFORMERS,
  specialized: SPECIALIZED_TRANSFORMERS,
  remaining: REMAINING_TRANSFORMERS,
});

export function createCompleteExecutionRegistry() {
  return createExecutionRegistry([ALL_EXECUTION_ENTRIES]);
}

export function createCompleteRuntimeStateByStep(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options de runtime completo inválidas");
  }
  const withTenant = (name) => ({
    ...(options[name] ?? {}),
    organizationId: CASTELO_ORGANIZATION_ID,
  });
  const integracaoRegularizeState = buildIntegracaoRegularizeRuntimeState(
    withTenant("integracaoRegularize"),
  );
  const runtimeGroups = [
    [V2_EXECUTION_ENTRIES, buildV2RuntimeState(withTenant("v2"))],
    [ADMIN_BUSINESS_EXECUTION_ENTRIES, buildAdminBusinessRuntimeState(withTenant("adminBusiness"))],
    [INTEGRACAO_REGULARIZE_EXECUTION_ENTRIES, integracaoRegularizeState],
    [RH_PESSOAL_EXECUTION_ENTRIES, buildRhPessoalRuntimeState(options.rhPessoal ?? {})],
    [SPECIALIZED_EXECUTION_ENTRIES, buildSpecializedRuntimeState(withTenant("specialized"))],
    [REMAINING_EXECUTION_ENTRIES, buildRemainingRuntimeState(withTenant("remaining"))],
  ];
  const runtimeStateByStep = new Map(
    runtimeGroups.flatMap(([entries, runtimeState]) =>
      entries.map((entry) => [executionStepKey(entry), runtimeState]),
    ),
  );
  const groupMemberKey = executionStepKey({
    sourceTable: "tb_regularize.grupos_integrantes",
    stepId: "regularize-group-member-insert",
  });
  if (integracaoRegularizeState.v2Clients === null) {
    runtimeStateByStep.set(
      groupMemberKey,
      Object.freeze({
        runtimeState: integracaoRegularizeState,
        classifyExecutionRow: () =>
          Object.freeze({
            status: "quarantine",
            field: "codigo_cliente",
            reasonCode: "GROUP_MEMBER_CLIENT_LOOKUP_NOT_EXECUTED",
          }),
      }),
    );
  }
  return runtimeStateByStep;
}
