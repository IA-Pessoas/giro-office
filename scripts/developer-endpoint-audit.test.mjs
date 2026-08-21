import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditDeveloperEndpoint } from "./developer-endpoint-audit.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settingsPaths = {
  win32: "AppData/Roaming/Code/User/settings.json",
  darwin: "Library/Application Support/Code/User/settings.json",
  linux: ".config/Code/User/settings.json",
};
const compliantSettings = {
  "security.workspace.trust.enabled": true,
  "task.allowAutomaticTasks": "off",
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
    settings: compliantSettings,
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

test("fails closed when a settings path is a directory", async (t) => {
  const root = await createProfile({ platform: "win32", settings: compliantSettings });
  const settingsPath = path.join(root, settingsPaths.win32);
  await rm(settingsPath);
  await mkdir(settingsPath);
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await auditDeveloperEndpoint({ homeDirectory: root, platform: "win32" });

  assert.deepEqual(report.findings.map(({ ruleId, scope }) => ({ ruleId, scope })), [
    { ruleId: "audit.profile-data-unreadable", scope: "vscode-user-settings" },
  ]);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(escapeRegex(root), "u"));
});

test("fails closed when profile data is a symbolic link", async (t) => {
  const root = await createProfile({ platform: "linux", settings: compliantSettings });
  const extensionsPath = path.join(root, ".vscode", "extensions");
  const targetPath = path.join(root, "reviewed-extensions");
  await mkdir(targetPath);
  await mkdir(path.dirname(extensionsPath), { recursive: true });
  await symlink(targetPath, extensionsPath, "junction");
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await auditDeveloperEndpoint({
    homeDirectory: root,
    platform: "linux",
    workspace: path.join(root, "clean-workspace"),
  });

  assert.deepEqual(report.findings.map(({ ruleId, scope }) => ({ ruleId, scope })), [
    { ruleId: "audit.profile-data-unreadable", scope: "editor-extensions" },
  ]);
});

test("fails closed when an extension directory is irregular", async (t) => {
  const root = await createProfile({ platform: "darwin", settings: compliantSettings });
  const extensionsPath = path.join(root, ".vscode", "extensions");
  await mkdir(path.dirname(extensionsPath), { recursive: true });
  await writeFile(extensionsPath, "not-a-directory", "utf8");
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await auditDeveloperEndpoint({ homeDirectory: root, platform: "darwin" });

  assert.deepEqual(report.findings.map(({ ruleId, scope }) => ({ ruleId, scope })), [
    { ruleId: "audit.profile-data-unreadable", scope: "editor-extensions" },
  ]);
});

test("fails closed when profile paths cannot be read", async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "giro-endpoint-workspace-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));

  const report = await auditDeveloperEndpoint({
    homeDirectory: "\0",
    platform: "win32",
    workspace,
  });

  assert.deepEqual(report.findings.map(({ ruleId }) => ruleId), [
    "audit.profile-data-unreadable",
    "audit.profile-data-unreadable",
    "audit.profile-data-unreadable",
    "audit.profile-data-unreadable",
  ]);
  assert.doesNotMatch(JSON.stringify(report), /\\u0000/u);
});

test("fails closed when workspace git metadata is a symbolic link", async (t) => {
  const root = await createProfile({
    platform: "win32",
    settings: compliantSettings,
    extensions: ["biomejs.biome-2.4.5"],
  });
  const workspace = await mkdtemp(path.join(os.tmpdir(), "giro-endpoint-workspace-"));
  const gitConfigPath = path.join(workspace, ".git", "config");
  const targetPath = path.join(workspace, "reviewed-git-metadata");
  await mkdir(path.dirname(gitConfigPath), { recursive: true });
  await mkdir(targetPath);
  await symlink(targetPath, gitConfigPath, "junction");
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(workspace, { recursive: true, force: true })]));

  const report = await auditDeveloperEndpoint({
    homeDirectory: root,
    platform: "win32",
    workspace,
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.findings.map(({ ruleId, scope }) => ({ ruleId, scope })), [
    { ruleId: "audit.workspace-metadata-unreadable", scope: "git-config" },
  ]);
  assert.doesNotMatch(
    JSON.stringify(report),
    new RegExp(`${escapeRegex(root)}|${escapeRegex(workspace)}`, "u"),
  );
});

test("fails closed when the .git ancestor is a symbolic link", async (t) => {
  const root = await createProfile({
    platform: "win32",
    settings: compliantSettings,
    extensions: ["biomejs.biome-2.4.5"],
  });
  const workspace = await mkdtemp(path.join(os.tmpdir(), "giro-endpoint-workspace-"));
  const externalGit = path.join(workspace, "external-git-metadata");
  await mkdir(path.join(externalGit, "hooks"), { recursive: true });
  await writeFile(path.join(externalGit, "config"), "[core]\n", "utf8");
  await symlink(externalGit, path.join(workspace, ".git"), "junction");
  t.after(() =>
    Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(workspace, { recursive: true, force: true }),
    ]),
  );

  const report = await auditDeveloperEndpoint({
    homeDirectory: root,
    platform: "win32",
    workspace,
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.findings.map(({ ruleId, scope }) => ({ ruleId, scope })), [
    { ruleId: "audit.workspace-metadata-unreadable", scope: "git-hooks" },
    { ruleId: "audit.workspace-metadata-unreadable", scope: "git-config" },
  ]);
  assert.doesNotMatch(
    JSON.stringify(report),
    new RegExp(`${escapeRegex(root)}|${escapeRegex(workspace)}|external-git-metadata`, "u"),
  );
});

test("fails closed for invalid policy fields without returning policy values", async (t) => {
  const root = await createProfile({
    platform: "win32",
    settings: compliantSettings,
    extensions: ["biomejs.biome-2.4.5"],
  });
  const policyPath = path.join(root, "editor-policy.json");
  await writeFile(
    policyPath,
    JSON.stringify({
      version: 1,
      requiredSettings: compliantSettings,
      approvedExtensions: [
        {
          id: "",
          owner: "",
          minimumVersion: "2.4.5",
          updatePolicy: "",
          reviewDate: "2026-02-31",
        },
      ],
    }),
    "utf8",
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await auditDeveloperEndpoint({
    homeDirectory: root,
    platform: "win32",
    policyPath,
  });

  assert.deepEqual(report.findings.map(({ ruleId }) => ruleId), ["policy.invalid"]);
  assert.doesNotMatch(JSON.stringify(report), /2026-02-31/u);
});

test("reports an approved extension below its minimum version", async (t) => {
  const root = await createProfile({
    platform: "linux",
    settings: compliantSettings,
    extensions: ["biomejs.biome-2.4.4"],
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await auditDeveloperEndpoint({ homeDirectory: root, platform: "linux" });

  assert.deepEqual(report.findings.map(({ ruleId }) => ruleId), ["extension.unapproved"]);
});

test("documents the read-only endpoint control rollout", async () => {
  const guide = await readFile(
    path.join(repositoryRoot, "docs/security/editor-endpoint-controls.md"),
    "utf8",
  );

  assert.match(guide, /Restricted Mode/u);
  assert.match(guide, /task\.allowAutomaticTasks/u);
  assert.match(guide, /read-only/u);
  assert.match(guide, /ticket|alert/iu);
});
