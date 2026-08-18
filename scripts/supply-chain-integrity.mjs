import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "dist",
  "graphify-out",
  "node_modules",
]);
const EXECUTABLE_CONFIG =
  /^(?:postcss|tailwind|eslint|next|babel|vite|prettier)\.config\.(?:js|cjs|mjs|ts)$/u;
const ADDITIONAL_CONFIG_NAMES = new Set([
  ".npmrc",
  "lint-staged.config.mjs",
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tasks.json",
]);
const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avif",
  ".bmp",
  ".class",
  ".dll",
  ".gif",
  ".gz",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".tar",
  ".webp",
  ".zip",
]);
const REMEDIATION = Object.freeze({
  "allowlist.invalid-entry": "Corrija owner, reason, issue e expires antes de aceitar excecoes.",
  "command.download-execute":
    "Remova download-and-execute e fixe dependencias em artefatos revisados.",
  "command.encoded-node-eval": "Remova avaliacao codificada e use um script auditavel versionado.",
  "command.force-push": "Remova force-push de automacoes e preserve o historico protegido.",
  "config.folder-open": "Remova runOn: folderOpen de tarefas e comandos do editor.",
  "config.long-line": "Divida a linha de configuracao para manter o conteudo revisavel.",
  "font.invalid-magic": "Substitua o arquivo por uma fonte WOFF/WOFF2 valida.",
  "ioc.bracketed-global-assignment":
    "Remova a atribuicao global suspeita e revise a origem do arquivo.",
  "ioc.global-assignment": "Remova a atribuicao global suspeita e revise a origem do arquivo.",
  "ioc.incident-marker": "Remova o marcador de incidente e revise a origem do arquivo.",
});
const IOC_RULES = Object.freeze([
  {
    ruleId: "ioc.global-assignment",
    pattern: /\bglobal\.[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*["'][A-Za-z0-9-]+["']/u,
  },
  {
    ruleId: "ioc.bracketed-global-assignment",
    pattern: /\bglobal\s*\[\s*["'](?:!|_V)["']\s*\]\s*=/u,
  },
  {
    ruleId: "ioc.incident-marker",
    pattern: /For only test|rmcej%otb%|Cot%3t=shtP|LAST_COMMIT_DATE|temp_auto_push\.bat/u,
  },
]);
const COMMAND_RULES = Object.freeze([
  {
    ruleId: "config.folder-open",
    pattern: /["']?runOn["']?\s*:\s*["']folderOpen["']/iu,
  },
  {
    ruleId: "command.force-push",
    pattern: /\bgit\s+push\b[^\r\n]*--force(?:-with-lease)?\b/iu,
  },
  {
    ruleId: "command.encoded-node-eval",
    pattern:
      /\bnode(?:\.exe)?\s+(?:-e|--eval)\b[^\r\n]*(?:base64|Buffer\.from|atob|fromCharCode)/iu,
  },
  {
    ruleId: "command.download-execute",
    pattern:
      /(?:\b(?:curl|wget)\b[^\r\n|]*\|\s*(?:sh|bash|node|python|perl)\b|Invoke-WebRequest[^\r\n|]*\|\s*(?:iex|Invoke-Expression)\b)/iu,
  },
]);

function normalizePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function isEnvironmentFile(name) {
  return name === ".env" || name.startsWith(".env.") || name.startsWith(".env-");
}

function isExecutableConfig(relativePath) {
  const normalized = normalizePath(relativePath);
  const name = path.posix.basename(normalized);
  return EXECUTABLE_CONFIG.test(name) || ADDITIONAL_CONFIG_NAMES.has(name) || name === "Dockerfile";
}

function isCommandSurface(relativePath) {
  const normalized = normalizePath(relativePath);
  return (
    normalized.startsWith(".github/actions/") ||
    normalized.startsWith(".github/workflows/") ||
    normalized.startsWith(".husky/") ||
    normalized.startsWith(".vscode/") ||
    normalized.startsWith(".cursor/") ||
    normalized.startsWith(".agents/") ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith("docker/") ||
    path.posix.basename(normalized) === "Dockerfile"
  );
}

function isTestArtifact(relativePath) {
  const normalized = normalizePath(relativePath);
  return normalized.startsWith("scripts/fixtures/") || /\.test\.[^.]+$/u.test(normalized);
}

function isBinary(relativePath, bytes) {
  if (BINARY_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
    return true;
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  return sample.includes(0);
}

function finding(relativePath, ruleId, blobSha, line) {
  return {
    ruleId,
    path: normalizePath(relativePath),
    ...(line === undefined ? {} : { line }),
    blobSha,
    remediation: REMEDIATION[ruleId],
  };
}

async function collectFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    if (isEnvironmentFile(entry.name)) {
      continue;
    }

    const filePath = path.join(directory, entry.name);
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) {
      continue;
    }
    if (stats.isDirectory()) {
      files.push(...(await collectFiles(root, filePath)));
    } else if (stats.isFile()) {
      files.push(filePath);
    }
  }

  return files;
}

function parseAllowlistDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && !Number.isNaN(Date.parse(`${value}T23:59:59.999Z`));
}

function validIssue(value) {
  return (
    (Number.isInteger(value) && value > 0) ||
    (typeof value === "string" && /^https:\/\/[^\s/]+(?:\/[^\s/]+)*\/issues\/\d+$/u.test(value))
  );
}

function validateAllowlistEntries(relativePath, rawEntries, now) {
  if (!Array.isArray(rawEntries)) {
    return {
      entries: [],
      findings: [finding(relativePath, "allowlist.invalid-entry", undefined, undefined)],
    };
  }

  const entries = [];
  const findings = [];
  for (const entry of rawEntries) {
    const expires = typeof entry?.expires === "string" ? entry.expires : "";
    const valid =
      typeof entry?.path === "string" &&
      entry.path !== "" &&
      !entry.path.includes("..") &&
      typeof entry?.ruleId === "string" &&
      entry.ruleId !== "" &&
      typeof entry?.owner === "string" &&
      entry.owner.trim() !== "" &&
      typeof entry?.reason === "string" &&
      entry.reason.trim() !== "" &&
      validIssue(entry?.issue) &&
      parseAllowlistDate(expires) &&
      Date.parse(`${expires}T23:59:59.999Z`) >= now;

    if (valid) {
      entries.push({
        path: normalizePath(entry.path),
        ruleId: entry.ruleId,
      });
    } else {
      findings.push(finding(relativePath, "allowlist.invalid-entry", undefined, undefined));
    }
  }

  return { entries, findings };
}

async function readAllowlist(root, allowlistPath, now) {
  if (!allowlistPath) {
    return { entries: [], findings: [] };
  }

  const resolvedPath = path.resolve(allowlistPath);
  const relativePath = isInside(root, resolvedPath)
    ? normalizePath(path.relative(root, resolvedPath))
    : path.basename(resolvedPath);
  try {
    const parsed = JSON.parse(await readFile(resolvedPath, "utf8"));
    return validateAllowlistEntries(relativePath, parsed?.entries, now);
  } catch {
    return validateAllowlistEntries(relativePath, undefined, now);
  }
}

function readInlineAllowlist(_root, entries, now) {
  return validateAllowlistEntries("inline-allowlist", entries, now);
}

function isAllowed(entries, relativePath, ruleId) {
  return entries.some(
    (entry) => entry.path === normalizePath(relativePath) && entry.ruleId === ruleId,
  );
}

export function scanBlob(relativePath, bytes, options = {}) {
  const normalizedPath = normalizePath(relativePath);
  const blobSha = createHash("sha256").update(bytes).digest("hex");
  const allowlist = options.allowlist ?? [];
  const extension = path.extname(normalizedPath).toLowerCase();
  const findings = [];

  if (extension === ".woff" || extension === ".woff2") {
    const expected = extension === ".woff" ? "wOFF" : "wOF2";
    if (
      bytes.subarray(0, 4).toString("ascii") !== expected &&
      !isAllowed(allowlist, normalizedPath, "font.invalid-magic")
    ) {
      findings.push(finding(normalizedPath, "font.invalid-magic", blobSha, undefined));
    }
    return findings;
  }

  const executableConfig = isExecutableConfig(normalizedPath);
  const commandSurface = isCommandSurface(normalizedPath);
  if (!executableConfig && !commandSurface) {
    return findings;
  }
  if (isBinary(normalizedPath, bytes)) {
    return findings;
  }

  const source = bytes.toString("utf8");
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    const lineNumber = index + 1;
    const lineBytes = Buffer.byteLength(line, "utf8");
    const rules = [
      ...(executableConfig ? IOC_RULES : []),
      ...(commandSurface || executableConfig ? COMMAND_RULES : []),
      ...(executableConfig && lineBytes > 2_000
        ? [{ ruleId: "config.long-line", pattern: /.*/u }]
        : []),
    ];

    for (const rule of rules) {
      if (!rule.pattern.test(line) || isAllowed(allowlist, normalizedPath, rule.ruleId)) {
        continue;
      }
      findings.push(finding(normalizedPath, rule.ruleId, blobSha, lineNumber));
    }
  }

  return findings;
}

export async function scanRepository(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const now = new Date(options.now ?? Date.now()).getTime();
  const defaultAllowlist = path.join(
    resolvedRoot,
    "scripts",
    "security",
    "supply-chain-allowlist.json",
  );
  let allowlistPath = options.allowlistPath;
  if (!allowlistPath) {
    try {
      await lstat(defaultAllowlist);
      allowlistPath = defaultAllowlist;
    } catch {
      allowlistPath = undefined;
    }
  }

  const allowlist = options.allowlist
    ? await readInlineAllowlist(resolvedRoot, options.allowlist, now)
    : await readAllowlist(resolvedRoot, allowlistPath, now);
  const files = options.files
    ? await Promise.all(
        options.files.map(async (relativePath) => {
          const candidate = path.resolve(resolvedRoot, relativePath);
          if (!isInside(resolvedRoot, candidate)) return undefined;
          try {
            const stats = await lstat(candidate);
            return stats.isFile() && !stats.isSymbolicLink() ? candidate : undefined;
          } catch {
            return undefined;
          }
        }),
      ).then((entries) => entries.filter(Boolean))
    : await collectFiles(resolvedRoot);
  const findings = [...allowlist.findings];

  for (const filePath of files) {
    const relativePath = normalizePath(path.relative(resolvedRoot, filePath));
    if (isTestArtifact(relativePath)) {
      continue;
    }
    const bytes = await readFile(filePath);
    findings.push(...scanBlob(relativePath, bytes, { allowlist: allowlist.entries }));
  }

  findings.sort((left, right) =>
    `${left.path}:${left.line ?? 0}:${left.ruleId}`.localeCompare(
      `${right.path}:${right.line ?? 0}:${right.ruleId}`,
    ),
  );
  const byRule = {};
  for (const item of findings) {
    byRule[item.ruleId] = (byRule[item.ruleId] ?? 0) + 1;
  }

  return {
    ok: findings.length === 0,
    findings,
    summary: {
      filesScanned: files.length,
      findings: findings.length,
      byRule,
    },
  };
}

export async function main(args = process.argv.slice(2)) {
  const reportArgumentIndex = args.indexOf("--report");
  const reportPath = reportArgumentIndex >= 0 ? args[reportArgumentIndex + 1] : undefined;
  const rootArgument =
    args.find(
      (argument, index) => !argument.startsWith("--") && index !== reportArgumentIndex + 1,
    ) ?? ".";
  const report = await scanRepository(rootArgument);
  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (reportPath) {
    await writeFile(path.resolve(reportPath), output, "utf8");
  }
  process.stdout.write(output);
  return report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
