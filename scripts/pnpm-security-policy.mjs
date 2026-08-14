import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MINIMUM_PNPM = Object.freeze({ major: 10, minor: 26, patch: 0 });
const SUPPORTED_SETTINGS = new Set([
  "packages",
  "minimumReleaseAge",
  "trustPolicy",
  "blockExoticSubdeps",
  "strictDepBuilds",
  "dangerouslyAllowAllBuilds",
  "allowBuilds",
]);
const UNSUPPORTED_SETTINGS = new Set(["minimumReleaseAgeStrict", "trustLockfile"]);

class PolicyError extends Error {
  constructor(message, code, line = 0) {
    super(message);
    this.code = code;
    this.line = line;
  }
}

function parseScalar(value, line) {
  if (value === "{}") return {};
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/u.test(value)) return Number(value);
  if (/^(?:"(?:[^"\\]|\\.)*"|'[^']*')$/u.test(value)) return value.slice(1, -1);
  if (value.length > 0) return value;
  throw new PolicyError("malformed scalar", "MALFORMED_SETTING", line);
}

function stripComment(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#")) return "";
  return line.replace(/\s+#.*$/u, "");
}

export function parsePnpmVersion(packageManager) {
  if (typeof packageManager !== "string") return null;
  const match = /^pnpm@(\d+)\.(\d+)\.(\d+)$/u.exec(packageManager);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function readWorkspacePolicy(source) {
  if (typeof source !== "string") {
    throw new PolicyError("workspace policy must be text", "MALFORMED_WORKSPACE_POLICY");
  }

  const result = {};
  let nestedKey = null;
  const lines = source.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = stripComment(lines[index]);
    if (!line.trim()) continue;
    if (line.includes("\t")) {
      throw new PolicyError(
        "tabs are not supported in workspace policy",
        "MALFORMED_SETTING",
        lineNumber,
      );
    }

    const indentation = line.length - line.trimStart().length;
    if (indentation !== 0 && indentation !== 2) {
      throw new PolicyError(
        "workspace policy indentation must be two spaces",
        "MALFORMED_SETTING",
        lineNumber,
      );
    }

    if (indentation === 2 && line.trimStart().startsWith("- ")) {
      if (nestedKey !== "packages" || !Array.isArray(result.packages)) {
        throw new PolicyError("sequence has no packages parent", "MALFORMED_SETTING", lineNumber);
      }
      result.packages.push(parseScalar(line.trimStart().slice(2).trim(), lineNumber));
      continue;
    }

    const match = /^\s*([^:#][^:]*):(?:\s*(.*))?$/u.exec(line);
    if (!match) {
      throw new PolicyError(
        "workspace policy line must be a mapping",
        "MALFORMED_SETTING",
        lineNumber,
      );
    }

    const rawKey = match[1].trim();
    const key = /^(?:"(?:[^"\\]|\\.)*"|'[^']*')$/u.test(rawKey) ? rawKey.slice(1, -1) : rawKey;
    const rawValue = match[2] ?? "";
    if (!key || key.includes("\r")) {
      throw new PolicyError("workspace policy key is malformed", "MALFORMED_SETTING", lineNumber);
    }

    if (indentation === 0) {
      if (Object.hasOwn(result, key)) {
        throw new PolicyError(`duplicate setting ${key}`, "DUPLICATE_SETTING", lineNumber);
      }
      if (rawValue === "") {
        result[key] = key === "packages" ? [] : {};
        nestedKey = key;
      } else {
        result[key] = parseScalar(rawValue, lineNumber);
        nestedKey = null;
      }
      continue;
    }

    if (!nestedKey || !Object.hasOwn(result, nestedKey) || typeof result[nestedKey] !== "object") {
      throw new PolicyError(
        "nested setting has no mapping parent",
        "MALFORMED_SETTING",
        lineNumber,
      );
    }
    if (Object.hasOwn(result[nestedKey], key)) {
      throw new PolicyError(
        `duplicate setting ${nestedKey}.${key}`,
        "DUPLICATE_SETTING",
        lineNumber,
      );
    }
    if (rawValue === "") {
      throw new PolicyError("nested setting needs a scalar value", "MALFORMED_SETTING", lineNumber);
    }
    result[nestedKey][key] = parseScalar(rawValue, lineNumber);
  }

  return result;
}

function finding(rule, path, line, message, severity = "high") {
  return { rule, path, line, severity, message };
}

function normalizeWorkflowSources(workflowSources) {
  if (!workflowSources) return [];
  if (Array.isArray(workflowSources)) return workflowSources;
  if (typeof workflowSources === "object") {
    return Object.entries(workflowSources).map(([path, source]) => ({ path, source }));
  }
  return [];
}

function collectDependencyValues(value, path, findings) {
  if (typeof value === "string") {
    if (/^(?:git\+|git:|github:|https?:\/\/|file:|link:)/iu.test(value)) {
      findings.push(
        finding("EXOTIC_SOURCE", path, 0, "dependency source uses a non-registry protocol"),
      );
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    collectDependencyValues(child, `${path}.${key}`, findings);
  }
}

function scanWorkflowSources(sources, findings) {
  for (const entry of sources) {
    const path = typeof entry?.path === "string" ? entry.path : "workflow.yml";
    const source = typeof entry?.source === "string" ? entry.source : "";
    const lines = source.split(/\r?\n/u);
    const active = lines.map((raw) => stripComment(raw));
    const activeText = active.join("\n");

    if (/\b(?:npm|yarn)\s+(?:ci|install|add)\b/iu.test(activeText)) {
      findings.push(
        finding(
          "PACKAGE_MANAGER_MISMATCH",
          path,
          0,
          "workflow must use the pinned pnpm package manager",
        ),
      );
    }

    if (
      /uses:\s*actions\/checkout@/u.test(activeText) &&
      !/persist-credentials:\s*false/u.test(activeText)
    ) {
      findings.push(
        finding("CHECKOUT_CREDENTIALS", path, 0, "checkout must disable persisted credentials"),
      );
    }

    for (let index = 0; index < active.length; index += 1) {
      const line = active[index];
      if (!line.trim()) continue;
      if (
        /(?:secrets\.)?(?:prod(?:uction)?|deploy|admin)[_-]?(?:token|key|secret)\b/iu.test(line)
      ) {
        findings.push(
          finding(
            "SENSITIVE_TOKEN",
            path,
            index + 1,
            "installation workflow references a production, deploy, or admin token name",
          ),
        );
      }

      if (
        /\b(?:corepack\s+)?pnpm\s+(?:install|i)\b/iu.test(line) &&
        !/--frozen-lockfile\b/u.test(line)
      ) {
        findings.push(
          finding(
            "FROZEN_LOCKFILE",
            path,
            index + 1,
            "dependency installation must use --frozen-lockfile",
          ),
        );
      }
    }
  }
}

function compareVersion(version, minimum) {
  return (
    version.major > minimum.major ||
    (version.major === minimum.major && version.minor > minimum.minor) ||
    (version.major === minimum.major &&
      version.minor === minimum.minor &&
      version.patch >= minimum.patch)
  );
}

function isValidBuildPackageName(name) {
  return /^(?:[a-z0-9][a-z0-9._-]*|@[a-z0-9._-]+\/[a-z0-9][a-z0-9._-]*)$/u.test(name);
}

export function validatePnpmPolicy({ packageJson, workspaceYaml, workflowSources } = {}) {
  const findings = [];
  const packageData = packageJson && typeof packageJson === "object" ? packageJson : {};
  let policy = workspaceYaml && typeof workspaceYaml === "object" ? workspaceYaml : null;

  if (!policy) {
    try {
      policy = readWorkspacePolicy(workspaceYaml ?? "");
    } catch (error) {
      findings.push(
        finding(
          error.code ?? "MALFORMED_WORKSPACE_POLICY",
          "pnpm-workspace.yaml",
          error.line ?? 0,
          "workspace policy is malformed",
        ),
      );
      policy = {};
    }
  }

  const packageManager = packageData.packageManager;
  if (typeof packageManager !== "string" || !packageManager.startsWith("pnpm@")) {
    findings.push(
      finding(
        "PACKAGE_MANAGER_MISMATCH",
        "package.json",
        0,
        "package.json must pin pnpm with packageManager",
      ),
    );
  } else {
    const version = parsePnpmVersion(packageManager);
    if (!version || !compareVersion(version, MINIMUM_PNPM)) {
      findings.push(
        finding("PNPM_VERSION", "package.json", 0, "packageManager must pin pnpm 10.26.0 or newer"),
      );
    }
  }

  for (const key of Object.keys(policy)) {
    if (!SUPPORTED_SETTINGS.has(key)) {
      findings.push(
        finding(
          "UNSUPPORTED_SETTING",
          "pnpm-workspace.yaml",
          0,
          UNSUPPORTED_SETTINGS.has(key)
            ? "setting is unsupported by the pinned pnpm version"
            : "setting is not part of the reviewed pnpm security policy",
        ),
      );
    }
  }

  if (!Number.isInteger(policy.minimumReleaseAge) || policy.minimumReleaseAge < 1440) {
    findings.push(
      finding(
        "MINIMUM_RELEASE_AGE",
        "pnpm-workspace.yaml",
        0,
        "minimumReleaseAge must be at least 1440 minutes",
      ),
    );
  }
  if (policy.trustPolicy !== "no-downgrade") {
    findings.push(
      finding("TRUST_POLICY", "pnpm-workspace.yaml", 0, "trustPolicy must be no-downgrade"),
    );
  }
  if (policy.blockExoticSubdeps !== true) {
    findings.push(
      finding("BLOCK_EXOTIC_SUBDEPS", "pnpm-workspace.yaml", 0, "blockExoticSubdeps must be true"),
    );
  }
  if (policy.strictDepBuilds !== true) {
    findings.push(
      finding("STRICT_DEP_BUILDS", "pnpm-workspace.yaml", 0, "strictDepBuilds must be true"),
    );
  }
  if (policy.dangerouslyAllowAllBuilds !== false) {
    findings.push(
      finding(
        "DANGEROUSLY_ALLOW_ALL_BUILDS",
        "pnpm-workspace.yaml",
        0,
        "dangerouslyAllowAllBuilds must be false",
      ),
    );
  }
  const allowBuilds = policy.allowBuilds;
  if (!allowBuilds || typeof allowBuilds !== "object" || Array.isArray(allowBuilds)) {
    findings.push(
      finding(
        "ALLOW_BUILDS",
        "pnpm-workspace.yaml",
        0,
        "allowBuilds must be an explicit package map",
      ),
    );
  } else {
    for (const [packageName, approved] of Object.entries(allowBuilds)) {
      if (!isValidBuildPackageName(packageName)) {
        findings.push(
          finding(
            "ALLOW_BUILDS_PACKAGE",
            "pnpm-workspace.yaml",
            0,
            "allowBuilds contains an invalid package name",
          ),
        );
      }
      if (typeof approved !== "boolean") {
        findings.push(
          finding(
            "ALLOW_BUILDS_VALUE",
            "pnpm-workspace.yaml",
            0,
            "allowBuilds values must be booleans",
          ),
        );
      }
    }
  }

  for (const key of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    collectDependencyValues(packageData[key], `package.json.${key}`, findings);
  }
  collectDependencyValues(packageData.pnpm?.overrides, "package.json.pnpm.overrides", findings);

  scanWorkflowSources(normalizeWorkflowSources(workflowSources), findings);

  return findings.sort((left, right) =>
    `${left.path}:${left.line}:${left.rule}`.localeCompare(
      `${right.path}:${right.line}:${right.rule}`,
    ),
  );
}

async function readWorkflowSources(root) {
  const workflowRoot = join(root, ".github", "workflows");
  let names;
  try {
    names = await readdir(workflowRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = names
    .filter((entry) => entry.isFile() && /\.(?:yml|yaml)$/iu.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    files.map(async (name) => ({
      path: relative(root, join(workflowRoot, name)).replaceAll("\\", "/"),
      source: await readFile(join(workflowRoot, name), "utf8"),
    })),
  );
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const root = resolve(argumentValue(process.argv.slice(2), "--root") ?? process.cwd());
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const workspaceYaml = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
  const workflowSources = await readWorkflowSources(root);
  const findings = validatePnpmPolicy({ packageJson, workspaceYaml, workflowSources });
  const report = {
    ok: findings.length === 0,
    generatedAt: new Date().toISOString(),
    findings,
    summary: {
      total: findings.length,
      rules: [...new Set(findings.map(({ rule }) => rule))].sort(),
    },
  };
  const reportPath = argumentValue(process.argv.slice(2), "--report");
  if (reportPath)
    await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
