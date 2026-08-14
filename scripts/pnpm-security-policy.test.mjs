import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePnpmVersion,
  readWorkspacePolicy,
  validatePnpmPolicy,
} from "./pnpm-security-policy.mjs";

const validWorkspace = `minimumReleaseAge: 1440
trustPolicy: no-downgrade
blockExoticSubdeps: true
strictDepBuilds: true
dangerouslyAllowAllBuilds: false
allowBuilds: {}
`;

const validPackage = {
  name: "@workspace/root",
  packageManager: "pnpm@10.26.0",
  pnpm: { overrides: { typescript: "5.3.3" } },
};

const validWorkflow = {
  path: ".github/workflows/install.yml",
  source: `name: install
on: push
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - run: corepack pnpm install --frozen-lockfile --ignore-scripts
`,
};

test("parsePnpmVersion parses an exact pnpm package manager pin", () => {
  assert.deepEqual(parsePnpmVersion("pnpm@10.26.0"), {
    major: 10,
    minor: 26,
    patch: 0,
  });
});

test("parsePnpmVersion rejects ranges and other package managers", () => {
  assert.equal(parsePnpmVersion("pnpm@^10.26.0"), null);
  assert.equal(parsePnpmVersion("npm@10.26.0"), null);
  assert.equal(parsePnpmVersion(undefined), null);
});

test("readWorkspacePolicy parses supported scalar settings and allowBuilds", () => {
  assert.deepEqual(readWorkspacePolicy(`minimumReleaseAge: 1440
trustPolicy: no-downgrade
blockExoticSubdeps: true
strictDepBuilds: true
dangerouslyAllowAllBuilds: false
allowBuilds:
  esbuild: true
`), {
    minimumReleaseAge: 1440,
    trustPolicy: "no-downgrade",
    blockExoticSubdeps: true,
    strictDepBuilds: true,
    dangerouslyAllowAllBuilds: false,
    allowBuilds: { esbuild: true },
  });
});

test("readWorkspacePolicy rejects duplicate and malformed settings", () => {
  assert.throws(
    () => readWorkspacePolicy("minimumReleaseAge: 1440\nminimumReleaseAge: 1\n"),
    /duplicate/u,
  );
  assert.throws(() => readWorkspacePolicy("minimumReleaseAge nope\n"), /mapping/u);
  assert.throws(() => readWorkspacePolicy("\tminimumReleaseAge: 1440\n"), /tab/u);
});

test("valid pnpm policy has no findings", () => {
  assert.deepEqual(
    validatePnpmPolicy({
      packageJson: validPackage,
      workspaceYaml: validWorkspace,
      workflowSources: [validWorkflow],
    }),
    [],
  );
});

test("rejects pnpm versions below the supported security baseline", () => {
  const findings = validatePnpmPolicy({
    packageJson: { ...validPackage, packageManager: "pnpm@9.15.0" },
    workspaceYaml: validWorkspace,
    workflowSources: [validWorkflow],
  });

  assert.match(JSON.stringify(findings), /PNPM_VERSION/u);
});

test("rejects ranges, missing controls, unsafe values and v11-only settings", () => {
  const findings = validatePnpmPolicy({
    packageJson: { ...validPackage, packageManager: "pnpm@^10.26.0" },
    workspaceYaml: `minimumReleaseAge: 60
trustPolicy: accept
blockExoticSubdeps: false
strictDepBuilds: false
dangerouslyAllowAllBuilds: true
minimumReleaseAgeStrict: true
trustLockfile: false
`,
    workflowSources: [validWorkflow],
  });

  const text = JSON.stringify(findings);
  for (const rule of [
    "PNPM_VERSION",
    "MINIMUM_RELEASE_AGE",
    "TRUST_POLICY",
    "BLOCK_EXOTIC_SUBDEPS",
    "STRICT_DEP_BUILDS",
    "DANGEROUSLY_ALLOW_ALL_BUILDS",
    "ALLOW_BUILDS",
    "UNSUPPORTED_SETTING",
  ]) {
    assert.match(text, new RegExp(rule, "u"));
  }
});

test("requires frozen lockfiles and rejects npm/yarn install commands", () => {
  const findings = validatePnpmPolicy({
    packageJson: validPackage,
    workspaceYaml: validWorkspace,
    workflowSources: [{
      path: ".github/workflows/bad.yml",
      source: `permissions: read
jobs:
  check:
    steps:
      - run: pnpm install --ignore-scripts
      - run: npm install
      - run: yarn install --frozen-lockfile
`,
    }],
  });

  const text = JSON.stringify(findings);
  assert.match(text, /FROZEN_LOCKFILE/u);
  assert.match(text, /PACKAGE_MANAGER_MISMATCH/u);
});

test("rejects production, deploy and admin token names in install workflows", () => {
  const findings = validatePnpmPolicy({
    packageJson: validPackage,
    workspaceYaml: validWorkspace,
    workflowSources: [{
      path: ".github/workflows/secrets.yml",
      source: `permissions: contents: read
jobs:
  check:
    steps:
      - run: PROD_TOKEN="${"${{ secrets.PRODUCTION_TOKEN }}"}" pnpm install --frozen-lockfile
      - run: echo "${"${{ secrets.ADMIN_TOKEN }}"}"
`,
    }],
  });

  assert.match(JSON.stringify(findings), /SENSITIVE_TOKEN/u);
});

test("rejects exotic dependency sources and unsupported workspace settings", () => {
  const findings = validatePnpmPolicy({
    packageJson: {
      ...validPackage,
      dependencies: { "untrusted-package": "git+https://example.invalid/repo.git" },
    },
    workspaceYaml: `${validWorkspace}unknownSetting: true\n`,
    workflowSources: [validWorkflow],
  });

  const text = JSON.stringify(findings);
  assert.match(text, /EXOTIC_SOURCE/u);
  assert.match(text, /UNSUPPORTED_SETTING/u);
});

test("ignores commented install examples and returns stable findings", () => {
  const findings = validatePnpmPolicy({
    packageJson: validPackage,
    workspaceYaml: validWorkspace,
    workflowSources: [{
      path: ".github/workflows/commented.yml",
      source: `# pnpm install\n# npm install\n`,
    }, validWorkflow],
  });

  assert.deepEqual(findings, []);
});
