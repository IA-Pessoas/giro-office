import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import test from "node:test";

import { validatePnpmPolicy } from "./pnpm-security-policy.mjs";

const PNPM_VERSION = "10.26.0";
const COREPACK = process.platform === "win32" ? process.execPath : "corepack";
const COREPACK_ARGS =
  process.platform === "win32"
    ? [join(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js")]
    : [];

const policyYaml = (allowBuilds = "{}") => `packages:
  - "packages/*"

minimumReleaseAge: 1440
trustPolicy: no-downgrade
blockExoticSubdeps: true
strictDepBuilds: true
dangerouslyAllowAllBuilds: false
allowBuilds: ${allowBuilds}
`;

function archiveSpecifierForFixture(root, archive) {
  return `file:./${basename(relative(root.replaceAll("\\", "/"), archive.replaceAll("\\", "/")))}`;
}

function buildPnpmEnvironment(source, extraEnv = {}) {
  const allowedKeys = [
    "PATH",
    "Path",
    "CI",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LANGUAGE",
    "TEMP",
    "TMP",
    "TMPDIR",
    "COREPACK_HOME",
  ];
  const environment = Object.fromEntries(
    allowedKeys.filter((key) => typeof source[key] === "string").map((key) => [key, source[key]]),
  );
  environment.CI = "1";
  environment.COREPACK_ENABLE_NETWORK = "0";
  environment.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
  if (Object.keys(extraEnv).some((key) => key !== "SENTINEL_PATH")) {
    throw new Error("fixture requested a non-allowlisted environment variable");
  }
  return { ...environment, ...extraEnv };
}

function runPnpm(root, args, extraEnv = {}, cwd = root) {
  return spawnSync(COREPACK, [...COREPACK_ARGS, `pnpm@${PNPM_VERSION}`, ...args], {
    cwd,
    encoding: "utf8",
    env: buildPnpmEnvironment(process.env, extraEnv),
    timeout: 120_000,
    windowsHide: true,
  });
}

function assertPnpmSuccess(result, label) {
  assert.equal(result.error, undefined, `${label}: Corepack process error`);
  assert.equal(result.status, 0, `${label}: pnpm exited unsuccessfully\n${result.stderr ?? ""}`);
}

async function createFixture({ packageJson = {}, allowBuilds = "{}" } = {}) {
  const root = await mkdtemp(join(tmpdir(), "giro-pnpm-policy-"));
  await mkdir(join(root, "packages"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "@fixture/root",
        version: "1.0.0",
        private: true,
        packageManager: `pnpm@${PNPM_VERSION}`,
        ...packageJson,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, "pnpm-workspace.yaml"), policyYaml(allowBuilds));
  return root;
}

async function writeLifecyclePackage(root) {
  const packageRoot = join(root, "fixture-source");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "fixture-lifecycle",
        version: "1.0.0",
        private: true,
        scripts: {
          build: "node build.mjs",
          postinstall: "node build.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(packageRoot, "build.mjs"),
    `import { writeFile } from "node:fs/promises";
await writeFile(process.env.SENTINEL_PATH, "benign fixture build executed\\n");
`,
  );
  const packed = runPnpm(root, ["pack", "--pack-destination", root], {}, packageRoot);
  assertPnpmSuccess(packed, "fixture package pack");
  return join(root, "fixture-lifecycle-1.0.0.tgz");
}

async function writeWorkspaceBuildPackage(root) {
  const packageRoot = join(root, "packages", "native");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "@fixture/native",
        version: "1.0.0",
        private: true,
        scripts: { build: "node build.mjs" },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(packageRoot, "build.mjs"),
    `import { writeFile } from "node:fs/promises";
await writeFile(process.env.SENTINEL_PATH, "benign approved build executed\\n");
`,
  );
}

async function setRootDependencies(root, dependencies) {
  const packageJsonPath = join(root, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.dependencies = dependencies;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function removeFixture(root) {
  await rm(root, { recursive: true, force: true });
}

test("uses basename and relative for POSIX archive paths", () => {
  assert.equal(
    archiveSpecifierForFixture(
      "/tmp/giro-pnpm-policy",
      "/tmp/giro-pnpm-policy/fixture-lifecycle-1.0.0.tgz",
    ),
    "file:./fixture-lifecycle-1.0.0.tgz",
  );
});

test("builds a minimal allowlisted pnpm environment", () => {
  const environment = buildPnpmEnvironment(
    {
      PATH: "path-value",
      LANG: "pt_BR.UTF-8",
      TEMP: "temp-value",
      SECRET_TOKEN: "must-not-propagate",
    },
    { SENTINEL_PATH: "sentinel-value" },
  );

  assert.equal(environment.PATH, "path-value");
  assert.equal(environment.LANG, "pt_BR.UTF-8");
  assert.equal(environment.TEMP, "temp-value");
  assert.equal(environment.COREPACK_ENABLE_NETWORK, "0");
  assert.equal(environment.SENTINEL_PATH, "sentinel-value");
  assert.equal(environment.SECRET_TOKEN, undefined);
});

test("pnpm fixture harness checks effective release age and rejects unsafe age offline", {
  concurrency: false,
}, async () => {
  const root = await createFixture();
  try {
    const config = runPnpm(root, ["config", "get", "minimumReleaseAge"]);
    assertPnpmSuccess(config, "effective minimumReleaseAge");
    assert.match(config.stdout.trim(), /^1440$/mu);

    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const workspaceYaml = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
    const rejected = validatePnpmPolicy({
      packageJson,
      workspaceYaml: workspaceYaml.replace("minimumReleaseAge: 1440", "minimumReleaseAge: 0"),
      workflowSources: [],
    });
    assert.ok(rejected.some(({ rule }) => rule === "MINIMUM_RELEASE_AGE"));
  } finally {
    await removeFixture(root);
  }
});

test("unapproved lifecycle fixture is blocked without executing its sentinel", {
  concurrency: false,
}, async () => {
  const root = await createFixture();
  const sentinel = join(root, "lifecycle-sentinel.txt");
  try {
    const archive = await writeLifecyclePackage(root);
    await setRootDependencies(root, {
      "fixture-lifecycle": archiveSpecifierForFixture(root, archive),
    });
    const lockfile = runPnpm(root, ["install", "--lockfile-only", "--offline", "--ignore-scripts"]);
    assertPnpmSuccess(lockfile, "unapproved lifecycle lockfile generation");
    const install = runPnpm(root, ["install", "--frozen-lockfile", "--offline"], {
      SENTINEL_PATH: sentinel,
    });
    assert.match(`${install.stdout}\n${install.stderr}`, /ignored|blocked|approve|build scripts/iu);
    assert.equal(await exists(sentinel), false);
  } finally {
    await removeFixture(root);
  }
});

test("policy fixture rejects git and tarball sources without contacting a registry", {
  concurrency: false,
}, async () => {
  const root = await createFixture();
  try {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    packageJson.dependencies = {
      "fixture-git": "git+https://example.invalid/fixture.git",
      "fixture-tarball": "https://example.invalid/fixture.tgz",
    };
    const workspaceYaml = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
    const findings = validatePnpmPolicy({ packageJson, workspaceYaml, workflowSources: [] });
    assert.equal(findings.filter(({ rule }) => rule === "EXOTIC_SOURCE").length, 2);
  } finally {
    await removeFixture(root);
  }
});

test("frozen install rejects a controlled lockfile mutation offline", {
  concurrency: false,
}, async () => {
  const root = await createFixture();
  try {
    const lockfile = runPnpm(root, ["install", "--lockfile-only", "--offline", "--ignore-scripts"]);
    assertPnpmSuccess(lockfile, "fixture lockfile generation");

    const packageJsonPath = join(root, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    packageJson.dependencies = { "fixture-mutation": "1.0.0" };
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

    const install = runPnpm(root, [
      "install",
      "--frozen-lockfile",
      "--offline",
      "--ignore-scripts",
    ]);
    assert.notEqual(install.status, 0);
  } finally {
    await removeFixture(root);
  }
});

test("explicitly approved fixture build runs without secrets", { concurrency: false }, async () => {
  const root = await createFixture({
    packageJson: { dependencies: { "@fixture/native": "workspace:*" } },
    allowBuilds: '\n  "@fixture/native": true',
  });
  const sentinel = join(root, "approved-build-sentinel.txt");
  try {
    await writeWorkspaceBuildPackage(root);
    const lockfile = runPnpm(root, ["install", "--lockfile-only", "--offline", "--ignore-scripts"]);
    assertPnpmSuccess(lockfile, "approved lifecycle lockfile generation");
    const install = runPnpm(root, [
      "install",
      "--frozen-lockfile",
      "--offline",
      "--ignore-scripts",
    ]);
    assertPnpmSuccess(install, "approved lifecycle install");
    const build = runPnpm(root, ["--filter", "@fixture/native", "run", "build"], {
      SENTINEL_PATH: sentinel,
    });
    assertPnpmSuccess(build, "approved fixture build");
    assert.equal(await exists(sentinel), true, `${build.stdout}\n${build.stderr}`);
  } finally {
    await removeFixture(root);
  }
});
