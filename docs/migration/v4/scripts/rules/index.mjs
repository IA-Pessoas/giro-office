import { V2_EVIDENCE } from "../evidence/v2.mjs";
import { buildRuleRegistry as createRuleRegistry } from "../lib/mapping-contract.mjs";
import { V2_RULES } from "./v2.mjs";

export { V2_EVIDENCE, V2_RULES };
export const v2Rules = V2_RULES;

export function buildRuleRegistry() {
  return createRuleRegistry([V2_RULES]);
}
