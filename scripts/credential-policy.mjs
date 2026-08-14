import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "dist",
  "graphify-out",
  "node_modules",
]);

const MATERIAL_EXTENSIONS = new Set([".crt", ".key", ".pem"]);
const SAFE_BASELINE_OWNERS = new Set(["ia-pessoas-security"]);
const SAFE_BASELINE_JUSTIFICATIONS = new Set([
  "preexisting-key-rotation",
  "preexisting-service-account-rotation",
]);
const TEXT_EXTENSIONS = new Set([
  "",
  ".cjs",
  ".crt",
  ".css",
  ".json",
  ".js",
  ".key",
  ".md",
  ".mjs",
  ".pem",
  ".ps1",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

const UNSAFE_LITERAL_RULES = [
  {
    pattern: /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{12,}\b/u,
    rule: "unsafe-token-literal",
    remediation: "remova o token literal e use um segredo aprovado",
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/u,
    rule: "unsafe-cloud-key-literal",
    remediation: "remova a chave literal e use identidade federada",
  },
  {
    pattern: /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{12,}/iu,
    rule: "unsafe-authorization-header",
    remediation: "nao persista cabecalhos de autorizacao no repositorio",
  },
];

const SECRET_REFERENCE = /\bsecrets\.[A-Za-z0-9_]+\b/u;

function normalizePath(relativePath) {
  return String(relativePath).replaceAll("\\", "/");
}

function makeFinding(rule, relativePath, line, severity, remediation) {
  return { rule, path: normalizePath(relativePath), line, severity, remediation };
}

function sortFindings(findings) {
  return findings
    .map((finding) => ({
      rule: String(finding.rule),
      path: normalizePath(finding.path),
      line: Number.isInteger(finding.line) ? finding.line : 1,
      severity: String(finding.severity),
      remediation: String(finding.remediation),
    }))
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.line - right.line ||
        left.rule.localeCompare(right.rule),
    );
}

function isCommentOrEmpty(line) {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

function indentation(line) {
  return line.length - line.trimStart().length;
}

function unquoteYamlScalar(value) {
  const scalar = value.trim();
  if (scalar.length >= 2) {
    const first = scalar[0];
    const last = scalar.at(-1);
    if ((first === "'" || first === '"') && last === first) {
      return scalar.slice(1, -1);
    }
  }
  return scalar;
}

function hasSecretShellOperation(line, inRunBlock) {
  if (!SECRET_REFERENCE.test(line)) return false;
  return (
    inRunBlock ||
    /^\s*run\s*:/u.test(line) ||
    /\b(?:cat|echo|env|printenv|printf|set\s+-x|tee)\b/u.test(line) ||
    />>?\s*[^&]/u.test(line)
  );
}

function extractDerivedSecretVariables(line) {
  const variables = [];
  const yamlVariable = line.match(
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*["']?\$\{\{\s*secrets\./u,
  );
  if (yamlVariable) variables.push(yamlVariable[1]);

  const shellVariable = line.match(
    /(?:^|[;&|]\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?\$\{\{\s*secrets\./u,
  );
  if (shellVariable) variables.push(shellVariable[1]);
  return variables;
}

function referencesDerivedVariable(line, variables) {
  return variables.some((variable) => {
    const escaped = variable.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(
      `\\$\\{${escaped}\\}|\\$${escaped}\\b|\\$env:${escaped}\\b|\\$\\{env:${escaped}\\}`,
      "iu",
    ).test(line);
  });
}

function hasDerivedSecretShellOperation(line, variables) {
  if (!variables.length) return false;
  const referencesSecret = referencesDerivedVariable(line, variables);
  const debug = /\bset\s+-x\b/u.test(line);
  if (!referencesSecret && !debug) return false;
  return (
    debug ||
    /\b(?:cat|curl|echo|env|fetch|http|httpie|Invoke-RestMethod|Invoke-WebRequest|printenv|printf|request|tee|wget)\b/iu.test(
      line,
    ) ||
    />>?\s*[^&]/u.test(line)
  );
}

function scanUnsafeLiterals(relativePath, source, activeOnly = false) {
  const findings = [];
  const lines = source.split(/\r?\n/u);

  for (const [index, line] of lines.entries()) {
    if (activeOnly && isCommentOrEmpty(line)) continue;
    for (const { pattern, rule, remediation } of UNSAFE_LITERAL_RULES) {
      if (pattern.test(line)) {
        findings.push(makeFinding(rule, relativePath, index + 1, "high", remediation));
      }
    }
  }

  findings.push(...scanPrivateKeyMaterial(relativePath, source));
  return findings;
}

function scanPrivateKeyMaterial(relativePath, source) {
  const extension = path.posix.extname(normalizePath(relativePath)).toLowerCase();
  if (MATERIAL_EXTENSIONS.has(extension) && source.trim()) {
    return [
      makeFinding(
        "credential-material-file",
        relativePath,
        1,
        "high",
        "remova o material de credencial do repositorio e rotacione-o",
      ),
    ];
  }

  const normalized = source.replaceAll("\\r\\n", "\n").replaceAll("\\n", "\n");
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----\s*[A-Za-z0-9+/=]{32,}/u.test(normalized)) {
    const line = source.slice(0, source.indexOf("-----BEGIN")).split(/\r?\n/u).length;
    return [
      makeFinding(
        "unsafe-private-key-literal",
        relativePath,
        line,
        "high",
        "remova a chave privada e rotacione a credencial exposta",
      ),
    ];
  }

  return [];
}

function scanPermissions(relativePath, lines, findings) {
  const permissionsIndex = lines.findIndex((line) => /^permissions\s*:/u.test(line));
  if (permissionsIndex === -1) {
    findings.push(
      makeFinding(
        "permissions-required",
        relativePath,
        1,
        "high",
        "declare permissoes de topo explicitamente e mantenha-as somente leitura",
      ),
    );
    return;
  }

  const permissionLine = lines[permissionsIndex];
  const inlineValue = unquoteYamlScalar(
    permissionLine.replace(/^permissions\s*:\s*/u, "").trim(),
  );
  if (/^(?:write|write-all)$/u.test(inlineValue)) {
    findings.push(
      makeFinding(
        "permissions-write",
        relativePath,
        permissionsIndex + 1,
        "high",
        "substitua permissoes de escrita por escopos read ou none",
      ),
    );
  }

  for (let index = permissionsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!isCommentOrEmpty(line) && indentation(line) === 0) break;
    const match = line.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/u);
    const value = match ? unquoteYamlScalar(match[2]) : "";
    if (/^(?:write|write-all)$/u.test(value)) {
      findings.push(
        makeFinding(
          "permissions-write",
          relativePath,
          index + 1,
          "high",
          "substitua permissoes de escrita por escopos read ou none",
        ),
      );
    }
  }
}

function scanCheckouts(relativePath, lines, findings) {
  for (let index = 0; index < lines.length; index += 1) {
    const checkout = lines[index].match(/^(?:\s*-\s+|\s*)uses:\s*actions\/checkout@/u);
    if (!checkout) continue;

    const usesIndent = indentation(lines[index]);
    let stepIndent = usesIndent;
    for (let previous = index; previous >= 0; previous -= 1) {
      const step = lines[previous].match(/^(\s*)-\s+/u);
      if (step && step[1].length <= usesIndent) {
        stepIndent = step[1].length;
        break;
      }
    }

    let hasSafePersistence = false;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (
        candidate.trim() &&
        indentation(candidate) === stepIndent &&
        /^-\s+/u.test(candidate.trim())
      ) {
        break;
      }
      if (/^\s+persist-credentials\s*:\s*false\s*$/u.test(candidate)) {
        hasSafePersistence = true;
        break;
      }
    }

    if (!hasSafePersistence) {
      findings.push(
        makeFinding(
          "checkout-persist-credentials",
          relativePath,
          index + 1,
          "high",
          "configure persist-credentials: false em cada checkout",
        ),
      );
    }
  }
}

function scanSecretShell(relativePath, lines, findings) {
  let runIndent = null;
  const globalSecretVariables = new Set();
  const jobSecretVariables = new Set();
  const stepSecretVariables = new Set();
  let inJobs = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (isCommentOrEmpty(line)) continue;

    if (/^jobs\s*:\s*$/u.test(trimmed)) {
      inJobs = true;
      jobSecretVariables.clear();
      stepSecretVariables.clear();
      runIndent = null;
      continue;
    }

    if (inJobs && indentation(line) === 2 && /^[A-Za-z0-9_-]+\s*:\s*$/u.test(trimmed)) {
      jobSecretVariables.clear();
      stepSecretVariables.clear();
      runIndent = null;
      continue;
    }

    if (/^\s*-\s+\S/u.test(line)) {
      runIndent = null;
      stepSecretVariables.clear();
    }

    for (const variable of extractDerivedSecretVariables(line)) {
      if (inJobs) {
        stepSecretVariables.add(variable);
        jobSecretVariables.add(variable);
      } else {
        globalSecretVariables.add(variable);
      }
    }

    const derivedVariables = [
      ...new Set([
        ...globalSecretVariables,
        ...jobSecretVariables,
        ...stepSecretVariables,
      ]),
    ];

    if (/^run\s*:\s*[|>][-+]?\s*$/u.test(trimmed)) {
      runIndent = indentation(line);
      continue;
    }

    if (runIndent !== null && indentation(line) <= runIndent) runIndent = null;
    if (
      hasSecretShellOperation(line, runIndent !== null) ||
      hasDerivedSecretShellOperation(line, derivedVariables)
    ) {
      findings.push(
        makeFinding(
          "secret-shell-exposure",
          relativePath,
          index + 1,
          "high",
          "passe o segredo por env ou with sem imprimir, persistir ou depurar seu valor",
        ),
      );
    }
  }
}

export function scanWorkflowText(relativePath, source) {
  if (typeof source !== "string") {
    return [
      makeFinding(
        "workflow-invalid",
        relativePath,
        1,
        "high",
        "forneca texto YAML valido ao verificador",
      ),
    ];
  }

  const lines = source.split(/\r?\n/u);
  if (lines.every(isCommentOrEmpty)) return [];

  const findings = [];
  scanPermissions(relativePath, lines, findings);
  scanCheckouts(relativePath, lines, findings);
  scanSecretShell(relativePath, lines, findings);
  findings.push(...scanUnsafeLiterals(relativePath, source, true));
  return sortFindings(findings);
}

function isExcluded(relativePath) {
  const segments = normalizePath(relativePath).split("/");
  return segments.some((segment) => EXCLUDED_DIRECTORIES.has(segment)) ||
    segments.some((segment) => segment.startsWith(".env"));
}

function shouldReadFile(relativePath) {
  const extension = path.posix.extname(normalizePath(relativePath)).toLowerCase();
  return TEXT_EXTENSIONS.has(extension);
}

async function collectFiles(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (isExcluded(relativePath)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath)));
    } else if (entry.isFile() && shouldReadFile(relativePath)) {
      files.push({ absolutePath, relativePath: normalizePath(relativePath) });
    }
  }

  return files;
}

export async function scanRepositoryCredentials(root) {
  const findings = [];
  const files = await collectFiles(path.resolve(root));

  for (const { absolutePath, relativePath } of files) {
    const buffer = await readFile(absolutePath);
    const extension = path.posix.extname(relativePath).toLowerCase();
    if (MATERIAL_EXTENSIONS.has(extension) && buffer.length > 0) {
      findings.push(
        makeFinding(
          "credential-material-file",
          relativePath,
          1,
          "high",
          "remova o material de credencial do repositorio e rotacione-o",
        ),
      );
      continue;
    }
    if (buffer.includes(0)) continue;
    const source = buffer.toString("utf8");
    if (relativePath.startsWith(".github/workflows/")) {
      findings.push(...scanWorkflowText(relativePath, source));
    } else {
      findings.push(...scanUnsafeLiterals(relativePath, source));
    }
  }

  return sortFindings(findings);
}

function baselineEntryForFinding(finding, entries, today) {
  return entries.find(
    (entry) =>
      entry.rule === finding.rule &&
      normalizePath(entry.path) === finding.path &&
      entry.line === finding.line &&
      isSafeBaselineMetadata(entry) &&
      isValidIsoDate(entry.expiresAt) &&
      entry.expiresAt >= today,
  );
}

function isSafeBaselineMetadata(entry) {
  return (
    entry &&
    SAFE_BASELINE_OWNERS.has(entry.owner) &&
    SAFE_BASELINE_JUSTIFICATIONS.has(entry.justification)
  );
}

function isSafeBaselineEntry(entry) {
  return (
    entry &&
    typeof entry.rule === "string" &&
    typeof entry.path === "string" &&
    Number.isInteger(entry.line) &&
    entry.line > 0 &&
    isSafeBaselineMetadata(entry) &&
    isValidIsoDate(entry.expiresAt)
  );
}

function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function buildCredentialReport(findings, options = {}) {
  const sanitizedFindings = sortFindings(Array.isArray(findings) ? findings : []);
  const today = new Date(options.now ?? Date.now()).toISOString().slice(0, 10);
  const entries = Array.isArray(options.baseline) ? options.baseline : [];
  const blockingFindings = [];
  const baselinedFindings = [];
  const appliedBaseline = [];

  for (const finding of sanitizedFindings) {
    const entry = baselineEntryForFinding(finding, entries, today);
    if (!entry) {
      blockingFindings.push(finding);
      continue;
    }

    baselinedFindings.push(finding);
    appliedBaseline.push({
      rule: finding.rule,
      path: finding.path,
      line: finding.line,
      owner: String(entry.owner),
      justification: String(entry.justification),
      expiresAt: entry.expiresAt,
    });
  }

  const bySeverity = Object.fromEntries(
    ["high", "medium", "low"].map((severity) => [
      severity,
      blockingFindings.filter((finding) => finding.severity === severity).length,
    ]),
  );

  return {
    ok: blockingFindings.length === 0,
    findings: blockingFindings,
    baselinedFindings,
    baseline: appliedBaseline,
    summary: {
      total: sanitizedFindings.length,
      blocking: blockingFindings.length,
      baselined: baselinedFindings.length,
      bySeverity,
    },
  };
}

async function readCredentialBaseline(root) {
  const relativePath = ".github/credential-policy-baseline.json";
  try {
    const source = await readFile(path.join(path.resolve(root), relativePath), "utf8");
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed.entries)) {
      return {
        entries: [],
        findings: [
          makeFinding(
            "baseline-invalid",
            relativePath,
            1,
            "high",
            "corrija o baseline usando somente metadata controlada",
          ),
        ],
      };
    }
    const entries = parsed.entries;
    const validEntries = [];
    const findings = [];
    entries.forEach((entry, index) => {
      if (isSafeBaselineEntry(entry)) {
        validEntries.push(entry);
      } else {
        findings.push(
          makeFinding(
            "baseline-invalid",
            relativePath,
            index + 2,
            "high",
            "corrija o baseline usando somente metadata controlada",
          ),
        );
      }
    });
    return {
      entries: validEntries,
      findings,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { entries: [], findings: [] };
    return {
      entries: [],
      findings: [
        makeFinding(
          "baseline-invalid",
          relativePath,
          1,
          "high",
          "corrija o baseline sanitizado antes de aceitar excecoes",
        ),
      ],
    };
  }
}

function parseArguments(argv) {
  let root = process.cwd();
  let reportPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--report") {
      reportPath = argv[index + 1];
      index += 1;
    } else if (argument === "--help") {
      return { help: true };
    } else if (argument.startsWith("--")) {
      throw new Error(`opcao desconhecida: ${argument}`);
    } else if (root === process.cwd()) {
      root = argument;
    } else {
      throw new Error("apenas uma raiz de repositorio pode ser informada");
    }
  }

  return { root, reportPath };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Uso: node scripts/credential-policy.mjs [root] [--report caminho]");
    return;
  }

  const baseline = await readCredentialBaseline(options.root);
  const report = buildCredentialReport(
    [...(await scanRepositoryCredentials(options.root)), ...baseline.findings],
    { baseline: baseline.entries },
  );
  if (options.reportPath) {
    await mkdir(path.dirname(path.resolve(options.reportPath)), { recursive: true });
    await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.exitCode = 1;
    console.error("credential policy scan failed");
  });
}
