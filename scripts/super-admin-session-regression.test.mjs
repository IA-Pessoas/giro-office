import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserSourcePattern = /\.(?:js|jsx|mjs|mts|ts|tsx)$/u;
const testSourcePattern = /\.(?:spec|test)\.[^.]+$/u;
const runnerSourcePattern = /^run-.*\.(?:js|mjs|mts|ts)$/u;
const testDirectoryNames = new Set(["__tests__", "test", "tests"]);
const workflowOnPattern = /^(?:on|"on"|'on'):\s*/u;
const legacyBrowserAuthPatterns = [
  /cw\.token/u,
  /jwt-decode/u,
  /jwtDecode/u,
  /(?:\.\s*Authorization|\[\s*["']Authorization["']\s*\])\s*=/iu,
  /(?:^|[{,]\s*)(?:Authorization|["']Authorization["'])\s*:/imu,
  /\.\s*set\s*\(\s*["']Authorization["']\s*,/iu,
  /(?:["'`]Bearer\s+\$\{|["']Bearer\s+["']\s*\+)/iu,
  /support_mode/u,
  /support_session/u,
];

async function collectBrowserSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !testDirectoryNames.has(entry.name)) {
      files.push(...(await collectBrowserSources(entryPath)));
    } else if (
      browserSourcePattern.test(entry.name) &&
      !testSourcePattern.test(entry.name) &&
      !runnerSourcePattern.test(entry.name)
    ) {
      files.push(entryPath);
    }
  }

  return files;
}

async function readPlatformBrowserSources(root = repositoryRoot) {
  const sourceFiles = [
    ...(await collectBrowserSources(path.join(root, "app", "src", "modules", "superAdmin"))),
    ...(await collectBrowserSources(path.join(root, "app", "src", "pages", "super-admin"))),
    path.join(root, "app", "src", "context", "AuthContext.tsx"),
    path.join(root, "app", "src", "shared", "services", "api.ts"),
    path.join(root, "app", "src", "shared", "services", "apiClient.ts"),
    path.join(root, "packages", "api", "src", "client.ts"),
  ];

  return Promise.all(
    sourceFiles.sort().map(async (filePath) => ({
      path: path.relative(root, filePath).split(path.sep).join("/"),
      source: await readFile(filePath, "utf8"),
    })),
  );
}

function hasLegacyBrowserAuth(source) {
  return legacyBrowserAuthPatterns.some((pattern) => pattern.test(source));
}

async function readOptional(relativePath) {
  try {
    return await readFile(path.join(repositoryRoot, relativePath), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function pullRequestBranches(workflow) {
  const lines = workflow.split(/\r?\n/u);
  const pullRequestIndex = lines.indexOf("  pull_request:");
  const branchesIndex = lines.findIndex(
    (line, index) =>
      index > pullRequestIndex &&
      line === "    branches:" &&
      !lines.slice(pullRequestIndex + 1, index).some((candidate) => /^ {2}\S/u.test(candidate)),
  );

  if (pullRequestIndex < 0 || branchesIndex < 0) {
    return [];
  }

  const branches = [];
  for (const line of lines.slice(branchesIndex + 1)) {
    if (!line.startsWith("      - ")) {
      break;
    }
    branches.push(line.slice(8).replace(/^["']|["']$/gu, ""));
  }
  return branches;
}

function workflowEvents(workflow) {
  const lines = workflow.split(/\r?\n/u);
  const onIndex = lines.findIndex((line) => workflowOnPattern.test(line));
  if (onIndex < 0) {
    return [];
  }

  const inlineValue = lines[onIndex].replace(workflowOnPattern, "").trim();
  if (inlineValue.startsWith("[") && inlineValue.endsWith("]")) {
    return inlineValue
      .slice(1, -1)
      .split(",")
      .map((event) => event.trim().replace(/^["']|["']$/gu, ""))
      .filter(Boolean);
  }
  if (inlineValue.startsWith("{") && inlineValue.endsWith("}")) {
    const events = [];
    const source = inlineValue.slice(1, -1);
    let entryStart = 0;
    let depth = 0;
    let quote = "";

    for (let index = 0; index <= source.length; index += 1) {
      const character = source[index] ?? ",";
      if (quote) {
        if (character === quote && source[index - 1] !== "\\") {
          quote = "";
        }
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "{" || character === "[") {
        depth += 1;
      } else if (character === "}" || character === "]") {
        depth -= 1;
      } else if (character === "," && depth === 0) {
        const entry = source.slice(entryStart, index).trim();
        const match = entry.match(/^(?:"([\w-]+)"|'([\w-]+)'|([\w-]+))\s*:/u);
        if (match) {
          events.push(match[1] ?? match[2] ?? match[3]);
        }
        entryStart = index + 1;
      }
    }
    return events;
  }
  if (inlineValue) {
    return [inlineValue.replace(/^["']|["']$/gu, "")];
  }

  const events = [];

  for (const line of lines.slice(onIndex + 1)) {
    if (/^\S/u.test(line)) {
      break;
    }
    const match = line.match(/^ {2}(?:"([\w-]+)"|'([\w-]+)'|([\w-]+))\s*:/u);
    if (match) {
      events.push(match[1] ?? match[2] ?? match[3]);
    }
  }
  return events;
}

function assertOnlyPullRequestEvent(workflow) {
  assert.deepEqual(
    workflowEvents(workflow),
    ["pull_request"],
    "workflow must trigger on only pull_request",
  );
}

test("Super Admin browser sources contain no legacy auth transport", async () => {
  const sources = await readPlatformBrowserSources();
  assert.ok(sources.length > 5, "expected the Super Admin browser surface to be scanned");

  for (const { path: relativePath, source } of sources) {
    assert.ok(
      !hasLegacyBrowserAuth(source),
      `${relativePath} contains legacy browser auth transport`,
    );
  }
});

test("browser source discovery includes executable modules and excludes test runners", async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "super-admin-browser-sources-"));

  try {
    const fixtureFiles = [
      "app/src/modules/superAdmin/feature.mjs",
      "app/src/modules/superAdmin/run-browser-tests.mjs",
      "app/src/modules/superAdmin/feature.test.ts",
      "app/src/pages/super-admin/index.mts",
      "app/src/context/AuthContext.tsx",
      "app/src/shared/services/api.ts",
      "app/src/shared/services/apiClient.ts",
      "packages/api/src/client.ts",
    ];
    await Promise.all(
      fixtureFiles.map(async (relativePath) => {
        const filePath = path.join(fixtureRoot, relativePath);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, "export {};\n", "utf8");
      }),
    );

    const sources = await readPlatformBrowserSources(fixtureRoot);
    const paths = sources.map((source) => source.path);

    assert.ok(paths.includes("app/src/modules/superAdmin/feature.mjs"));
    assert.ok(paths.includes("app/src/pages/super-admin/index.mts"));
    assert.ok(paths.includes("packages/api/src/client.ts"));
    assert.ok(!paths.includes("app/src/modules/superAdmin/run-browser-tests.mjs"));
    assert.ok(!paths.includes("app/src/modules/superAdmin/feature.test.ts"));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("legacy auth detection covers Authorization properties and setters without prose matches", () => {
  for (const source of [
    "headers.Authorization = token;",
    "headers.authorization = token;",
    'headers["Authorization"] = token;',
    "const headers = { Authorization: token };",
    'headers.set("Authorization", token);',
    'headers.set("authorization", token);',
    "const authHeader = `Bearer $" + "{token}`;",
    "const authHeader = `bearer $" + "{token}`;",
    'const authHeader = "Bearer " + token;',
  ]) {
    assert.ok(hasLegacyBrowserAuth(source), `expected legacy auth marker in: ${source}`);
  }

  for (const source of [
    'const AuthorizationHelp = "Use an HTTP-only session";',
    'const description = "Authorization rules";',
    'const description = "Bearer authentication is disabled";',
  ]) {
    assert.ok(!hasLegacyBrowserAuth(source), `unexpected legacy auth marker in: ${source}`);
  }
});

test("isolated CI targets only the Super Admin integration branch", async () => {
  const workflow = await readOptional(".github/workflows/super-admin-v2-ci.yml");

  assert.ok(workflow, "expected the isolated Super Admin workflow to exist");
  assertOnlyPullRequestEvent(workflow);
  assert.deepEqual(pullRequestBranches(workflow), ["feature/super-admin-v2-develop"]);
  assert.doesNotMatch(workflow, /branches:\s*\[?\s*develop(?:\s|,|\])/u);
});

test("workflow event discovery recognizes inline triggers and rejects every extra event", () => {
  assert.deepEqual(workflowEvents("on: pull_request\n"), ["pull_request"]);
  assert.deepEqual(workflowEvents("on: [pull_request, push]\n"), ["pull_request", "push"]);
  assert.deepEqual(workflowEvents("on: { pull_request: {}, push: {} }\n"), [
    "pull_request",
    "push",
  ]);
  assert.deepEqual(workflowEvents("on: { \"pull_request\": {}, 'push': {} }\n"), [
    "pull_request",
    "push",
  ]);
  assert.deepEqual(workflowEvents('"on": { "pull_request": {} }\n'), ["pull_request"]);
  assert.deepEqual(workflowEvents("on:\n  \"pull_request\":\n  'push': {}\n"), [
    "pull_request",
    "push",
  ]);
  assert.deepEqual(workflowEvents("'on':\n  'pull_request': {}\n"), ["pull_request"]);
  assert.throws(
    () => assertOnlyPullRequestEvent("on: [pull_request, push]\n"),
    /only pull_request/u,
  );
  assert.throws(
    () => assertOnlyPullRequestEvent("on:\n  pull_request:\n  schedule:\n"),
    /only pull_request/u,
  );
  assert.throws(
    () => assertOnlyPullRequestEvent('on: { "pull_request": {}, "schedule": {} }\n'),
    /only pull_request/u,
  );
});
