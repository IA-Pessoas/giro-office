import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditDeveloperEndpoint } from "./developer-endpoint-audit.mjs";

const settingsPaths = {
  win32: "AppData/Roaming/Code/User/settings.json",
  darwin: "Library/Application Support/Code/User/settings.json",
  linux: ".config/Code/User/settings.json",
};

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function createProfile({ platform, settings, extensions = [], gitConfig }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "giro-endpoint-audit-"));
  const settingsPath = path.join(root, settingsPaths[platform]);
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings), "utf8");

  for (const extension of extensions) {
    await mkdir(path.join(root, ".vscode", "extensions", extension), { recursive: true });
  }

  if (gitConfig) {
    const gitConfigPath = path.join(root, ".git", "config");
    await mkdir(path.dirname(gitConfigPath), { recursive: true });
    await writeFile(gitConfigPath, gitConfig, "utf8");
  }

  return root;
}

test("reports a compliant Windows profile without leaking its path", async (t) => {
  const root = await createProfile({
    platform: "win32",
    settings: {
      "security.workspace.trust.enabled": true,
      "task.allowAutomaticTasks": "off",
    },
    extensions: ["biomejs.biome-2.4.5"],
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await auditDeveloperEndpoint({ homeDirectory: root, platform: "win32" });

  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(escapeRegex(root), "u"));
});

test("reports drift without leaking source values or paths", async (t) => {
  const root = await createProfile({
    platform: "linux",
    settings: {
      "security.workspace.trust.enabled": false,
      "task.allowAutomaticTasks": "on",
    },
    extensions: ["unknown.publisher-1.0.0"],
    gitConfig: "[core]\n hooksPath = /private/custom-hooks\n",
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await auditDeveloperEndpoint({ homeDirectory: root, platform: "linux" });

  assert.deepEqual(
    report.findings.map(({ ruleId }) => ruleId),
    [
      "editor.workspace-trust-disabled",
      "editor.automatic-tasks-enabled",
      "extension.unapproved",
      "git.custom-hooks-path",
    ],
  );
  assert.doesNotMatch(
    JSON.stringify(report),
    new RegExp(`${escapeRegex(root)}|private/custom-hooks|unknown\\.publisher`, "u"),
  );
});

test("reports malformed settings without returning their content", async (t) => {
  const root = await createProfile({ platform: "darwin", settings: {} });
  const settingsPath = path.join(root, settingsPaths.darwin);
  await writeFile(settingsPath, "{ credentials: private-value", "utf8");
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await auditDeveloperEndpoint({ homeDirectory: root, platform: "darwin" });

  assert.deepEqual(report.findings.map(({ ruleId }) => ruleId), ["editor.settings-invalid"]);
  assert.doesNotMatch(JSON.stringify(report), /private-value|credentials/u);
});
