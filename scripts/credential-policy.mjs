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
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
    rule: "unsafe-private-key-literal",
    remediation: "remova a chave privada e rotacione a credencial exposta",
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

function hasSecretShellOperation(line, inRunBlock) {
  if (!SECRET_REFERENCE.test(line)) return false;
  return (
    inRunBlock ||
    /^\s*run\s*:/u.test(line) ||
    /\b(?:cat|echo|env|printenv|printf|set\s+-x|tee)\b/u.test(line) ||
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

  return findings;
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
  const inlineValue = permissionLine.replace(/^permissions\s*:\s*/u, "").trim();
  if (/\b(?:write|write-all)\b/u.test(inlineValue)) {
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
    const match = line.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(write(?:-all)?|read|none)\s*$/u);
    if (match?.[2].startsWith("write")) {
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
    const checkout = lines[index].match(/^(\s*)-\s+uses:\s*actions\/checkout@/u);
    if (!checkout) continue;

    const stepIndent = checkout[1].length;
    let hasSafePersistence = false;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (candidate.trim() && indentation(candidate) === stepIndent && /^-\s+/u.test(candidate.trim())) {
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

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (isCommentOrEmpty(line)) continue;

    if (/^run\s*:\s*[|>][-+]?\s*$/u.test(trimmed)) {
      runIndent = indentation(line);
      continue;
    }

    if (runIndent !== null && indentation(line) <= runIndent) runIndent = null;
    if (hasSecretShellOperation(line, runIndent !== null)) {
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
  return extension === "" || new Set([
    ".cjs",
    ".css",
    ".json",
    ".js",
    ".mjs",
    ".md",
    ".ps1",
    ".sh",
    ".sql",
    ".ts",
    ".tsx",
    ".txt",
    ".yml",
    ".yaml",
  ]).has(extension);
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

export function buildCredentialReport(findings) {
  const sanitizedFindings = sortFindings(Array.isArray(findings) ? findings : []);
  const bySeverity = Object.fromEntries(
    ["high", "medium", "low"].map((severity) => [
      severity,
      sanitizedFindings.filter((finding) => finding.severity === severity).length,
    ]),
  );

  return {
    ok: sanitizedFindings.length === 0,
    findings: sanitizedFindings,
    summary: {
      total: sanitizedFindings.length,
      bySeverity,
    },
  };
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

  const report = buildCredentialReport(await scanRepositoryCredentials(options.root));
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
