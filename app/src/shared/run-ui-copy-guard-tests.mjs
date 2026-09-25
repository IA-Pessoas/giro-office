// Guarda de textos da interface (#1371): jargão técnico e palavras sem acento
// não podem aparecer em texto JSX nem em literais de string dos .tsx do app.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));

// Jargão que o usuário não deve ver.
const JARGON = [
  { label: "<x>-service", pattern: /\b[a-z]+-service\b/, requiresSentence: true },
  { label: "fontes canônicas", pattern: /fontes can[oô]nicas/i },
  { label: "snapshot", pattern: /(?<![\w\-./])snapshots?(?![\w\-./])/i },
  { label: "legacy", pattern: /(?<![\w\-./])legacy(?![\w\-./])/i },
  { label: "Task ID", pattern: /\bTask ID\b/i },
  { label: "receberá os efeitos por evento", pattern: /receber[aá] os efeitos/i },
];

// Palavras comuns sem acento.
const UNACCENTED = [
  { label: "Visao", pattern: /\b[Vv]isao\b/ },
  { label: "nao", pattern: /\b[Nn]ao\s/ },
  { label: "Socio", pattern: /\b[Ss]ocios?\b/ },
  { label: "extensao", pattern: /\b[Ee]xtensao\b/ },
  { label: "sessao", pattern: /\b[Ss]essao\b/ },
  { label: "informacoes", pattern: /\b[Ii]nformacoes\b/ },
];

// Exceções explícitas: { file, text, reason }.
const ALLOWLIST = [
  {
    file: "modules/rh/components/RhTimesheetDetailView.tsx",
    text: '"Nao previsto"',
    reason: "valor de status gravado pelo rh-service; o componente só o compara e exibe o rótulo acentuado",
  },
];

const LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;
const JSX_TEXT = />([^<>{}]+)</g;
const CODE_CHARS = /[{}();=<>[\]]|^\s*$|=>|&&|\|\|/;

function stripLineComment(line) {
  // Remove "// ..." fora de strings (heurística: só quando não há aspas depois).
  const index = line.search(/(^|\s)\/\/(?![^"'`]*["'`])/);
  return index >= 0 ? line.slice(0, index) : line;
}

/** Extrai os trechos de texto visível (literais e texto JSX) de uma linha de .tsx. */
export function extractTexts(rawLine) {
  const trimmed = rawLine.trim();
  if (
    trimmed === "" ||
    trimmed.startsWith("import ") ||
    trimmed.startsWith("} from ") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("{/*")
  ) {
    return [];
  }
  const line = stripLineComment(rawLine);
  const texts = [];
  for (const match of line.matchAll(LITERAL)) {
    const body = match[2];
    // Literais sem espaço e em minúsculas são chaves/identificadores (ids, query keys, rotas).
    if (/\s/.test(body) || /^[A-ZÀ-Ú]/.test(body)) texts.push(body);
  }
  const withoutLiterals = line.replace(LITERAL, '""');
  for (const match of withoutLiterals.matchAll(JSX_TEXT)) texts.push(match[1]);
  // Linha só de texto (texto JSX quebrado em várias linhas), ignorando expressões {…}.
  const withoutExpressions = withoutLiterals.replace(/\{[^{}]*\}/g, " ");
  if (!CODE_CHARS.test(withoutExpressions) && /[A-Za-zÀ-ú]{2,}(\s+[A-Za-zÀ-ú]|[:.!?])/.test(withoutExpressions)) {
    texts.push(withoutExpressions.trim());
  }
  return texts;
}

/** Retorna os rótulos das regras violadas pela linha. */
export function findViolations(rawLine) {
  const found = new Set();
  for (const text of extractTexts(rawLine)) {
    for (const rule of JARGON) {
      if (rule.requiresSentence && !/\s/.test(text.trim())) continue;
      if (rule.pattern.test(text)) found.add(rule.label);
    }
    for (const rule of UNACCENTED) {
      if (rule.pattern.test(text)) found.add(rule.label);
    }
  }
  return [...found];
}

// Autoverificação do matcher.
assert.deepEqual(findViolations('        <p>Erro no task-service.</p>'), ["<x>-service"]);
assert.deepEqual(findViolations('  toast.error("Falha ao chamar o pessoal-service agora");'), ["<x>-service"]);
assert.deepEqual(findViolations('            Snapshot: {job.model_name}'), ["snapshot"]);
assert.deepEqual(findViolations('<RegularizeFormField label="Task ID">'), ["Task ID"]);
assert.deepEqual(findViolations('  description="Status derivado das fontes canônicas."'), ["fontes canônicas"]);
assert.deepEqual(findViolations('            A Integração receberá os efeitos por evento.'), ["receberá os efeitos por evento"]);
assert.deepEqual(findViolations('  title: "Dados legacy do cliente",'), ["legacy"]);
assert.deepEqual(findViolations('  { label: "Visao geral" },'), ["Visao"]);
assert.deepEqual(findViolations('  message: "Socio ja cadastrado.",'), ["Socio"]);
assert.deepEqual(findViolations('  "Arquivo deve usar extensao .pfx",'), ["extensao"]);
assert.deepEqual(findViolations('  title = "Sincronizando sessao",'), ["sessao"]);
assert.deepEqual(findViolations('<p>Nao foi possível salvar.</p>'), ["nao"]);
assert.deepEqual(findViolations('  <h2>Minhas informacoes</h2>'), ["informacoes"]);
// Identificadores, imports, comentários e ids não disparam.
assert.deepEqual(findViolations('import { useReportSnapshot } from "../hooks/useReports";'), []);
assert.deepEqual(findViolations('  // O task-service aceita qualquer ativo.'), []);
assert.deepEqual(findViolations('    {/* Nao ha recuperacao self-service */}'), []);
assert.deepEqual(findViolations('  <section aria-labelledby="report-snapshot-title">'), []);
assert.deepEqual(findViolations('  const snapshot = useReportSnapshot(id);'), []);
assert.deepEqual(findViolations('  <ReportResultBlocks blocks={blocks} snapshot />'), []);
assert.deepEqual(findViolations('  legacyTaxRegime={client.regime}'), []);
assert.deepEqual(findViolations('  const key = ["reports", "snapshot", id];'), []);
assert.deepEqual(findViolations('  <p>Visão geral do sócio já cadastrado</p>'), []);

function listTsx(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") listTsx(full, files);
    } else if (entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];
for (const file of listTsx(srcRoot)) {
  const path = relative(srcRoot, file);
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      const labels = findViolations(line);
      if (labels.length === 0) return;
      if (ALLOWLIST.some((entry) => entry.file === path && line.includes(entry.text))) return;
      violations.push(`${path}:${index + 1} [${labels.join(", ")}] ${line.trim()}`);
    });
}

assert.equal(
  violations.length,
  0,
  `Textos de interface com jargão técnico ou sem acento:\n${violations.join("\n")}`,
);

console.log("ui copy guard tests passed");
