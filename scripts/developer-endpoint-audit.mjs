import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROFILE_PATHS = {
  win32: [
    ["AppData/Roaming/Code/User/settings.json", "vscode-user-settings"],
    ["AppData/Roaming/Cursor/User/settings.json", "cursor-user-settings"],
  ],
  darwin: [
    ["Library/Application Support/Code/User/settings.json", "vscode-user-settings"],
    ["Library/Application Support/Cursor/User/settings.json", "cursor-user-settings"],
  ],
  linux: [
    [".config/Code/User/settings.json", "vscode-user-settings"],
    [".config/Cursor/User/settings.json", "cursor-user-settings"],
  ],
};
const EXTENSION_DIRECTORIES = [".vscode/extensions", ".cursor/extensions"];
const REMEDIATION = {
  "audit.invalid-arguments": "Use apenas as opções documentadas para executar a auditoria.",
  "editor.automatic-tasks-enabled": "Defina task.allowAutomaticTasks como off.",
  "editor.settings-invalid": "Restaure settings.json a partir de uma configuração revisada.",
  "editor.workspace-trust-disabled": "Habilite security.workspace.trust.enabled.",
  "extension.unapproved": "Remova ou revise a extensão fora da política aprovada.",
  "git.custom-hooks-path": "Remova core.hooksPath ou revise o caminho com a equipe de segurança.",
  "policy.invalid": "Restaure a política versionada para um formato aprovado.",
};
const SETTING_RULES = [
  ["security.workspace.trust.enabled", "editor.workspace-trust-disabled"],
  ["task.allowAutomaticTasks", "editor.automatic-tasks-enabled"],
];
const DEFAULT_POLICY_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".github",
  "security",
  "editor-endpoint-policy.json",
);

function finding(ruleId, scope) {
  return { ruleId, scope, remediation: REMEDIATION[ruleId] };
}

async function readRegularFile(filePath) {
  try {
    const stats = await lstat(filePath);
    return stats.isFile() && !stats.isSymbolicLink() ? await readFile(filePath, "utf8") : undefined;
  } catch {
    return undefined;
  }
}

async function readDirectoryNames(directoryPath) {
  try {
    const stats = await lstat(directoryPath);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return [];
    const entries = await readdir(directoryPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function isVersion(value) {
  return /^\d+(?:\.\d+){1,2}(?:-[0-9A-Za-z.-]+)?$/u.test(value);
}

function versionAtLeast(actual, minimum) {
  const actualParts = actual.split("-")[0].split(".").map(Number);
  const minimumParts = minimum.split("-")[0].split(".").map(Number);
  for (let index = 0; index < Math.max(actualParts.length, minimumParts.length); index += 1) {
    const difference = (actualParts[index] ?? 0) - (minimumParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return !actual.includes("-") || minimum.includes("-");
}

function parseExtension(directoryName) {
  const match = /^(.*)-(\d+(?:\.\d+){1,2}(?:-[0-9A-Za-z.-]+)?)$/u.exec(directoryName);
  return match ? { id: match[1], version: match[2] } : undefined;
}

function isValidPolicy(policy) {
  return (
    policy?.version === 1 &&
    policy.requiredSettings &&
    typeof policy.requiredSettings === "object" &&
    !Array.isArray(policy.requiredSettings) &&
    SETTING_RULES.every(([name]) => ["boolean", "string"].includes(typeof policy.requiredSettings[name])) &&
    Array.isArray(policy.approvedExtensions) &&
    policy.approvedExtensions.every(
      (extension) =>
        typeof extension?.id === "string" &&
        typeof extension.owner === "string" &&
        isVersion(extension.minimumVersion) &&
        typeof extension.updatePolicy === "string" &&
        /^\d{4}-\d{2}-\d{2}$/u.test(extension.reviewDate),
    )
  );
}

async function readPolicy(policyPath) {
  const source = await readRegularFile(policyPath);
  try {
    const policy = JSON.parse(source);
    return isValidPolicy(policy) ? policy : undefined;
  } catch {
    return undefined;
  }
}

function hasCustomHooksPath(gitConfig) {
  let inCoreSection = false;
  for (const line of gitConfig.split(/\r?\n/u)) {
    const section = /^\s*\[([^\]]+)\]/u.exec(line);
    if (section) {
      inCoreSection = section[1].trim().toLowerCase() === "core";
      continue;
    }
    if (inCoreSection && /^\s*hooksPath\s*=/iu.test(line)) return true;
  }
  return false;
}

async function inspectWorkspaceMetadata(workspaceDirectory) {
  await Promise.all(
    [".vscode", ".cursor", ".git/hooks"].map((relativePath) =>
      readDirectoryNames(path.join(workspaceDirectory, relativePath)),
    ),
  );
}

export async function auditDeveloperEndpoint({
  homeDirectory = os.homedir(),
  platform = process.platform,
  workspace = homeDirectory,
  policyPath = DEFAULT_POLICY_PATH,
} = {}) {
  const policy = await readPolicy(policyPath);
  const findings = [];
  let extensionsScanned = 0;

  if (!policy || !PROFILE_PATHS[platform]) {
    findings.push(finding("policy.invalid", "editor-policy"));
  } else {
    for (const [relativePath, scope] of PROFILE_PATHS[platform]) {
      const source = await readRegularFile(path.join(homeDirectory, relativePath));
      if (source === undefined) continue;

      let settings;
      try {
        settings = JSON.parse(source);
      } catch {
        findings.push(finding("editor.settings-invalid", scope));
        continue;
      }

      for (const [settingName, ruleId] of SETTING_RULES) {
        if (settings[settingName] !== policy.requiredSettings[settingName]) {
          findings.push(finding(ruleId, scope));
        }
      }
    }

    for (const directory of EXTENSION_DIRECTORIES) {
      const extensions = await readDirectoryNames(path.join(homeDirectory, directory));
      extensionsScanned += extensions.length;
      for (const extensionDirectory of extensions) {
        const extension = parseExtension(extensionDirectory);
        const approved = policy.approvedExtensions.find(({ id }) => id === extension?.id);
        if (!extension || !approved || !versionAtLeast(extension.version, approved.minimumVersion)) {
          findings.push(finding("extension.unapproved", "editor-extensions"));
        }
      }
    }
  }

  await inspectWorkspaceMetadata(workspace);
  const gitConfig = await readRegularFile(path.join(workspace, ".git", "config"));
  if (gitConfig && hasCustomHooksPath(gitConfig)) {
    findings.push(finding("git.custom-hooks-path", "git-config"));
  }

  return {
    ok: findings.length === 0,
    findings,
    summary: { profilesScanned: 1, extensionsScanned, findings: findings.length },
  };
}

function invalidArgumentsReport() {
  const findings = [finding("audit.invalid-arguments", "command-line")];
  return {
    ok: false,
    findings,
    summary: { profilesScanned: 0, extensionsScanned: 0, findings: findings.length },
  };
}

function parseArguments(args) {
  const options = {};
  const supported = new Set(["--home", "--machine-id", "--platform", "--policy", "--report", "--workspace"]);
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!supported.has(flag) || !value || value.startsWith("--")) return undefined;
    if (flag === "--home") options.homeDirectory = value;
    if (flag === "--platform") options.platform = value;
    if (flag === "--workspace") options.workspace = value;
    if (flag === "--policy") options.policyPath = value;
    if (flag === "--report") options.reportPath = value;
    index += 1;
  }
  return PROFILE_PATHS[options.platform ?? process.platform] ? options : undefined;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const report = options
    ? await auditDeveloperEndpoint(options)
    : invalidArgumentsReport();
  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (options?.reportPath) await writeFile(path.resolve(options.reportPath), output, "utf8");
  process.stdout.write(output);
  return report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
