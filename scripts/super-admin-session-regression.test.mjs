import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserSourcePattern = /\.(?:js|jsx|ts|tsx)$/u;
const testSourcePattern = /\.(?:spec|test)\.[^.]+$/u;

async function collectBrowserSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectBrowserSources(entryPath)));
    } else if (browserSourcePattern.test(entry.name) && !testSourcePattern.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

async function readPlatformBrowserSources() {
  const sourceFiles = [
    ...(await collectBrowserSources(
      path.join(repositoryRoot, "app", "src", "modules", "superAdmin"),
    )),
    ...(await collectBrowserSources(
      path.join(repositoryRoot, "app", "src", "pages", "super-admin"),
    )),
    path.join(repositoryRoot, "app", "src", "context", "AuthContext.tsx"),
    path.join(repositoryRoot, "app", "src", "shared", "services", "api.ts"),
    path.join(repositoryRoot, "app", "src", "shared", "services", "apiClient.ts"),
  ];

  return Promise.all(
    sourceFiles.sort().map(async (filePath) => ({
      path: path.relative(repositoryRoot, filePath),
      source: await readFile(filePath, "utf8"),
    })),
  );
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
  const onIndex = lines.indexOf("on:");
  const events = [];

  for (const line of lines.slice(onIndex + 1)) {
    if (/^\S/u.test(line)) {
      break;
    }
    const match = line.match(/^ {2}([\w-]+):\s*$/u);
    if (match) {
      events.push(match[1]);
    }
  }
  return events;
}

test("Super Admin browser sources contain no legacy auth transport", async () => {
  const sources = await readPlatformBrowserSources();
  assert.ok(sources.length > 5, "expected the Super Admin browser surface to be scanned");

  for (const { path: relativePath, source } of sources) {
    assert.doesNotMatch(
      source,
      /cw\.token|jwt-decode|jwtDecode|Authorization\s*=|Bearer\s|support_mode|support_session/u,
      `${relativePath} contains legacy browser auth transport`,
    );
  }
});

test("isolated CI targets only the Super Admin integration branch", async () => {
  const workflow = await readOptional(".github/workflows/super-admin-v2-ci.yml");

  assert.ok(workflow, "expected the isolated Super Admin workflow to exist");
  assert.deepEqual(workflowEvents(workflow), ["pull_request"]);
  assert.deepEqual(pullRequestBranches(workflow), ["feature/super-admin-v2-develop"]);
  assert.doesNotMatch(workflow, /branches:\s*\[?\s*develop(?:\s|,|\])/u);
});
