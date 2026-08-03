import { buildRuleRegistry as createRuleRegistry } from "../lib/mapping-contract.mjs";
import { v2Rules } from "./v2.mjs";

export { v2Rules };

export function buildRuleRegistry() {
  return createRuleRegistry([v2Rules]);
}
