// Guarda de textos da interface (#1371): jargão técnico e palavras sem acento
// não podem aparecer em texto visível do app (.tsx/.ts) nem nas mensagens que
// Workers, serviços e shared devolvem ao usuário (literais com frase).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

// Nomes internos de serviço (evita pegar "self-service" e afins).
const SERVICES =
  "task|pessoal|ti|rh|fiscal|contabil|user|audit|gateway|project|client|department|organization|reports|regularize|parcelamento|commercial|certificate|triagem|chat";

// Jargão que o usuário não deve ver.
const JARGON = [
  { label: "<x>-service", pattern: new RegExp(`\\b(?:${SERVICES})-service\\b`), requiresSentence: true },
  { label: "fontes canônicas", pattern: /fontes can[oô]nicas/i },
  { label: "snapshot", pattern: /(?<![\w\-./])snapshots?(?![\w\-./])/i },
  { label: "legacy", pattern: /(?<![\w\-./])legacy(?![\w\-./])/i },
  { label: "Task ID", pattern: /\bTask ID\b/i },
  { label: "receberá os efeitos por evento", pattern: /receber[aá] os efeitos/i },
];

// Palavras comuns sem acento (palavra inteira; o rótulo é a palavra encontrada).
const WORD = "[\\wÀ-ÿ]";
const UNACCENTED_WORDS = [
  "ja", "nao", "voces?", "usuari[oa]s?", "competencias?", "codigos?", "numeros?", "periodos?",
  "historicos?", "invalid[oa]s?", "obrigatori[oa]s?", "possive(?:l|is)", "responsave(?:l|is)",
  "(?:in)?disponive(?:l|is)", "referencias?", "sequencias?", "socios?", "unic[oa]s?", "minim[oa]s?",
  "maxim[oa]s?", "necessari[oa]s?", "calculos?", "conteudos?", "proxim[oa]s?", "ultim[oa]s?",
  "pagina", "paginas", "servico", "servicos", "endereco", "enderecos", "saida", "horario", "horarios",
  "relatorios?", "concluid[oa]s?", "tambem", "estao", "entao", "automatic[oa]s?", "especific[oa]s?", "previas?",
  "analises?", "pendencias?", "vinculos?", "logica",
  // -ção/-ções/-são/-sões sem acento (configuracao, informacoes, sessao, extensao...).
  "[a-z]+(?:cao|coes|sao|soes)",
  // Infinitivo com pronome sem acento (altera-lo -> alterá-lo, vende-la -> vendê-la).
  "[a-z]+[ae]-l[oa]s?",
];
const UNACCENTED = new RegExp(`(?<!${WORD})(?:${UNACCENTED_WORDS.join("|")})(?!${WORD})`, "gi");

// Exceções explícitas: { file (relativo à raiz do repo), text, reason }.
const ALLOWLIST = [
  ...['fail("[user-service]', 'fail(`[user-service]'].map((text) => ({
    file: "workers/user-service/src/audit.ts",
    text,
    reason: "helper fail registra console.warn; evento obrigatório devolve apenas Auditoria indisponível",
  })),
  {
    file: "app/src/modules/rh/components/RhTimesheetDetailView.tsx",
    text: '"Nao previsto"',
    reason: "valor de status gravado pelo rh-service; o componente só o compara e exibe o rótulo acentuado",
  },
  ...["workers/rh-service/src/services/timeSheetService.ts", "services/rh-service/src/services/timeSheetService.ts"].map(
    (file) => ({ file, text: 'return "Nao previsto"', reason: "valor de status gravado e comparado pelo app" }),
  ),
  {
    file: "app/src/modules/auth/utils/moduleAccess.ts",
    text: '"integracao de sistemas"',
    reason: "chave de busca normalizada (sem acento) do nome do módulo",
  },
  ...['value: "Relatorio"', 'value: "Integracao"', 'value: "Manutencao"'].map((text) => ({
    file: "app/src/modules/ti/components/TiRobotsTab.tsx",
    text,
    reason: "valor do tipo de robô gravado pelo ti-service; o rótulo ao lado é acentuado",
  })),
  {
    file: "app/src/modules/ti/types/robots.ts",
    text: '"Integracao" | "Manutencao"',
    reason: "união dos valores gravados pelo ti-service",
  },
  {
    file: "app/src/modules/regularize/components/regularizeFormControls.tsx",
    text: '"Concluido",',
    reason: "status legado ainda gravado; opção de filtro precisa casar com o valor do banco",
  },
  {
    file: "services/src/src/controllers/ReportController.ts",
    text: "filename=relatorio.pdf",
    reason: "nome de arquivo, não frase",
  },
  {
    file: "services/fiscal-service/src/services/anticipationExportService.ts",
    text: 'filename="antecipacoes-',
    reason: "nome de arquivo em ASCII (Content-Disposition), não frase",
  },
  {
    file: "services/client-service/src/schemas/client.schemas.ts",
    text: "ref=integracao",
    reason: "valor literal do parâmetro ref aceito pela API",
  },
  {
    file: "services/gateway/src/services/dashboardStatsService.ts",
    text: "nao contratado",
    reason: "status legado comparado no banco, não é texto exibido",
  },
  {
    file: "services/src/src/types/TriageTypes.ts",
    text: '"nao possui"',
    reason: "valor de status legado",
  },
  {
    file: "workers/contabil-service/src/services.ts",
    text: '"nao possui": "NOT_PRESENT"',
    reason: "status legado gravado em triagem.monthly, lido como NOT_PRESENT",
  },
  {
    file: "services/regularize-service/src/services/guidanceService.ts",
    text: ' Socio"',
    reason: "ação gravada no log do regularize (valor persistido)",
  },
  ...["workers/ti-service/src/domain.ts", "services/ti-service/src/services/tiTermService.ts"].map((file) => ({
    file,
    text: '"Termo assinado pelo usuario."',
    reason: "motivo padrão persistido no termo (valor gravado)",
  })),
  ...["services/triagem-service/src/integrations/prisma.ts", "services/user-service/src/integrations/auditOutbox.ts"].map(
    (file) => ({ file, text: '"DATABASE_URL do ', reason: "erro de configuração na subida, só para quem opera" }),
  ),
  ...[
    ["services/task-service/src/integrations/projectWizard.ts", "`project-service retornou status "],
    ["services/task-service/src/integrations/projectProgressHttp.ts", "`project-service retornou status "],
  ].map(([file, text]) => ({
    file,
    text,
    reason: "502 sem expose (ServiceError multilinha); o serializeError devolve a mensagem genérica",
  })),
  ...[
    ['"[user-service] AUDIT_SERVICE binding ausente; auditoria não foi enviada."'],
    ['"[user-service] AUDIT_SERVICE_TOKEN ausente; auditoria não foi enviada."'],
    ['`[user-service] AUDIT_SERVICE respondeu ${response.status}; auditoria falhou.`'],
    ['"[user-service] falha ao comunicar com AUDIT_SERVICE; auditoria falhou."'],
  ].map(([text]) => ({
    file: "workers/user-service/src/audit.ts",
    text,
    reason: "mensagem interna enviada somente a console.warn; a resposta pública usa erro genérico",
  })),
];

// Linhas que não chegam ao usuário: logs (inclusive "[tag] ..."), SQL, títulos de docs
// e rótulos de log de erro.
const NOT_USER_TEXT =
  /^\s*["'`]\[[\w-]+\]|\bsiteTitle:|\bconsole\.\w+\(|\b(?:log\w*|debug)\(|\blogger\.\w+\(|\bswaggerUiHtml\(|\bfallbackMessage:|\bSELECT\b|\bINSERT INTO\b|\bUPDATE\s+"?\w+"?\s+SET\b|\bDELETE FROM\b/;
// Erros internos (5xx sem expose, Error genérico): o serializeError troca a mensagem
// pela genérica, então jargão ali só aparece no log (acentos continuam valendo).
const INTERNAL_ERROR = /\bnew Error\(|Error\(\s*5\d\d\b(?!.*expose: true)/;

const LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;
const JSX_TEXT = />([^<>{}]+)</g;
const CODE_CHARS = /[{}();=<>[\]]|^\s*$|=>|&&|\|\|/;

/** Remove o comentário "// ..." da linha, ignorando "//" dentro de strings (ex.: "https://"). */
export function stripLineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "/" && line[i + 1] === "/") {
      return line.slice(0, i);
    }
  }
  return line;
}

function isSkippableLine(trimmed) {
  return (
    trimmed === "" ||
    trimmed.startsWith("import ") ||
    trimmed.startsWith("} from ") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("{/*")
  );
}

/**
 * Extrai os trechos de texto visível de uma linha.
 * mode "tsx": literais, texto JSX e linhas só de texto; "ts": literais do app;
 * "backend": só literais com espaço (frases), pois os demais são chaves/valores.
 */
export function extractTexts(rawLine, mode = "tsx") {
  if (isSkippableLine(rawLine.trim()) || NOT_USER_TEXT.test(rawLine)) return [];
  const line = stripLineComment(rawLine);
  const texts = [];
  for (const match of line.matchAll(LITERAL)) {
    // Interpolações ${...} são código, não texto.
    const body = match[2].replace(/\$\{[^}]*\}/g, "");
    // Literais sem espaço e em minúsculas são chaves/identificadores (ids, query keys, rotas).
    if (/\S\s+\S/.test(body) || (mode !== "backend" && /^[A-ZÀ-Ú]/.test(body))) texts.push(body);
  }
  if (mode !== "tsx") return texts;
  const withoutLiterals = line.replace(LITERAL, '""');
  for (const match of withoutLiterals.matchAll(JSX_TEXT)) texts.push(match[1]);
  // Linha só de texto (texto JSX quebrado em várias linhas), ignorando expressões {…}
  // e membros de tipo/objeto ("chave: valor").
  const withoutExpressions = withoutLiterals.replace(/\{[^{}]*\}/g, " ");
  if (
    !CODE_CHARS.test(withoutExpressions) &&
    !/^\s*[a-z_$][\w$]*\??:/.test(withoutExpressions) && /[A-Za-zÀ-ú]{2,}(\s+[A-Za-zÀ-ú]|[:.!?])/.test(withoutExpressions)) {
    texts.push(withoutExpressions.trim());
  }
  return texts;
}

/** Retorna os rótulos das regras violadas pela linha. */
export function findViolations(rawLine, mode = "tsx") {
  const found = new Set();
  const internalError = mode === "backend" && INTERNAL_ERROR.test(rawLine);
  for (const text of extractTexts(rawLine, mode)) {
    for (const rule of JARGON) {
      if (rule.requiresSentence && !/\s/.test(text.trim())) continue;
      if (internalError) continue;
      if (rule.pattern.test(text)) found.add(rule.label);
    }
    for (const match of text.matchAll(UNACCENTED)) found.add(match[0].toLowerCase());
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
assert.deepEqual(findViolations('  { label: "Visao geral" },'), ["visao"]);
assert.deepEqual(findViolations('  message: "Socio ja cadastrado.",'), ["socio", "ja"]);
assert.deepEqual(findViolations('  "Arquivo deve usar extensao .pfx",'), ["extensao"]);
assert.deepEqual(findViolations('  title = "Sincronizando sessao",'), ["sessao"]);
assert.deepEqual(findViolations('<p>Nao foi possível salvar.</p>'), ["nao"]);
assert.deepEqual(findViolations('  <h2>Minhas informacoes</h2>'), ["informacoes"]);
assert.deepEqual(findViolations('  label: "Competencia",', "ts"), ["competencia"]);
// Mensagens do backend: só frases contam.
assert.deepEqual(
  findViolations('    throw new ServiceError(409, "Ja existe competencia para este parcelamento.");', "backend"),
  ["ja", "competencia"],
);
assert.deepEqual(findViolations('const conflict = "Registro fechado; reabra antes de altera-lo.";', "backend"), ["altera-lo"]);
assert.deepEqual(findViolations('  return c.json({ error: "Origin não permitida pelo fiscal-service" }, 403);', "backend"), ["<x>-service"]);
assert.deepEqual(findViolations('  message: `Usuario ${id} nao encontrado.`,', "backend"), ["usuario", "nao"]);
assert.deepEqual(findViolations('  const status = "Nao";', "backend"), []);
assert.deepEqual(findViolations('    throw new ServiceError(502, "Binding ausente no task-service.");', "backend"), []);
assert.deepEqual(
  findViolations('    throw new ServiceError(503, "Falha no task-service.", undefined, undefined, { expose: true });', "backend"),
  ["<x>-service"],
);
assert.deepEqual(findViolations('    throw new ServiceError(500, "Previa de atribuicao invalida.");', "backend"), ["previa", "atribuicao", "invalida"]);
assert.deepEqual(findViolations('  console.warn("[user-service] Sessao recusada", {', "backend"), []);
assert.deepEqual(findViolations('  fallbackMessage: "Erro interno no rh-service.",', "backend"), []);
assert.deepEqual(findViolations('  )`SELECT "id" FROM "integracao.tasks" WHERE "id" = ${id}`;', "backend"), []);
assert.deepEqual(findViolations('  integracao: number'), []);
assert.deepEqual(findViolations("  integracao: '#ef5a8b',"), []);
assert.deepEqual(findViolations('  if (row.status === "competencia") return;', "backend"), []);
// Identificadores, imports, comentários, URLs e ids não disparam.
assert.deepEqual(findViolations('import { useReportSnapshot } from "../hooks/useReports";'), []);
assert.deepEqual(findViolations('  // O task-service aceita qualquer ativo.'), []);
assert.deepEqual(findViolations('    {/* Nao ha recuperacao self-service */}'), []);
assert.deepEqual(findViolations('  <p>Portal de atendimento self-service da empresa</p>'), []);
assert.deepEqual(findViolations('  <section aria-labelledby="report-snapshot-title">'), []);
assert.deepEqual(findViolations('  const snapshot = useReportSnapshot(id);'), []);
assert.deepEqual(findViolations('  <ReportResultBlocks blocks={blocks} snapshot />'), []);
assert.deepEqual(findViolations('  legacyTaxRegime={client.regime}'), []);
assert.deepEqual(findViolations('  const key = ["reports", "snapshot", id];'), []);
assert.deepEqual(findViolations('  <p>Visão geral do sócio já cadastrado</p>'), []);
assert.deepEqual(findViolations('  <p>Número do período e código de sessão válidos</p>'), []);
assert.equal(stripLineComment('  const url = "https://exemplo.com"; // nao conta'), '  const url = "https://exemplo.com"; ');
assert.deepEqual(findViolations('  <a href="https://exemplo.com/nao">Ver site</a> // sessao'), []);
assert.deepEqual(findViolations('  toast("Veja https://exemplo.com, nao perca");'), ["nao"]);

const SKIP_DIRS = new Set(["node_modules", "generated", "openapi", "__tests__", "test", "tests", "dist"]);
const SKIP_FILE = /\.(test|spec)\.tsx?$|\.d\.ts$/;
// No backend, config de ambiente e bootstrap só falam com quem opera o serviço.
const BACKEND_SKIP_PATH = /[\\/](config|scripts)[\\/]|[\\/]server\.ts$/;

function listSources(dir, extensions, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) listSources(full, extensions, files);
    } else if (extensions.some((ext) => entry.name.endsWith(ext)) && !SKIP_FILE.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function backendRoots() {
  const roots = [join(repoRoot, "shared/src")];
  for (const group of ["workers", "services"]) {
    for (const entry of readdirSync(join(repoRoot, group), { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(join(repoRoot, group, entry.name, "src"));
    }
  }
  return roots.filter((dir) => {
    try {
      return readdirSync(dir) && true;
    } catch {
      return false;
    }
  });
}

const targets = [
  ...listSources(join(repoRoot, "app/src"), [".tsx", ".ts"]).map((file) => ({
    file,
    mode: file.endsWith(".tsx") ? "tsx" : "ts",
  })),
  ...backendRoots().flatMap((dir) =>
    listSources(dir, [".ts"])
      .filter((file) => !BACKEND_SKIP_PATH.test(file))
      .map((file) => ({ file, mode: "backend" })),
  ),
];

const violations = [];
for (const { file, mode } of targets) {
  const path = relative(repoRoot, file).replaceAll("\\", "/");
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      const labels = findViolations(line, mode);
      if (labels.length === 0) return;
      if (ALLOWLIST.some((entry) => entry.file === path && line.includes(entry.text))) return;
      violations.push(`${path}:${index + 1} [${labels.join(", ")}] ${line.trim()}`);
    });
}

assert.equal(
  violations.length,
  0,
  `Textos com jargão técnico ou sem acento (${violations.length}):\n${violations.join("\n")}`,
);

console.log("ui copy guard tests passed");
