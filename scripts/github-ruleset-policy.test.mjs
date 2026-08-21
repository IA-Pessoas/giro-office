import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compareRulesets, normalizeRulesets } from "./github-ruleset-policy.mjs";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8"));
}

function runCli(actualPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(scriptsDirectory, "github-ruleset-policy.mjs"),
        "--policy",
        path.join(repositoryRoot, ".github/security/rulesets-policy.json"),
        "--actual",
        path.join(repositoryRoot, actualPath),
      ],
      { cwd: repositoryRoot },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("fixture aprovado satisfaz a política versionada", async () => {
  const actual = await readJson("scripts/fixtures/rulesets/approved.json");
  const expected = await readJson(".github/security/rulesets-policy.json");

  assert.deepEqual(compareRulesets(actual, expected), []);
});

test("fixture driftado denuncia cada proteção ausente sem expor payload", async () => {
  const actual = await readJson("scripts/fixtures/rulesets/drifted.json");
  const expected = await readJson(".github/security/rulesets-policy.json");

  const findings = compareRulesets(actual, expected);
  const ruleNames = findings.map((finding) => finding.ruleName);

  for (const ruleName of [
    "deletion",
    "nonFastForward",
    "pullRequest.requiredApprovingReviewCount",
    "pullRequest.requireCodeOwnerReview",
    "pullRequest.requiredReviewThreadResolution",
    "pullRequest.dismissStaleReviewsOnPush",
    "pullRequest.requireLastPushApproval",
    "requiredStatusChecks:security/supply-chain",
    "bypassActor",
  ]) {
    assert.ok(ruleNames.includes(ruleName), `expected finding for ${ruleName}`);
  }

  assert.deepEqual(
    findings,
    findings.map(({ ruleName, targetPattern, remediation }) => ({
      ruleName,
      targetPattern,
      remediation,
    })),
  );
  assert.ok(
    findings.every(
      (finding) => Object.keys(finding).sort().join(",") === "remediation,ruleName,targetPattern",
    ),
  );
});

test("normalização é determinística e ignora campos opcionais não suportados", async () => {
  const approved = await readJson("scripts/fixtures/rulesets/approved.json");
  const reordered = structuredClone(approved).reverse();
  reordered[1].conditions.ref_name.include.reverse();
  reordered[0].rules.reverse();
  reordered[0].rules.push({ type: "unsupported_signed_commit_capability" });

  assert.deepEqual(normalizeRulesets(approved), normalizeRulesets(reordered));
});

test("bypass actor não documentado não é aceito pela normalização/comparação", async () => {
  const actual = await readJson("scripts/fixtures/rulesets/approved.json");
  const expected = await readJson(".github/security/rulesets-policy.json");
  const protectedRuleset = actual.find(({ name }) => name === "protected-lifecycle");
  protectedRuleset.bypass_actors[0].actor_name = "undocumented-actor";

  assert.ok(compareRulesets(actual, expected).some(({ ruleName }) => ruleName === "bypassActor"));
});

test("CLI lê somente os arquivos fornecidos e retorna exit code de drift", async () => {
  const approved = await runCli("scripts/fixtures/rulesets/approved.json");
  const drifted = await runCli("scripts/fixtures/rulesets/drifted.json");

  assert.equal(approved.code, 0);
  assert.match(approved.stdout, /rulesets policy: ok/u);
  assert.equal(drifted.code, 1);
  assert.match(drifted.stderr, /rulesets policy: drift detected/u);
  assert.doesNotMatch(
    `${approved.stdout}${approved.stderr}${drifted.stdout}${drifted.stderr}`,
    /token|authorization|payload/iu,
  );
});
