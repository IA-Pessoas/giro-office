import { RH_PESSOAL_EVIDENCE } from "../evidence/rh-pessoal.mjs";
import { V2_EVIDENCE } from "../evidence/v2.mjs";
import { buildRuleRegistry as createRuleRegistry } from "../lib/mapping-contract.mjs";
import { RH_PESSOAL_RULES } from "./rh-pessoal.mjs";
import { V2_RULES } from "./v2.mjs";

export { RH_PESSOAL_EVIDENCE, RH_PESSOAL_RULES, V2_EVIDENCE, V2_RULES };
export const v2Rules = V2_RULES;
export const rhPessoalRules = RH_PESSOAL_RULES;

export function buildRuleRegistry(...additionalRuleGroups) {
  return createRuleRegistry([V2_RULES, ...additionalRuleGroups]);
}
