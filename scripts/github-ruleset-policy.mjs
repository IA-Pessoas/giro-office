import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REMEDIATION =
  "Atualize o ruleset no GitHub para corresponder a .github/security/rulesets-policy.json.";

function sortedStrings(values) {
  return [
    ...new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : []),
  ].sort();
}

function normalizeBypassActors(actors) {
  return (Array.isArray(actors) ? actors : [])
    .map((actor) => ({
      type: actor?.actor_type ?? actor?.type ?? "",
      name: actor?.actor_name ?? actor?.name ?? "",
      mode: actor?.bypass_mode ?? actor?.mode ?? "",
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function normalizeRules(rules) {
  if (rules && !Array.isArray(rules)) {
    return {
      ...(rules.deletion ? { deletion: true } : {}),
      ...(rules.nonFastForward ? { nonFastForward: true } : {}),
      ...(rules.requiredSignatures ? { requiredSignatures: true } : {}),
      ...(rules.requiredStatusChecks
        ? { requiredStatusChecks: { contexts: sortedStrings(rules.requiredStatusChecks.contexts) } }
        : {}),
      ...(rules.pullRequest ? { pullRequest: { ...rules.pullRequest } } : {}),
    };
  }
  const normalized = {};
  for (const rule of Array.isArray(rules) ? rules : []) {
    const type = rule?.type;
    const parameters = rule?.parameters ?? {};
    if (type === "deletion") normalized.deletion = true;
    if (type === "non_fast_forward") normalized.nonFastForward = true;
    if (type === "required_signatures") normalized.requiredSignatures = true;
    if (type === "required_status_checks") {
      normalized.requiredStatusChecks = {
        contexts: sortedStrings(
          parameters.required_status_checks?.map((statusCheck) => statusCheck?.context),
        ),
      };
    }
    if (type === "pull_request") {
      normalized.pullRequest = {
        requiredApprovingReviewCount: parameters.required_approving_review_count,
        requireCodeOwnerReview: parameters.require_code_owner_review,
        requiredReviewThreadResolution: parameters.required_review_thread_resolution,
        dismissStaleReviewsOnPush: parameters.dismiss_stale_reviews_on_push,
        requireLastPushApproval: parameters.require_last_push_approval,
      };
    }
  }
  return normalized;
}

function normalizeRuleset(ruleset) {
  const conditions = ruleset?.conditions?.ref_name?.include ?? ruleset?.patterns;
  return {
    name: ruleset?.name ?? "",
    target: ruleset?.target ?? "",
    patterns: sortedStrings(conditions),
    enforcement: ruleset?.enforcement ?? "",
    bypassActors: normalizeBypassActors(ruleset?.bypass_actors ?? ruleset?.bypassActors),
    rules: normalizeRules(ruleset?.rules),
  };
}

export function normalizeRulesets(value) {
  const rulesets = Array.isArray(value) ? value : value?.rulesets;
  return (Array.isArray(rulesets) ? rulesets : [])
    .map(normalizeRuleset)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function finding(ruleName, targetPattern) {
  return { ruleName, targetPattern, remediation: REMEDIATION };
}

function compareRule(expectedRules, actualRules, targetPattern) {
  const findings = [];
  for (const [ruleName, expectedValue] of Object.entries(expectedRules)) {
    const actualValue = actualRules[ruleName];
    if (!equalJson(actualValue, expectedValue)) {
      if (ruleName === "pullRequest") {
        for (const field of Object.keys(expectedValue)) {
          if (!equalJson(actualValue?.[field], expectedValue[field])) {
            findings.push(finding(`pullRequest.${field}`, targetPattern));
          }
        }
      } else if (ruleName === "requiredStatusChecks") {
        for (const context of expectedValue.contexts) {
          if (!actualValue?.contexts?.includes(context)) {
            findings.push(finding(`requiredStatusChecks:${context}`, targetPattern));
          }
        }
      } else {
        findings.push(finding(ruleName, targetPattern));
      }
    }
  }
  return findings;
}

export function compareRulesets(actual, expected) {
  const expectedRulesets = normalizeRulesets(expected);
  const actualRulesets = normalizeRulesets(actual);
  const actualByName = new Map(actualRulesets.map((ruleset) => [ruleset.name, ruleset]));
  const findings = [];

  for (const expectedRuleset of expectedRulesets) {
    const actualRuleset = actualByName.get(expectedRuleset.name);
    const targetPattern = expectedRuleset.patterns.join(",");
    if (!actualRuleset) {
      findings.push(finding("ruleset", targetPattern));
      continue;
    }
    if (!equalJson(actualRuleset.patterns, expectedRuleset.patterns)) {
      findings.push(finding("patterns", targetPattern));
    }
    if (actualRuleset.target !== expectedRuleset.target) {
      findings.push(finding("target", targetPattern));
    }
    if (actualRuleset.enforcement !== expectedRuleset.enforcement) {
      findings.push(finding("enforcement", targetPattern));
    }
    if (!equalJson(actualRuleset.bypassActors, expectedRuleset.bypassActors)) {
      findings.push(finding("bypassActor", targetPattern));
    }
    findings.push(...compareRule(expectedRuleset.rules, actualRuleset.rules, targetPattern));
  }

  return findings.sort((left, right) =>
    `${left.targetPattern}:${left.ruleName}`.localeCompare(
      `${right.targetPattern}:${right.ruleName}`,
    ),
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function main(args = process.argv.slice(2)) {
  const policyIndex = args.indexOf("--policy");
  const actualIndex = args.indexOf("--actual");
  const policyPath = policyIndex >= 0 ? args[policyIndex + 1] : undefined;
  const actualPath = actualIndex >= 0 ? args[actualIndex + 1] : undefined;
  if (!policyPath || !actualPath) {
    process.stderr.write(
      "usage: node scripts/github-ruleset-policy.mjs --policy <file> --actual <file>\n",
    );
    return 2;
  }

  const findings = compareRulesets(await readJson(actualPath), await readJson(policyPath));
  if (findings.length === 0) {
    process.stdout.write("rulesets policy: ok\n");
    return 0;
  }

  process.stderr.write(`rulesets policy: drift detected (${findings.length} findings)\n`);
  process.stderr.write(`${JSON.stringify(findings, null, 2)}\n`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
