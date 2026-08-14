import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
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
const KNOWN_BASELINE_EXPOSURES = new Set([
  "credential-material-file|services/src/key.pem|1",
  "unsafe-private-key-literal|services/src/src/config/google.json|5",
]);
export const SCAN_LIMITS = Object.freeze({
  maxDepth: 12,
  maxFiles: 5000,
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
});
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

const SECRET_EXPRESSION = String.raw`secrets(?:\.[A-Za-z_][A-Za-z0-9_]*|\[['"][A-Za-z_][A-Za-z0-9_]*['"]\])`;
const SECRET_REFERENCE = new RegExp(`\\b${SECRET_EXPRESSION}`, "u");
const SECRET_TEMPLATE = new RegExp(`\\$\\{\\{\\s*${SECRET_EXPRESSION}`, "u");

function normalizePath(relativePath) {
  return String(relativePath).replaceAll("\\", "/");
}

function normalizeRelativePath(relativePath) {
  if (typeof relativePath !== "string") return null;
  const normalized = normalizePath(relativePath);
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) return null;
  const segments = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") return null;
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join("/") : null;
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
  if (
    /\b(?:curl|wget)\b/iu.test(line) ||
    /\bheaders?\s*:/iu.test(line) ||
    /(?:^|\s)--?header(?:=|\s)/iu.test(line)
  ) {
    return true;
  }
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
    new RegExp(`^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*["']?${SECRET_TEMPLATE.source}`, "u"),
  );
  if (yamlVariable) variables.push(yamlVariable[1]);

  const shellVariable = line.match(
    new RegExp(
      `(?:^|[;&|]\\s*)(?:export\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*["']?${SECRET_TEMPLATE.source}`,
      "u",
    ),
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

function stripYamlComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ((character === "'" || character === '"') && value[index - 1] !== "\\") {
      quote = quote === character ? null : quote || character;
    }
    if (character === "#" && !quote && (index === 0 || /\s/u.test(value[index - 1]))) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function permissionFinding(relativePath, rule, line, remediation) {
  return makeFinding(rule, relativePath, line, "high", remediation);
}

function findJobsBlock(lines) {
  const index = lines.findIndex(
    (line) => indentation(line) === 0 && /^jobs\s*:/u.test(line),
  );
  if (index === -1) return null;

  const rawValue = stripYamlComment(lines[index].slice(lines[index].indexOf(":") + 1));
  let end = lines.length - 1;
  for (let next = index + 1; next < lines.length; next += 1) {
    if (!isCommentOrEmpty(lines[next]) && indentation(lines[next]) === 0) {
      end = next - 1;
      break;
    }
  }
  return { index, end, inline: rawValue !== "" };
}

function findJobRanges(lines, jobsBlock = findJobsBlock(lines)) {
  if (!jobsBlock || jobsBlock.inline) return [];

  const ranges = [];
  let current;
  for (let index = jobsBlock.index + 1; index <= jobsBlock.end; index += 1) {
    const line = lines[index];
    const job = line.match(/^(\s{2})([A-Za-z0-9_-]+)\s*:\s*$/u);
    if (!job) continue;
    if (current) current.end = index - 1;
    current = { start: index, end: jobsBlock.end, indent: job[1].length };
    ranges.push(current);
  }
  return ranges;
}

function parsePermissionMap(relativePath, lines, index, findings) {
  const line = lines[index];
  const permissionIndent = indentation(line);
  const rawValue = stripYamlComment(line.slice(line.indexOf(":") + 1));
  const values = new Map();

  const recordValue = (key, value, lineNumber) => {
    if (values.has(key)) {
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-duplicate",
          lineNumber,
          "remova chaves de permissao duplicadas",
        ),
      );
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-ambiguous",
          lineNumber,
          "remova entradas duplicadas antes de avaliar o mapa de permissoes",
        ),
      );
      return;
    }
    const normalized = unquoteYamlScalar(stripYamlComment(value));
    if (!/^(?:read|none|write|write-all)$/u.test(normalized)) {
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-ambiguous",
          lineNumber,
          "use somente valores read, none ou write explicitamente analisaveis",
        ),
      );
      return;
    }
    values.set(key, normalized);
    if (/^write(?:-all)?$/u.test(normalized)) {
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-write",
          lineNumber,
          "substitua permissoes de escrita por escopos read ou none",
        ),
      );
    }
  };

  if (rawValue === "") {
    let foundEntry = false;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (isCommentOrEmpty(candidate)) continue;
      if (indentation(candidate) <= permissionIndent) break;
      const match = candidate.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/u);
      if (!match || indentation(candidate) !== permissionIndent + 2) {
        findings.push(
          permissionFinding(
            relativePath,
            "permissions-ambiguous",
            next + 1,
            "declare um mapa de permissoes simples e sem aninhamento",
          ),
        );
        continue;
      }
      foundEntry = true;
      recordValue(match[1], match[2], next + 1);
    }
    if (!foundEntry) {
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-ambiguous",
          index + 1,
          "declare permissoes explicitamente em um mapa somente leitura",
        ),
      );
    }
    return;
  }

  if (rawValue.startsWith("{")) {
    findings.push(
      permissionFinding(
        relativePath,
        "permissions-ambiguous",
        index + 1,
        "use um mapa de permissoes em bloco para evitar sintaxe inline ambigua",
      ),
    );
    if (!rawValue.endsWith("}")) {
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-ambiguous",
          index + 1,
          "feche o mapa inline de permissoes sem sintaxe ambigua",
        ),
      );
      return;
    }
    const inner = rawValue.slice(1, -1).trim();
    if (inner === "") return;
    for (const part of inner.split(",")) {
      const match = part.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/u);
      if (!match) {
        findings.push(
          permissionFinding(
            relativePath,
            "permissions-ambiguous",
            index + 1,
            "use pares key/value simples no mapa inline de permissoes",
          ),
        );
        continue;
      }
      recordValue(match[1], match[2], index + 1);
    }
    return;
  }

  const scalar = unquoteYamlScalar(rawValue);
  if (/^(?:read|read-all|none)$/u.test(scalar)) return;
  if (/^write(?:-all)?$/u.test(scalar)) {
    findings.push(
      permissionFinding(
        relativePath,
        "permissions-write",
        index + 1,
        "substitua permissoes de escrita por escopos read ou none",
      ),
    );
    return;
  }
  findings.push(
    permissionFinding(
      relativePath,
      "permissions-ambiguous",
      index + 1,
      "use somente mapas ou valores de permissao explicitamente suportados",
    ),
  );
}

function scanPermissions(relativePath, lines, findings) {
  const jobsBlock = findJobsBlock(lines);
  const jobs = findJobRanges(lines, jobsBlock);
  const declarations = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*permissions\s*:/u.test(lines[index])) continue;
    const indent = indentation(lines[index]);
    if (indent === 0) {
      declarations.push({ index, scope: "workflow" });
      continue;
    }
    const job = jobs.find(
      ({ start, end, indent: jobIndent }) =>
        index > start && index <= end && indent === jobIndent + 2,
    );
    if (job) declarations.push({ index, scope: "job" });
  }

  if (jobsBlock) {
    const meaningfulLines = [];
    for (let index = jobsBlock.index + 1; index <= jobsBlock.end; index += 1) {
      if (!isCommentOrEmpty(lines[index])) meaningfulLines.push(index);
    }
    if (jobsBlock.inline) {
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-ambiguous",
          jobsBlock.index + 1,
          "declare jobs em um mapa YAML analisavel antes de avaliar permissoes",
        ),
      );
    } else if (!jobs.length && meaningfulLines.length > 0) {
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-ambiguous",
          meaningfulLines[0] + 1,
          "declare cada job com indentacao e estrutura YAML analisaveis",
        ),
      );
    } else {
      for (const index of meaningfulLines) {
        if (!/^\s*permissions\s*:/u.test(lines[index])) continue;
        const recognized = jobs.some(
          ({ start, end, indent: jobIndent }) =>
            index > start && index <= end && indentation(lines[index]) === jobIndent + 2,
        );
        if (recognized) continue;
        findings.push(
          permissionFinding(
            relativePath,
            "permissions-ambiguous",
            index + 1,
            "mova permissions para o nivel de job reconhecido pelo verificador",
          ),
        );
      }
    }
  }

  const workflowDeclarations = declarations.filter(({ scope }) => scope === "workflow");
  if (workflowDeclarations.length === 0) {
    findings.push(
      permissionFinding(
        relativePath,
        "permissions-required",
        1,
        "declare permissoes de topo explicitamente e mantenha-as somente leitura",
      ),
    );
  }
  if (workflowDeclarations.length > 1) {
    for (const { index } of workflowDeclarations.slice(1)) {
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-duplicate",
          index + 1,
          "mantenha uma unica declaracao de permissoes no workflow",
        ),
      );
    }
  }

  const jobCounts = new Map();
  for (const declaration of declarations) {
    if (declaration.scope === "job") {
      const key = jobs.find(
        ({ start, end, indent: jobIndent }) =>
          declaration.index > start && declaration.index <= end &&
          indentation(lines[declaration.index]) === jobIndent + 2,
      );
      const jobKey = key?.start ?? declaration.index;
      jobCounts.set(jobKey, (jobCounts.get(jobKey) ?? 0) + 1);
    }
  }
  for (const [jobStart, count] of jobCounts) {
    if (count <= 1) continue;
    const jobDeclarations = declarations.filter(({ index, scope }) => {
      if (scope !== "job") return false;
      const job = jobs.find(
        ({ start, end, indent: jobIndent }) =>
          index > start && index <= end && indentation(lines[index]) === jobIndent + 2,
      );
      return job?.start === jobStart;
    });
    for (const { index } of jobDeclarations.slice(1)) {
      findings.push(
        permissionFinding(
          relativePath,
          "permissions-duplicate",
          index + 1,
          "mantenha uma unica declaracao de permissoes por job",
        ),
      );
    }
  }

  for (const { index } of declarations) parsePermissionMap(relativePath, lines, index, findings);
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

class ScanLimitError extends Error {
  constructor(rule, relativePath, remediation) {
    super(rule);
    this.rule = rule;
    this.relativePath = relativePath;
    this.remediation = remediation;
  }
}

async function collectFiles(
  directory,
  relativeDirectory = "",
  depth = 0,
  limits = SCAN_LIMITS,
  state = { fileCount: 0, totalBytes: 0 },
) {
  if (depth > limits.maxDepth) {
    throw new ScanLimitError(
      "scan-limit-depth",
      relativeDirectory || ".",
      "reduza a profundidade do repositorio escaneado",
    );
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (isExcluded(relativePath)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath, relativePath, depth + 1, limits, state)));
    } else if (entry.isFile() && shouldReadFile(relativePath)) {
      const metadata = await stat(absolutePath);
      if (metadata.size > limits.maxFileBytes) {
        throw new ScanLimitError(
          "scan-limit-file-bytes",
          normalizePath(relativePath),
          "reduza o tamanho dos arquivos ou ajuste o limite aprovado",
        );
      }
      state.fileCount += 1;
      if (state.fileCount > limits.maxFiles) {
        throw new ScanLimitError(
          "scan-limit-files",
          normalizePath(relativePath),
          "reduza a quantidade de arquivos do repositorio escaneado",
        );
      }
      state.totalBytes += metadata.size;
      if (state.totalBytes > limits.maxTotalBytes) {
        throw new ScanLimitError(
          "scan-limit-total-bytes",
          normalizePath(relativePath),
          "reduza o volume total de bytes do repositorio escaneado",
        );
      }
      files.push({ absolutePath, relativePath: normalizePath(relativePath) });
    }
  }

  return files;
}

export async function scanRepositoryCredentials(root, options = {}) {
  const limits = { ...SCAN_LIMITS, ...(options.limits ?? {}) };
  try {
    const findings = [];
    const files = await collectFiles(path.resolve(root), "", 0, limits);

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
  } catch (error) {
    return [
      makeFinding(
        error instanceof ScanLimitError ? error.rule : "scan-read-failure",
        error instanceof ScanLimitError ? error.relativePath : ".",
        1,
        "high",
        error instanceof ScanLimitError
          ? error.remediation
          : "corrija o acesso ao repositorio antes de executar a politica",
      ),
    ];
  }
}

function baselineEntryForFinding(finding, entries, today) {
  const findingPath = normalizeRelativePath(finding.path);
  const findingKey = `${finding.rule}|${findingPath}|${finding.line}`;
  if (!findingPath || !KNOWN_BASELINE_EXPOSURES.has(findingKey)) return undefined;
  return entries.find(
    (entry) =>
      entry.rule === finding.rule &&
      normalizeRelativePath(entry.path) === findingPath &&
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
  const normalizedPath = normalizeRelativePath(entry?.path);
  return (
    entry &&
    typeof entry.rule === "string" &&
    normalizedPath !== null &&
    Number.isInteger(entry.line) &&
    entry.line > 0 &&
    isSafeBaselineMetadata(entry) &&
    isValidIsoDate(entry.expiresAt) &&
    KNOWN_BASELINE_EXPOSURES.has(`${entry.rule}|${normalizedPath}|${entry.line}`)
  );
}

function normalizeBaselineEntry(entry) {
  const normalizedPath = normalizeRelativePath(entry.path);
  return { ...entry, path: normalizedPath };
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
        validEntries.push(normalizeBaselineEntry(entry));
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
