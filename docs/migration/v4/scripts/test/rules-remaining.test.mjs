import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { REMAINING_EVIDENCE } from "../evidence/index.mjs";
import { REQUIRED_IDENTITY_NAMESPACE, validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";
import * as ruleExports from "../rules/index.mjs";
import {
  ADMIN_BUSINESS_RULES,
  buildCbsStockCategoryContexts,
  buildCbsStockContexts,
  buildCbsStockEntryContexts,
  buildCbsStockExitContexts,
  buildCbsStockLocationContexts,
  buildMarketingPasswordContexts,
  buildMarketingSocialContexts,
  buildPecNoteContexts,
  buildRemainingReferenceContext,
  buildRuleRegistry,
  buildTriageClientSlotContexts,
  buildWorkspaceCategoryContexts,
  buildWorkspaceMessageContexts,
  buildWorkspaceRequestContexts,
  CERTIFICATE_RULES,
  createV2ClientIdentityResolver,
  INTEGRACAO_REGULARIZE_RULES,
  PARCELAMENTO_RULES,
  REMAINING_RULES,
  RH_PESSOAL_RULES,
  TECHNOLOGY_RULES,
  V2_RULES,
} from "../rules/index.mjs";
import { REMAINING_TRANSFORMERS } from "../rules/remaining.mjs";

const DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
const LEGACY_ROOT = "/home/bruno/Documents/workspace2";
const THIS_TEST_FILE = fileURLToPath(import.meta.url);
const SENSITIVE_DUMP_FIELDS = Object.freeze([
  ["tb_admin.departamentos", ["id", "nome"]],
  ["tb_admin.usuarios", ["id"]],
  ["tb_cbc.emails", ["id", "email", "responsavel"]],
  ["tb_cbs.estoque", ["id", "quantidade"]],
  ["tb_cbs.estoque_andares", ["id", "nome"]],
  ["tb_cbs.estoque_categorias", ["id", "nome"]],
  ["tb_cbs.estoque_entradas", ["id", "quantidade", "data_entrada"]],
  ["tb_cbs.estoque_inventario", ["id", "tipo_item", "tag", "status"]],
  ["tb_cbs.estoque_itens", ["id", "nome", "descricao", "status"]],
  ["tb_cbs.estoque_localizacoes", ["id", "nome"]],
  ["tb_cbs.estoque_saidas", ["id", "quantidade", "data_saida", "destino", "obs"]],
  ["tb_mkt.redes_sociais", ["id", "instagram"]],
  ["tb_mkt.senhas", ["id", "local", "user", "password", "obs"]],
  [
    "tb_pec.notas",
    [
      "id",
      "tarefa",
      "cadastro",
      "previsao",
      "conclusao",
      "inicio_semana",
      "fim_semana",
      "cadastro_original",
    ],
  ],
  ["tb_triagem.campos", ["id", "cliente_id"]],
  ["tb_workspace.solicitacoes", ["id", "titulo", "descricao", "data_cadastro", "data_atualizacao"]],
  ["tb_workspace.solicitacoes_categorias", ["id", "nome"]],
  ["tb_workspace.solicitacoes_mensagens", ["id", "mensagem", "data_envio"]],
]);
const EMBEDDED_SENSITIVE_DUMP_FIELDS = new Map([
  [
    "tb_cbc.emails",
    [
      ["email", 4],
      ["responsavel", 4],
    ],
  ],
  ["tb_cbs.estoque_categorias", [["nome", 8]]],
  [
    "tb_cbs.estoque_inventario",
    [
      ["tipo_item", 8],
      ["tag", 8],
    ],
  ],
  [
    "tb_cbs.estoque_itens",
    [
      ["nome", 8],
      ["descricao", 8],
    ],
  ],
  ["tb_cbs.estoque_localizacoes", [["nome", 8]]],
  [
    "tb_cbs.estoque_saidas",
    [
      ["destino", 8],
      ["obs", 8],
    ],
  ],
  ["tb_mkt.redes_sociais", [["instagram", 4]]],
  [
    "tb_mkt.senhas",
    [
      ["local", 4],
      ["user", 4],
      ["password", 4],
      ["obs", 4],
    ],
  ],
  ["tb_pec.notas", [["tarefa", 8]]],
  [
    "tb_workspace.solicitacoes",
    [
      ["titulo", 8],
      ["descricao", 8],
    ],
  ],
  ["tb_workspace.solicitacoes_categorias", [["nome", 8]]],
  ["tb_workspace.solicitacoes_mensagens", [["mensagem", 8]]],
]);
const STRING_LITERAL_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);
const rowsCache = new Map();
let clientResolverPromise;

function rule(sourceTable) {
  const found = REMAINING_RULES.find((item) => item.sourceTable === sourceTable);
  assert.ok(found, sourceTable);
  return found;
}

async function declaredColumns(sourceTable) {
  const dump = await readFile(path.join(DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const body = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1] ?? "";
  return [...body.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

async function loadRows(sourceTable) {
  if (!rowsCache.has(sourceTable)) {
    const rows = [];
    for await (const row of iterateSqlRows(path.join(DUMP_ROOT, `${sourceTable}.sql`))) {
      rows.push(row);
    }
    rowsCache.set(sourceTable, rows);
  }
  return rowsCache.get(sourceTable);
}

async function findLegacySourceContaining(rootDirectory, marker) {
  const pendingDirectories = [rootDirectory];
  const sourceExtensions = new Set([".htm", ".html", ".js", ".php"]);
  const skippedDirectories = new Set([".git", "node_modules", "vendor"]);

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory() && !skippedDirectories.has(entry.name)) {
        pendingDirectories.push(entryPath);
      } else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
        const content = await readFile(entryPath, "utf8");
        if (marker.test(content)) {
          return content;
        }
      }
    }
  }

  return null;
}

async function auditedClientResolver() {
  clientResolverPromise ??= Promise.all([
    loadRows("tb_regularize.clientes"),
    loadRows("tb_integracao.clientes"),
  ]).then(([regularizeRows, integrationRows]) =>
    createV2ClientIdentityResolver({ regularizeRows, integrationRows }),
  );
  return clientResolverPromise;
}

function summary(emissions) {
  return Object.fromEntries(
    [...Map.groupBy(emissions, ({ status }) => status)].map(([status, items]) => [
      status,
      items.length,
    ]),
  );
}

function reasonCount(emissions, reasonCode) {
  return emissions.filter((emission) => emission.reasonCode === reasonCode).length;
}

function assertBoolean(value) {
  assert.equal(value, true);
}

function normalizedSensitiveText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function sensitiveDigest(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function extractDecodedStringLiterals(source) {
  const sourceFile = ts.createSourceFile(
    "sensitive-literal-audit.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  assertBoolean(sourceFile.parseDiagnostics.length === 0);
  const literals = [];

  function visit(node) {
    if (STRING_LITERAL_KINDS.has(node.kind)) {
      literals.push({
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        node,
        normalizedText: String(node.text).toLocaleLowerCase("pt-BR"),
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return literals;
}

function isLocalizedStructuralLiteral(node) {
  let ancestor = node.parent;
  while (ancestor && !ts.isSourceFile(ancestor)) {
    if (ts.isVariableDeclaration(ancestor) && ts.isIdentifier(ancestor.name)) {
      const { initializer } = ancestor;
      if (
        ancestor.name.text === "SENSITIVE_DUMP_FIELDS" &&
        initializer &&
        ts.isCallExpression(initializer) &&
        ts.isPropertyAccessExpression(initializer.expression) &&
        ts.isIdentifier(initializer.expression.expression) &&
        initializer.expression.expression.text === "Object" &&
        initializer.expression.name.text === "freeze"
      ) {
        return true;
      }
      if (
        ancestor.name.text === "EMBEDDED_SENSITIVE_DUMP_FIELDS" &&
        initializer &&
        ts.isNewExpression(initializer) &&
        ts.isIdentifier(initializer.expression) &&
        initializer.expression.text === "Map"
      ) {
        return true;
      }
      return false;
    }
    ancestor = ancestor.parent;
  }
  return false;
}

function enclosingVariableDeclaration(node) {
  let ancestor = node.parent;
  while (ancestor && !ts.isSourceFile(ancestor)) {
    if (ts.isVariableDeclaration(ancestor)) {
      return ancestor;
    }
    ancestor = ancestor.parent;
  }
  return null;
}

function isLocalizedContractLiteral(node) {
  const declaration = enclosingVariableDeclaration(node);
  return Boolean(
    declaration &&
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === "triageFields" &&
      declaration.initializer &&
      ts.isArrayLiteralExpression(declaration.initializer),
  );
}

function isLocalizedBackupRootIdentity(node) {
  const declaration = enclosingVariableDeclaration(node);
  return Boolean(
    declaration &&
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === "DUMP_ROOT" &&
      declaration.initializer === node,
  );
}

function isAllowedStructuralUsage(node, normalizedText, allowedStructuralValues) {
  if (!allowedStructuralValues.has(normalizedText)) {
    return false;
  }
  if (isLocalizedStructuralLiteral(node)) {
    return true;
  }

  const parent = node.parent;
  if (ts.isCallExpression(parent) && parent.arguments.includes(node)) {
    const allowedCalls = new Set([
      "assertOrganization",
      "generatedIdentity",
      "loadRows",
      "projectPreparedSample",
      "rule",
    ]);
    if (ts.isIdentifier(parent.expression) && allowedCalls.has(parent.expression.text)) {
      return true;
    }
  }
  if (
    ts.isPropertyAssignment(parent) &&
    parent.initializer === node &&
    ts.isIdentifier(parent.name) &&
    parent.name.text === "sourceTable"
  ) {
    return true;
  }

  let ancestor = parent;
  while (ancestor && !ts.isSourceFile(ancestor)) {
    if (
      ts.isCallExpression(ancestor) &&
      ts.isIdentifier(ancestor.expression) &&
      ancestor.expression.text === "assertPayloadKeys" &&
      ancestor.arguments[1] &&
      ancestor.arguments[1].getStart() <= node.getStart() &&
      ancestor.arguments[1].getEnd() >= node.getEnd()
    ) {
      return true;
    }
    if (
      ts.isCallExpression(ancestor) &&
      ts.isPropertyAccessExpression(ancestor.expression) &&
      ancestor.expression.name.text === "map" &&
      ancestor.arguments.length === 1 &&
      ts.isIdentifier(ancestor.arguments[0]) &&
      ancestor.arguments[0].text === "loadRows" &&
      ancestor.expression.expression.getStart() <= node.getStart() &&
      ancestor.expression.expression.getEnd() >= node.getEnd()
    ) {
      return true;
    }
    ancestor = ancestor.parent;
  }

  const declaration = enclosingVariableDeclaration(node);
  return Boolean(
    declaration &&
      ts.isIdentifier(declaration.name) &&
      ["cases", "expectedFields"].includes(declaration.name.text) &&
      declaration.initializer &&
      (ts.isArrayLiteralExpression(declaration.initializer) ||
        ts.isObjectLiteralExpression(declaration.initializer)),
  );
}

function isTokenCharacter(character) {
  return character !== undefined && /[\p{L}\p{N}_]/u.test(character);
}

function indexSensitiveCandidates(candidates) {
  const exact = new Set();
  const embedded = new Set();
  const identities = new Set();
  const identityLengthsByFirstCharacter = new Map();

  for (const { kind, normalizedValue } of candidates) {
    if (kind === "exact") {
      exact.add(normalizedValue);
    } else if (kind === "embedded") {
      embedded.add(normalizedValue);
    } else if (kind === "identity") {
      identities.add(normalizedValue);
      const firstCharacter = normalizedValue[0];
      if (!identityLengthsByFirstCharacter.has(firstCharacter)) {
        identityLengthsByFirstCharacter.set(firstCharacter, new Set());
      }
      identityLengthsByFirstCharacter.get(firstCharacter).add(normalizedValue.length);
    }
  }

  return {
    embedded: [...embedded],
    exact,
    identities,
    identityLengthsByFirstCharacter,
  };
}

function identityMatches(content, candidateIndex) {
  const matches = [];
  for (let start = 0; start < content.length; start += 1) {
    if (start > 0 && isTokenCharacter(content[start - 1])) {
      continue;
    }
    const lengths = candidateIndex.identityLengthsByFirstCharacter.get(content[start]);
    if (!lengths) {
      continue;
    }
    for (const length of lengths) {
      const end = start + length;
      const value = content.slice(start, end);
      if (candidateIndex.identities.has(value) && !isTokenCharacter(content[end])) {
        matches.push(value);
      }
    }
  }
  return matches;
}

function findSensitiveLiteralMatches(source, candidates, options = {}) {
  const allowedStructuralValues = options.allowedStructuralValues ?? new Set();
  const candidateIndex = indexSensitiveCandidates(candidates);
  const matches = [];

  for (const literal of extractDecodedStringLiterals(source)) {
    const candidateMatches = [];
    const trimmedText = literal.normalizedText.trim();
    if (candidateIndex.exact.has(trimmedText)) {
      candidateMatches.push({ kind: "exact", normalizedValue: trimmedText });
    }
    for (const normalizedValue of candidateIndex.embedded) {
      if (literal.normalizedText.includes(normalizedValue)) {
        candidateMatches.push({ kind: "embedded", normalizedValue });
      }
    }
    for (const normalizedValue of identityMatches(literal.normalizedText, candidateIndex)) {
      candidateMatches.push({ kind: "identity", normalizedValue });
    }

    const unallowedMatch = candidateMatches.find(
      ({ kind }) =>
        !isAllowedStructuralUsage(literal.node, trimmedText, allowedStructuralValues) &&
        !isLocalizedContractLiteral(literal.node) &&
        !(kind === "identity" && isLocalizedBackupRootIdentity(literal.node)),
    );
    if (unallowedMatch) {
      const parent = literal.node.parent;
      const call = ts.isCallExpression(parent) ? parent : undefined;
      const calledIdentifier =
        call && ts.isIdentifier(call.expression) ? call.expression.text : null;
      const calledMethod =
        call && ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : null;
      matches.push({
        arrayElement: ts.isArrayLiteralExpression(parent),
        binaryOperand: ts.isBinaryExpression(parent),
        digest: sensitiveDigest(unallowedMatch.normalizedValue),
        embedded: unallowedMatch.kind === "embedded",
        exact: unallowedMatch.kind === "exact",
        identity: unallowedMatch.kind === "identity",
        includesArgument: calledMethod === "includes",
        kind: unallowedMatch.kind,
        knownStructuralLiteral: allowedStructuralValues.has(trimmedText),
        line: literal.line,
        literalDigest: sensitiveDigest(literal.normalizedText),
        loadRowsArgument: calledIdentifier === "loadRows",
        ruleArgument: calledIdentifier === "rule",
        startsWithArgument: calledMethod === "startsWith",
        testTitle: calledIdentifier === "test" && call.arguments[0] === literal.node,
      });
    }
  }

  return matches;
}

function buildSensitiveLiteralCandidates(rowsByTable) {
  const candidates = new Map();
  const register = (kind, value) => {
    const normalizedValue = normalizedSensitiveText(value);
    if (normalizedValue.length > 0) {
      candidates.set(`${kind}\0${normalizedValue}`, { kind, normalizedValue });
    }
  };

  for (const { fields, rows, sourceTable } of rowsByTable) {
    for (const row of rows) {
      for (const field of fields) {
        const value = String(row[field] ?? "").trim();
        if (field === "id" || field.endsWith("_id")) {
          if (value.length >= 2) {
            register("identity", value);
          }
        } else if (value.length >= 4) {
          register("exact", value);
        }
      }
      for (const [field, minimumLength] of EMBEDDED_SENSITIVE_DUMP_FIELDS.get(sourceTable) ?? []) {
        const value = String(row[field] ?? "").trim();
        if (value.length >= minimumLength) {
          register("embedded", value);
        }
      }
    }
  }

  return [...candidates.values()];
}

function normalizedText(value) {
  const text = String(value ?? "").trim();
  return text.length === 0 ? null : text;
}

function normalizedZeroDate(value) {
  const text = String(value ?? "").trim();
  return text.length === 0 || text.startsWith("0000-00-00") ? null : text;
}

function generatedIdentity(sourceTable, sourceKey) {
  return uuidV5(REQUIRED_IDENTITY_NAMESPACE, `${sourceTable}:${String(sourceKey).trim()}`);
}

function resolvedIdentity(context, name) {
  return uuidV5(REQUIRED_IDENTITY_NAMESPACE, context.resolutions[name].identityRef);
}

function assertPayloadKeys(payload, keys) {
  assertBoolean(Object.keys(payload).sort().join("\n") === [...keys].sort().join("\n"));
}

function assertOrganization(payload, sourceTable) {
  assertBoolean(
    payload.organization_id === rule(sourceTable).destinations[0].constants.organization_id,
  );
}

function projectPreparedSample(sourceTable, rows, contexts, predicate = () => true) {
  const mappingRule = rule(sourceTable);
  const index = rows.findIndex(
    (row, candidateIndex) =>
      mappingRule.emitRows(row, contexts[candidateIndex])[0].status === "prepared" &&
      predicate(row, contexts[candidateIndex]),
  );
  assertBoolean(index >= 0);
  const audit = ruleExports.projectRemainingRow({
    sourceTable,
    row: rows[index],
    context: contexts[index],
  });
  assertBoolean(audit.decision.status === "prepared");
  assertBoolean(audit.payload !== null);
  return { row: rows[index], context: contexts[index], payload: audit.payload };
}

test("barreira decodifica literais e aplica boundaries sem exceção global", async () => {
  const [rows, longIdentityRows] = await Promise.all([
    loadRows("tb_triagem.campos"),
    loadRows("tb_pec.notas"),
  ]);
  const sensitiveIdentity = rows
    .map((row) => String(row.id ?? "").trim())
    .find((value) => /^\d{2,3}$/.test(value));
  const longSensitiveIdentity = longIdentityRows
    .map((row) => String(row.id ?? "").trim())
    .find((value) => /^\d{4,}$/.test(value));
  assertBoolean(sensitiveIdentity !== undefined);
  assertBoolean(longSensitiveIdentity !== undefined);

  const escapedIdentity = [...sensitiveIdentity]
    .map((character) => `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`)
    .join("");
  const blockedSources = [
    `const value = ${JSON.stringify(sensitiveIdentity)};`,
    `const value = '${sensitiveIdentity}';`,
    `const value = \`${sensitiveIdentity}\`;`,
    `const value = "prefix:${sensitiveIdentity}:suffix";`,
    `const value = \`prefix:${sensitiveIdentity}:\${runtimeSuffix}\`;`,
    `const value = "${escapedIdentity}";`,
  ];
  const boundarySources = [
    `const value = "${sensitiveIdentity}0";`,
    `const value = "prefix${sensitiveIdentity}suffix";`,
  ];
  const localizedExceptionSource = [
    "const SENSITIVE_DUMP_FIELDS = Object.freeze([",
    `  ["synthetic.table", ["${sensitiveIdentity}"]],`,
    "]);",
    `const leakedElsewhere = '${sensitiveIdentity}';`,
  ].join("\n");
  const localizedContractSource = [
    "const triageFields = [",
    `  ["synthetic_source", "${sensitiveIdentity}"],`,
    "];",
    `const leakedElsewhere = \`${sensitiveIdentity}\`;`,
  ].join("\n");
  const localizedBackupRootSource = [
    `const DUMP_ROOT = "/synthetic/${longSensitiveIdentity}";`,
    `const leakedElsewhere = "prefix:${longSensitiveIdentity}:suffix";`,
  ].join("\n");
  const candidate = {
    kind: "identity",
    normalizedValue: sensitiveIdentity.toLocaleLowerCase("pt-BR"),
  };
  const allowedStructuralValues = new Set([candidate.normalizedValue]);
  const longIdentityCandidate = {
    kind: "identity",
    normalizedValue: longSensitiveIdentity.toLocaleLowerCase("pt-BR"),
  };

  assertBoolean(
    blockedSources.every((source) => findSensitiveLiteralMatches(source, [candidate]).length === 1),
  );
  assertBoolean(
    boundarySources.every(
      (source) => findSensitiveLiteralMatches(source, [candidate]).length === 0,
    ),
  );
  assertBoolean(
    findSensitiveLiteralMatches(localizedExceptionSource, [candidate], {
      allowedStructuralValues,
    }).length === 1,
  );
  assertBoolean(findSensitiveLiteralMatches(localizedContractSource, [candidate]).length === 1);
  assertBoolean(
    findSensitiveLiteralMatches(localizedBackupRootSource, [longIdentityCandidate]).length === 1,
  );
});

test("fonte do teste não versiona valores sensíveis derivados dos dumps", async () => {
  const source = await readFile(THIS_TEST_FILE, "utf8");
  const rowsByTable = await Promise.all(
    SENSITIVE_DUMP_FIELDS.map(async ([sourceTable, fields]) => ({
      fields,
      rows: await loadRows(sourceTable),
      sourceTable,
    })),
  );
  const candidates = buildSensitiveLiteralCandidates(rowsByTable);
  const allowedStructuralValues = new Set(
    SENSITIVE_DUMP_FIELDS.flatMap(([sourceTable, fields]) => [sourceTable, ...fields]).map(
      normalizedSensitiveText,
    ),
  );
  const matches = findSensitiveLiteralMatches(source, candidates, { allowedStructuralValues });
  if (process.env.MIGRATION_V4_SENSITIVE_AUDIT_METADATA === "1") {
    console.log(
      JSON.stringify({
        count: matches.length,
        matches: matches.map(
          ({
            arrayElement,
            binaryOperand,
            digest,
            embedded,
            exact,
            identity,
            includesArgument,
            knownStructuralLiteral,
            line,
            literalDigest,
            loadRowsArgument,
            ruleArgument,
            startsWithArgument,
            testTitle,
          }) => ({
            arrayElement,
            binaryOperand,
            digest,
            embedded,
            exact,
            identity,
            includesArgument,
            knownStructuralLiteral,
            line,
            literalDigest,
            loadRowsArgument,
            ruleArgument,
            startsWithArgument,
            testTitle,
          }),
        ),
      }),
    );
  }
  assertBoolean(matches.length === 0);
});

async function stockContexts() {
  const [rows, departmentRows, itemRows, categoryRows, categoryItemRows, locationRows, floorRows] =
    await Promise.all(
      [
        "tb_cbs.estoque",
        "tb_admin.departamentos",
        "tb_cbs.estoque_itens",
        "tb_cbs.estoque_categorias",
        "tb_cbs.estoque_categorias_itens",
        "tb_cbs.estoque_localizacoes",
        "tb_cbs.estoque_andares",
      ].map(loadRows),
    );
  const categoryContexts = buildCbsStockCategoryContexts({
    rows: categoryRows,
    departmentRows,
  });
  const locationContexts = buildCbsStockLocationContexts({
    rows: locationRows,
    floorRows,
    departmentRows,
  });
  return {
    rows,
    categoryRows,
    categoryContexts,
    locationRows,
    locationContexts,
    contexts: buildCbsStockContexts({
      rows,
      departmentRows,
      itemRows,
      categoryRows,
      categoryContexts,
      categoryItemRows,
      locationRows,
      locationContexts,
      floorRows,
    }),
  };
}

async function workspaceContexts() {
  const [categoryRows, requestRows, messageRows, departmentRows, userRows] = await Promise.all(
    [
      "tb_workspace.solicitacoes_categorias",
      "tb_workspace.solicitacoes",
      "tb_workspace.solicitacoes_mensagens",
      "tb_admin.departamentos",
      "tb_admin.usuarios",
    ].map(loadRows),
  );
  const categoryContexts = buildWorkspaceCategoryContexts({ rows: categoryRows, departmentRows });
  const requestContexts = buildWorkspaceRequestContexts({
    rows: requestRows,
    userRows,
    departmentRows,
    categoryRows,
    categoryContexts,
  });
  const messageContexts = buildWorkspaceMessageContexts({
    rows: messageRows,
    requestRows,
    requestContexts,
    userRows,
  });
  return {
    categoryRows,
    categoryContexts,
    requestRows,
    requestContexts,
    messageRows,
    messageContexts,
    departmentRows,
    userRows,
  };
}

test("registry final contém cento e quatro regras; ramais reclassificados não possuem emissor", () => {
  const previous = [
    V2_RULES,
    RH_PESSOAL_RULES,
    TECHNOLOGY_RULES,
    CERTIFICATE_RULES,
    PARCELAMENTO_RULES,
    ADMIN_BUSINESS_RULES,
    INTEGRACAO_REGULARIZE_RULES,
  ];
  const registry = buildRuleRegistry(...previous.slice(1), REMAINING_RULES);
  const confirmed = REMAINING_EVIDENCE.filter(({ finalStatus }) => finalStatus === "confirmed");
  const pending = REMAINING_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending");

  assert.equal(REMAINING_RULES.length, 16);
  assert.equal(confirmed.length, 16);
  assert.equal(pending.length, 71);
  assert.equal(registry.size, 105);
  assert.equal(registry.has("tb_cbs.ramais"), false);
  assert.deepEqual(
    REMAINING_RULES.map(({ sourceTable }) => sourceTable),
    confirmed.map(({ sourceTable }) => sourceTable),
  );
});

test("projeções diretas delegam os transformadores ao adaptador de runtime", () => {
  assert.deepEqual(REMAINING_TRANSFORMERS, {});
});

test("as quatorze regras e todas as colunas reais são válidas no Prisma atual", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  for (const mappingRule of REMAINING_RULES) {
    assert.equal(validateMappingRule(mappingRule, catalog), true, mappingRule.sourceTable);
    const expected = await declaredColumns(mappingRule.sourceTable);
    const classified = new Set(
      mappingRule.destinations.flatMap(({ columns }) =>
        columns.flatMap(({ sourceColumn }) => (sourceColumn === null ? [] : [sourceColumn])),
      ),
    );
    assert.deepEqual([...classified].sort(), expected.sort(), mappingRule.sourceTable);
  }
});

test("proveniência opaca rejeita fabricação, spread, clone, mistura, mutação e subset", async () => {
  const mappingRule = rule("tb_cbs.estoque");
  const { rows, contexts } = await stockContexts();
  const preparedIndex = contexts.findIndex(
    (context, index) => mappingRule.emitRows(rows[index], context)[0].status === "prepared",
  );
  assert.notEqual(preparedIndex, -1);
  const row = rows[preparedIndex];
  const context = contexts[preparedIndex];
  const otherContext = contexts[preparedIndex + 1];

  const fabricated = buildRemainingReferenceContext({
    sourceTable: mappingRule.sourceTable,
    row,
    resolutions: context.resolutions,
  });
  assert.equal(mappingRule.emitRows(row, fabricated)[0].reasonCode, "REFERENCE_CONTEXT_INVALID");
  assert.equal(
    mappingRule.emitRows(row, { ...context })[0].reasonCode,
    "REFERENCE_CONTEXT_INVALID",
  );
  assert.equal(
    mappingRule.emitRows(row, structuredClone(context))[0].reasonCode,
    "REFERENCE_CONTEXT_INVALID",
  );
  const mixed = buildRemainingReferenceContext({
    sourceTable: mappingRule.sourceTable,
    row,
    resolutions: { ...context.resolutions, item: otherContext.resolutions.item },
  });
  assert.equal(mappingRule.emitRows(row, mixed)[0].reasonCode, "REFERENCE_CONTEXT_INVALID");
  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.resolutions.item), true);
  assert.throws(() => {
    context.resolutions.item.sourceKey = "__synthetic_reference__";
  }, TypeError);

  const args = await Promise.all(
    [
      "tb_admin.departamentos",
      "tb_cbs.estoque_itens",
      "tb_cbs.estoque_categorias",
      "tb_cbs.estoque_categorias_itens",
      "tb_cbs.estoque_localizacoes",
      "tb_cbs.estoque_andares",
    ].map(loadRows),
  );
  assert.throws(
    () =>
      buildCbsStockContexts({
        rows: rows.slice(1),
        departmentRows: args[0],
        itemRows: args[1],
        categoryRows: args[2],
        categoryItemRows: args[3],
        locationRows: args[4],
        floorRows: args[5],
      }),
    /corpus completo auditado.*tb_cbs\.estoque/i,
  );
  assert.equal(mappingRule.emitRows(row, context)[0].status, "prepared");
});

test("estoque CBS preserva campos do item e aplica escopo e joins reais", async () => {
  const mappingRule = rule("tb_cbs.estoque");
  const { rows, contexts } = await stockContexts();
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const step = mappingRule.destinations[0];
  const itemRows = await loadRows("tb_cbs.estoque_itens");
  const itemById = new Map(itemRows.map((row) => [row.id, row]));

  assert.deepEqual(summary(emissions), { prepared: 75, quarantine: 358 });
  assert.equal(reasonCount(emissions, "CBS_STOCK_NOT_TECHNOLOGY"), 228);
  assert.equal("description" in step.defaults, false);
  assert.equal("status" in step.defaults, false);
  assert.equal(
    step.columns.find(({ destinationColumn }) => destinationColumn === "description")
      ?.transformation,
    "resolve_stock_item_description",
  );
  assert.equal(
    step.columns.find(({ destinationColumn }) => destinationColumn === "status")?.transformation,
    "map_legacy_stock_item_zero_active_status",
  );
  const activeWithoutDescriptionIndexes = rows.flatMap((_row, index) =>
    contexts[index].resolutions.item.itemActive === true &&
    contexts[index].resolutions.item.itemDescription === null &&
    emissions[index].reasonCode === "CBS_STOCK_NOT_TECHNOLOGY"
      ? [index]
      : [],
  );
  assertBoolean(activeWithoutDescriptionIndexes.length > 0);
  assertBoolean(
    activeWithoutDescriptionIndexes.every(
      (index) =>
        String(itemById.get(contexts[index].resolutions.item.sourceKey)?.status).trim() === "0",
    ),
  );
});

test("pais transversais de estoque exigem decisões opacas prepared de categoria e localização", async () => {
  const { rows, contexts, categoryRows, categoryContexts, locationRows, locationContexts } =
    await stockContexts();
  const mappingRule = rule("tb_cbs.estoque");
  const preparedIndexes = rows.flatMap((row, index) =>
    mappingRule.emitRows(row, contexts[index])[0].status === "prepared" ? [index] : [],
  );
  assert.equal(preparedIndexes.length, 75);
  assert.equal(
    preparedIndexes.every(
      (index) =>
        contexts[index].resolutions.category.migrationState === "prepared" &&
        contexts[index].resolutions.location.migrationState === "prepared",
    ),
    true,
  );
  const quarantinedParentIndexes = rows.flatMap((_row, index) =>
    contexts[index].resolutions.category.migrationState !== "prepared" ||
    contexts[index].resolutions.location.migrationState !== "prepared"
      ? [index]
      : [],
  );
  assert.ok(quarantinedParentIndexes.length > 0);
  assert.equal(
    quarantinedParentIndexes.every(
      (index) => mappingRule.emitRows(rows[index], contexts[index])[0].status !== "prepared",
    ),
    true,
  );
  const [departmentRows, itemRows, categoryItemRows, floorRows] = await Promise.all(
    [
      "tb_admin.departamentos",
      "tb_cbs.estoque_itens",
      "tb_cbs.estoque_categorias_itens",
      "tb_cbs.estoque_andares",
    ].map(loadRows),
  );
  const args = {
    rows,
    departmentRows,
    itemRows,
    categoryRows,
    categoryItemRows,
    locationRows,
    locationContexts,
    floorRows,
  };
  assert.throws(
    () =>
      buildCbsStockContexts({
        ...args,
        categoryContexts: categoryContexts.map((context) => ({ ...context })),
      }),
    /preflight opaco/i,
  );
  assert.throws(
    () => buildCbsStockContexts({ ...args, categoryContexts: categoryContexts.slice(1) }),
    /preflight opaco completo/i,
  );
  assert.throws(
    () => buildCbsStockContexts({ ...args, locationContexts: locationContexts.slice(1) }),
    /preflight opaco completo/i,
  );
});

test("entrada e saída só preparam quando estoque e usuários-pai também preparam", async () => {
  const { rows: stockRows, contexts: stockRuleContexts } = await stockContexts();
  const stockRule = rule("tb_cbs.estoque");
  const preparedStockIds = new Set(
    stockRows.flatMap((row, index) =>
      stockRule.emitRows(row, stockRuleContexts[index])[0].status === "prepared" ? [row.id] : [],
    ),
  );
  const userRows = await loadRows("tb_admin.usuarios");
  const userRule = V2_RULES.find(({ sourceTable }) => sourceTable === "tb_admin.usuarios");
  assertBoolean(userRule !== undefined);
  const userEmissions = userRows.map((row) => userRule.emitRows(row)[0]);
  const preparedUserIds = new Set(
    userRows.flatMap((row, index) => (userEmissions[index].status === "prepared" ? [row.id] : [])),
  );
  const quarantinedUserIds = new Set(
    userRows.flatMap((row, index) =>
      userEmissions[index].status === "quarantine" ? [row.id] : [],
    ),
  );
  assert.equal(preparedUserIds.size, 305);
  assert.equal(quarantinedUserIds.size, 1);

  const entryRows = await loadRows("tb_cbs.estoque_entradas");
  const entryContexts = buildCbsStockEntryContexts({
    rows: entryRows,
    stockRows,
    stockContexts: stockRuleContexts,
    userRows,
  });
  const exitRows = await loadRows("tb_cbs.estoque_saidas");
  const exitContexts = buildCbsStockExitContexts({
    rows: exitRows,
    stockRows,
    stockContexts: stockRuleContexts,
    userRows,
  });
  const preparedEntries = entryRows.filter(
    (row, index) =>
      rule("tb_cbs.estoque_entradas").emitRows(row, entryContexts[index])[0].status === "prepared",
  );
  const preparedExits = exitRows.filter(
    (row, index) =>
      rule("tb_cbs.estoque_saidas").emitRows(row, exitContexts[index])[0].status === "prepared",
  );

  assertBoolean(preparedEntries.every(({ produto_id }) => preparedStockIds.has(produto_id)));
  assertBoolean(preparedExits.every(({ produto_id }) => preparedStockIds.has(produto_id)));
  assertBoolean(preparedEntries.every(({ repositor }) => preparedUserIds.has(repositor)));
  assertBoolean(
    preparedExits.every((row) =>
      [row.solicitante, row.autorizador, row.operador]
        .filter((sourceKey) => !["", "0"].includes(String(sourceKey).trim()))
        .every((sourceKey) => preparedUserIds.has(sourceKey)),
    ),
  );

  const entryWithQuarantinedUser = entryRows.findIndex(({ repositor }) =>
    quarantinedUserIds.has(repositor),
  );
  if (entryWithQuarantinedUser >= 0) {
    assertBoolean(
      entryContexts[entryWithQuarantinedUser].resolutions.user.migrationState === "quarantine",
    );
  }
  const exitWithQuarantinedUser = exitRows.findIndex(({ solicitante, autorizador, operador }) =>
    [solicitante, autorizador, operador].some((sourceKey) => quarantinedUserIds.has(sourceKey)),
  );
  if (exitWithQuarantinedUser >= 0) {
    assertBoolean(
      ["requester", "approver", "operator"]
        .map((name) => exitContexts[exitWithQuarantinedUser].resolutions[name])
        .filter((resolution) => quarantinedUserIds.has(resolution?.sourceKey))
        .every(({ migrationState }) => migrationState === "quarantine"),
    );
  }
});

test("localização CBS resolve o rótulo real do andar sem converter ID externo", async () => {
  const [rows, floorRows, departmentRows] = await Promise.all(
    ["tb_cbs.estoque_localizacoes", "tb_cbs.estoque_andares", "tb_admin.departamentos"].map(
      loadRows,
    ),
  );
  const contexts = buildCbsStockLocationContexts({ rows, floorRows, departmentRows });
  const emissions = rows.map(
    (row, index) => rule("tb_cbs.estoque_localizacoes").emitRows(row, contexts[index])[0],
  );
  assert.deepEqual(summary(emissions), { quarantine: 25, prepared: 2 });
  const zeroFloorIndex = contexts.findIndex(
    (context, index) =>
      context.resolutions.floor.floor === 0 && emissions[index].status === "prepared",
  );
  assertBoolean(zeroFloorIndex >= 0);
  const zeroFloorSource = floorRows.find(
    (row) => row.id === contexts[zeroFloorIndex].resolutions.floor.sourceKey,
  );
  assertBoolean(
    contexts[zeroFloorIndex].resolutions.floor.floorLabel === normalizedText(zeroFloorSource?.nome),
  );

  const unmappableFloorIndex = emissions.findIndex(
    ({ reasonCode }) => reasonCode === "CBS_STOCK_FLOOR_LABEL_UNMAPPABLE",
  );
  assertBoolean(unmappableFloorIndex >= 0);
  const unmappableFloorSource = floorRows.find(
    (row) => row.id === contexts[unmappableFloorIndex].resolutions.floor.sourceKey,
  );
  assertBoolean(
    contexts[unmappableFloorIndex].resolutions.floor.floorLabel ===
      normalizedText(unmappableFloorSource?.nome),
  );
  assertBoolean(emissions[unmappableFloorIndex].status === "quarantine");
});

test("saídas com observação funcional nunca são emitidas parcialmente", async () => {
  const [rows, userRows, { rows: stockRows, contexts: stockRuleContexts }] = await Promise.all([
    loadRows("tb_cbs.estoque_saidas"),
    loadRows("tb_admin.usuarios"),
    stockContexts(),
  ]);
  const contexts = buildCbsStockExitContexts({
    rows,
    stockRows,
    stockContexts: stockRuleContexts,
    userRows,
  });
  const mappingRule = rule("tb_cbs.estoque_saidas");
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const withObservation = rows
    .map((row, index) => ({ row, emission: emissions[index] }))
    .filter(({ row }) => String(row.obs).trim().length > 0);

  assert.equal(withObservation.length, 1807);
  assert.equal(
    withObservation.every(({ emission }) => emission.status === "quarantine"),
    true,
  );
  assert.deepEqual(summary(emissions), { quarantine: 2939, prepared: 61 });
  assert.equal(
    mappingRule.destinations[0].columns.find(({ sourceColumn }) => sourceColumn === "obs")?.status,
    "not_preserved",
  );
});

test("configuração fiscal usa NFSE e quarentena faturamento/envio antes da consolidação", async () => {
  const rows = await loadRows("tb_triagem.campos");
  const contexts = buildTriageClientSlotContexts({
    rows,
    clientResolver: await auditedClientResolver(),
  });
  const mappingRule = rule("tb_triagem.campos");
  const reversedRows = [...rows].reverse();
  const reversedContexts = buildTriageClientSlotContexts({
    rows: reversedRows,
    clientResolver: await auditedClientResolver(),
  });
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const functionalIndexes = rows.flatMap((row, index) =>
    !["", "0"].includes(String(row.faturamento).trim()) || String(row.envio).trim().length > 0
      ? [index]
      : [],
  );

  assert.equal(functionalIndexes.length, 307);
  assert.equal(
    functionalIndexes.every(
      (index) => emissions[index].reasonCode === "TRIAGE_FUNCTIONAL_FIELD_UNMAPPABLE",
    ),
    true,
  );
  assert.deepEqual(summary(emissions), { prepared: 243, quarantine: 309, not_emitted: 1 });
  const deliveryOnlyIndex = rows.findIndex(
    (row, index) =>
      ["", "0"].includes(String(row.faturamento).trim()) &&
      String(row.envio).trim().length > 0 &&
      emissions[index].reasonCode === "TRIAGE_FUNCTIONAL_FIELD_UNMAPPABLE",
  );
  assert.notEqual(deliveryOnlyIndex, -1);
  assert.equal(emissions[deliveryOnlyIndex].field, "envio");
  const multiCauseIndexes = functionalIndexes.filter(
    (index) => contexts[index].resolutions.clientSlot.state === "conflict",
  );
  assert.equal(multiCauseIndexes.length, 5);
  for (const index of multiCauseIndexes) {
    const reverseIndex = reversedRows.findIndex(({ id }) => id === rows[index].id);
    assertBoolean(
      JSON.stringify(contexts[index].resolutions.clientSlot) ===
        JSON.stringify(reversedContexts[reverseIndex].resolutions.clientSlot),
    );
    const audit = ruleExports.projectRemainingRow({
      sourceTable: "tb_triagem.campos",
      row: rows[index],
      context: contexts[index],
    });
    assert.deepEqual(
      audit.blockers.map(({ reasonCode }) => reasonCode),
      ["TRIAGE_FUNCTIONAL_FIELD_UNMAPPABLE", "TRIAGE_CONFIG_CANONICAL_CLIENT_CONFLICT"],
    );
  }
  assert.equal(
    mappingRule.destinations[0].columns.find(({ sourceColumn }) => sourceColumn === "nfce_tomados")
      ?.transformation,
    "aggregate_enabled_fiscal_field_nfse_received",
  );
  const triageTypes = await readFile("services/src/src/types/TriageTypes.ts", "utf8");
  assertBoolean(/"nfse_received"/.test(triageTypes));
  const legacyReportMarker = /value="nfce_tomados">NFSE Tomados de Fora/;
  const legacyReport = await findLegacySourceContaining(LEGACY_ROOT, legacyReportMarker);
  assertBoolean(legacyReport !== null && legacyReportMarker.test(legacyReport));
});

test("rede social consolida N:1 de modo determinístico no Client canônico", async () => {
  const rows = await loadRows("tb_mkt.redes_sociais");
  const clientResolver = await auditedClientResolver();
  const contexts = buildMarketingSocialContexts({ rows, clientResolver });
  const reversedRows = [...rows].reverse();
  const reversedContexts = buildMarketingSocialContexts({ rows: reversedRows, clientResolver });
  const mappingRule = rule("tb_mkt.redes_sociais");
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);

  assert.equal(mappingRule.cardinality, "N:1");
  assert.deepEqual(summary(emissions), { prepared: 203, not_emitted: 1, quarantine: 1 });
  const duplicateIndex = emissions.findIndex(
    ({ reasonCode }) => reasonCode === "MKT_SOCIAL_CANONICAL_CLIENT_DUPLICATE",
  );
  assertBoolean(duplicateIndex >= 0);
  const ownerIndex = rows.findIndex(
    (_row, index) =>
      emissions[index].status === "prepared" &&
      contexts[index].resolutions.clientSlot.groupFingerprint ===
        contexts[duplicateIndex].resolutions.clientSlot.groupFingerprint,
  );
  assertBoolean(ownerIndex >= 0);
  for (const index of [ownerIndex, duplicateIndex]) {
    const reverseIndex = reversedRows.findIndex((row) => row.id === rows[index].id);
    assertBoolean(reverseIndex >= 0);
    assertBoolean(
      JSON.stringify(contexts[index].resolutions.clientSlot) ===
        JSON.stringify(reversedContexts[reverseIndex].resolutions.clientSlot),
    );
  }
  assertBoolean(emissions[ownerIndex].status === "prepared");
  assertBoolean(emissions[duplicateIndex].reasonCode === "MKT_SOCIAL_CANONICAL_CLIENT_DUPLICATE");
  assert.throws(
    () => buildMarketingSocialContexts({ rows: rows.slice(1), clientResolver }),
    /corpus completo auditado.*tb_mkt\.redes_sociais/i,
  );
});

test("mensagens Workspace usam tipo executável e cadeia parental opaca", async () => {
  const {
    categoryRows,
    categoryContexts,
    requestRows,
    requestContexts,
    messageRows: rows,
    messageContexts: contexts,
    departmentRows,
    userRows,
  } = await workspaceContexts();
  const mappingRule = rule("tb_workspace.solicitacoes_mensagens");
  const emissions = rows.map((row, index) => mappingRule.emitRows(row, contexts[index])[0]);
  const normalIndex = rows.findIndex(({ tipo }) => tipo === "0");
  const attachmentIndex = rows.findIndex(({ tipo }) => tipo === "6");

  assert.deepEqual(ruleExports.mapWorkspaceMessageType(rows[normalIndex].tipo), {
    status: "mapped",
    value: "Message",
    attachment: false,
  });
  assert.deepEqual(
    ruleExports.mapWorkspaceMessageType(rows[attachmentIndex].tipo, {
      correlated: false,
      mediaType: "application/pdf",
      storageSupported: false,
    }),
    {
      status: "quarantine",
      field: "mensagem",
      reasonCode: "WORKSPACE_ATTACHMENT_CORRELATION_UNRESOLVED",
    },
  );
  assert.deepEqual(
    ruleExports.mapWorkspaceMessageType("6", {
      correlated: true,
      mediaType: "image/png",
      storageSupported: true,
    }),
    { status: "mapped", value: "Message", attachment: true },
  );
  assert.deepEqual(ruleExports.mapWorkspaceMessageType("7"), {
    status: "quarantine",
    field: "tipo",
    reasonCode: "WORKSPACE_MESSAGE_TYPE_INVALID",
  });
  assert.deepEqual(ruleExports.mapWorkspaceMessageType(""), {
    status: "quarantine",
    field: "tipo",
    reasonCode: "WORKSPACE_MESSAGE_TYPE_INVALID",
  });
  assertBoolean(rows[attachmentIndex].mensagem === "");
  assert.equal(emissions[normalIndex].reasonCode, "WORKSPACE_MESSAGE_READ_STATE_UNMAPPABLE");
  assert.equal(
    emissions[attachmentIndex].reasonCode,
    "WORKSPACE_ATTACHMENT_CORRELATION_UNRESOLVED",
  );
  assert.deepEqual(summary(emissions), { quarantine: 2 });
  assert.equal(
    requestRows
      .flatMap((row, index) =>
        rule("tb_workspace.solicitacoes").emitRows(row, requestContexts[index])[0].status ===
        "prepared"
          ? [index]
          : [],
      )
      .every((index) => requestContexts[index].resolutions.category.migrationState === "prepared"),
    true,
  );
  assert.equal(
    contexts.every(({ resolutions }) => resolutions.request.migrationState === "prepared"),
    true,
  );
  assert.throws(
    () =>
      buildWorkspaceRequestContexts({
        rows: requestRows,
        userRows,
        departmentRows,
        categoryRows,
        categoryContexts: categoryContexts.map((context) => ({ ...context })),
      }),
    /preflight opaco/i,
  );
  assert.throws(
    () =>
      buildWorkspaceMessageContexts({
        rows,
        requestRows,
        requestContexts: [...requestContexts].reverse(),
        userRows,
      }),
    /preflight opaco/i,
  );
  assert.throws(
    () =>
      buildWorkspaceRequestContexts({
        rows: requestRows,
        userRows,
        departmentRows,
        categoryRows,
        categoryContexts: categoryContexts.slice(1),
      }),
    /preflight opaco completo/i,
  );
  assert.throws(
    () =>
      buildWorkspaceMessageContexts({
        rows,
        requestRows,
        requestContexts: requestContexts.slice(1),
        userRows,
      }),
    /preflight opaco completo/i,
  );
  await assert.doesNotReject(
    access(path.join(LEGACY_ROOT, "uploads/Workspace/solicitacoes/67ea8f65eca6d.pdf")),
  );
  const storage = await readFile(
    "services/ti-service/src/services/tiRequestImageStorage.ts",
    "utf8",
  );
  assert.match(storage, /image\/jpeg/);
  assert.match(storage, /image\/png/);
  assert.match(storage, /image\/webp/);
  assert.doesNotMatch(storage, /application\/pdf/);
});

test("senha Marketing exige builder opaco com criptografia e nunca vaza o segredo", async () => {
  const rows = await loadRows("tb_mkt.senhas");
  const mappingRule = rule("tb_mkt.senhas");
  const blocked = buildMarketingPasswordContexts({ rows, encryptionConfigured: false });
  const ready = buildMarketingPasswordContexts({ rows, encryptionConfigured: true });
  assert.deepEqual(
    summary(rows.map((row, index) => mappingRule.emitRows(row, blocked[index])[0])),
    { quarantine: 54 },
  );
  assert.deepEqual(summary(rows.map((row, index) => mappingRule.emitRows(row, ready[index])[0])), {
    prepared: 52,
    quarantine: 2,
  });
  const audits = rows.map((row, index) =>
    ruleExports.projectRemainingRow({
      sourceTable: "tb_mkt.senhas",
      row,
      context: ready[index],
    }),
  );
  const audit = audits[0];
  assert.deepEqual(audit.payload.credential, {
    sourcePresent: true,
    encryptionRequired: true,
    plaintextIncluded: false,
  });
  const secretObservationIndexes = rows.flatMap((row, index) => {
    const password = String(row.password).trim();
    const observation = String(row.obs).trim();
    return password.length > 0 && observation.includes(password) ? [index] : [];
  });
  assert.equal(secretObservationIndexes.length, 2);
  assert.equal(
    secretObservationIndexes.every(
      (index) =>
        audits[index].payload === null &&
        audits[index].decision.reasonCode === "MKT_PASSWORD_OBSERVATION_CONTAINS_SECRET",
    ),
    true,
  );
  assert.equal(
    audits
      .map((rowAudit) => JSON.stringify(rowAudit))
      .every((serializedAudit) =>
        rows.every((row) => !serializedAudit.includes(String(row.password))),
      ),
    true,
  );
});

test("projeções das quatorze regras preservam valores runtime sem versionar conteúdo real", async () => {
  const stockBundle = await stockContexts();
  const workspaceBundle = await workspaceContexts();
  const [users, entries, inventory, exits, emails, socialRows, passwordRows, pecRows, triageRows] =
    await Promise.all(
      [
        "tb_admin.usuarios",
        "tb_cbs.estoque_entradas",
        "tb_cbs.estoque_inventario",
        "tb_cbs.estoque_saidas",
        "tb_cbc.emails",
        "tb_mkt.redes_sociais",
        "tb_mkt.senhas",
        "tb_pec.notas",
        "tb_triagem.campos",
      ].map(loadRows),
    );
  const entryContexts = buildCbsStockEntryContexts({
    rows: entries,
    stockRows: stockBundle.rows,
    stockContexts: stockBundle.contexts,
    userRows: users,
  });
  const exitContexts = buildCbsStockExitContexts({
    rows: exits,
    stockRows: stockBundle.rows,
    stockContexts: stockBundle.contexts,
    userRows: users,
  });
  const clientResolver = await auditedClientResolver();
  const socialContexts = buildMarketingSocialContexts({ rows: socialRows, clientResolver });
  const passwordContexts = buildMarketingPasswordContexts({
    rows: passwordRows,
    encryptionConfigured: true,
  });
  const pecContexts = buildPecNoteContexts({ rows: pecRows, userRows: users, clientResolver });
  const triageContexts = buildTriageClientSlotContexts({ rows: triageRows, clientResolver });

  const email = projectPreparedSample(
    "tb_cbc.emails",
    emails,
    emails.map(() => ({})),
    (row) => normalizedText(row.email) !== null && normalizedText(row.responsavel) !== null,
  );
  assertPayloadKeys(email.payload, [
    "id",
    "email",
    "responsible",
    "new_client_sending",
    "task_stalled_sending",
    "organization_id",
  ]);
  assertBoolean(email.payload.id === generatedIdentity("tb_cbc.emails", email.row.id));
  assertBoolean(email.payload.email === normalizedText(email.row.email));
  assertBoolean(email.payload.responsible === normalizedText(email.row.responsavel));
  assertBoolean(
    email.payload.new_client_sending === (String(email.row.cliente_novo_integracao).trim() === "1"),
  );
  assertBoolean(
    email.payload.task_stalled_sending ===
      (String(email.row.tarefa_paralisada_integracao).trim() === "1"),
  );
  assertOrganization(email.payload, "tb_cbc.emails");

  const category = projectPreparedSample(
    "tb_cbs.estoque_categorias",
    stockBundle.categoryRows,
    stockBundle.categoryContexts,
  );
  assertPayloadKeys(category.payload, ["id", "name", "department_id", "status", "organization_id"]);
  assertBoolean(
    category.payload.id === generatedIdentity("tb_cbs.estoque_categorias", category.row.id),
  );
  assertBoolean(category.payload.name === normalizedText(category.row.nome));
  assertBoolean(
    category.payload.department_id === resolvedIdentity(category.context, "department"),
  );
  assertBoolean(category.payload.status === true);
  assertOrganization(category.payload, "tb_cbs.estoque_categorias");

  const stock = projectPreparedSample(
    "tb_cbs.estoque",
    stockBundle.rows,
    stockBundle.contexts,
    (_row, context) =>
      context.resolutions.item.itemDescription !== null &&
      context.resolutions.item.itemActive === false,
  );
  assertPayloadKeys(stock.payload, [
    "id",
    "department_id",
    "name",
    "description",
    "status",
    "category_id",
    "quantity",
    "location_id",
    "organization_id",
  ]);
  assertBoolean(stock.payload.id === generatedIdentity("tb_cbs.estoque", stock.row.id));
  assertBoolean(stock.payload.department_id === resolvedIdentity(stock.context, "department"));
  assertBoolean(stock.payload.name === stock.context.resolutions.item.itemName);
  assertBoolean(stock.payload.description === stock.context.resolutions.item.itemDescription);
  assertBoolean(stock.payload.status === stock.context.resolutions.item.itemActive);
  assertBoolean(stock.payload.category_id === resolvedIdentity(stock.context, "category"));
  assertBoolean(stock.payload.quantity === Number(stock.row.quantidade));
  assertBoolean(stock.payload.location_id === resolvedIdentity(stock.context, "location"));
  assertOrganization(stock.payload, "tb_cbs.estoque");

  const entry = projectPreparedSample(
    "tb_cbs.estoque_entradas",
    entries,
    entryContexts,
    (row) => Number(row.quantidade) > 0,
  );
  assertPayloadKeys(entry.payload, [
    "id",
    "stock_id",
    "quantity",
    "entry_date",
    "entry_by_user_id",
    "organization_id",
  ]);
  assertBoolean(entry.payload.id === generatedIdentity("tb_cbs.estoque_entradas", entry.row.id));
  assertBoolean(entry.payload.stock_id === resolvedIdentity(entry.context, "stock"));
  assertBoolean(entry.payload.quantity === Number(entry.row.quantidade));
  assertBoolean(entry.payload.entry_date === normalizedText(entry.row.data_entrada));
  assertBoolean(entry.payload.entry_by_user_id === resolvedIdentity(entry.context, "user"));
  assertOrganization(entry.payload, "tb_cbs.estoque_entradas");

  const inventoryAudits = inventory.map((row) => ({
    audit: ruleExports.projectRemainingRow({
      sourceTable: "tb_cbs.estoque_inventario",
      row,
      context: {},
    }),
    row,
  }));
  const activeInventoryStatuses = new Set(
    inventoryAudits
      .filter(({ audit }) => audit.decision.status === "prepared" && audit.payload?.active === true)
      .map(({ row }) => normalizedSensitiveText(row.status)),
  );
  const inactiveInventoryStatuses = new Set(
    inventoryAudits
      .filter(
        ({ audit }) => audit.decision.status === "prepared" && audit.payload?.active === false,
      )
      .map(({ row }) => normalizedSensitiveText(row.status)),
  );
  assertBoolean(activeInventoryStatuses.size === 1 && inactiveInventoryStatuses.size >= 1);

  const inventorySample = projectPreparedSample(
    "tb_cbs.estoque_inventario",
    inventory,
    inventory.map(() => ({})),
  );
  assertPayloadKeys(inventorySample.payload, ["id", "name", "tag", "active", "organization_id"]);
  assertBoolean(
    inventorySample.payload.id ===
      generatedIdentity("tb_cbs.estoque_inventario", inventorySample.row.id),
  );
  assertBoolean(inventorySample.payload.name === normalizedText(inventorySample.row.tipo_item));
  assertBoolean(inventorySample.payload.tag === normalizedText(inventorySample.row.tag));
  assertBoolean(
    inventorySample.payload.active ===
      activeInventoryStatuses.has(normalizedSensitiveText(inventorySample.row.status)),
  );
  assertOrganization(inventorySample.payload, "tb_cbs.estoque_inventario");

  const location = projectPreparedSample(
    "tb_cbs.estoque_localizacoes",
    stockBundle.locationRows,
    stockBundle.locationContexts,
  );
  assertPayloadKeys(location.payload, [
    "id",
    "name",
    "floor",
    "department_id",
    "status",
    "organization_id",
  ]);
  assertBoolean(
    location.payload.id === generatedIdentity("tb_cbs.estoque_localizacoes", location.row.id),
  );
  assertBoolean(location.payload.name === normalizedText(location.row.nome));
  assertBoolean(location.payload.floor === location.context.resolutions.floor.floor);
  assertBoolean(
    location.payload.department_id === resolvedIdentity(location.context, "department"),
  );
  assertBoolean(location.payload.status === true);
  assertOrganization(location.payload, "tb_cbs.estoque_localizacoes");

  const exitSample = projectPreparedSample(
    "tb_cbs.estoque_saidas",
    exits,
    exitContexts,
    (row, context) =>
      normalizedText(row.destino) !== null &&
      context.resolutions.approver !== null &&
      context.resolutions.operator !== null,
  );
  assertPayloadKeys(exitSample.payload, [
    "id",
    "stock_id",
    "quantity",
    "exit_date",
    "destination",
    "requester_id",
    "approver_id",
    "operator_id",
    "location_destination_id",
    "organization_id",
  ]);
  assertBoolean(
    exitSample.payload.id === generatedIdentity("tb_cbs.estoque_saidas", exitSample.row.id),
  );
  assertBoolean(exitSample.payload.stock_id === resolvedIdentity(exitSample.context, "stock"));
  assertBoolean(exitSample.payload.quantity === Number(exitSample.row.quantidade));
  assertBoolean(exitSample.payload.exit_date === normalizedText(exitSample.row.data_saida));
  assertBoolean(exitSample.payload.destination === normalizedText(exitSample.row.destino));
  assertBoolean(
    exitSample.payload.requester_id === resolvedIdentity(exitSample.context, "requester"),
  );
  assertBoolean(
    exitSample.payload.approver_id === resolvedIdentity(exitSample.context, "approver"),
  );
  assertBoolean(
    exitSample.payload.operator_id === resolvedIdentity(exitSample.context, "operator"),
  );
  assertBoolean(exitSample.payload.location_destination_id === null);
  assertOrganization(exitSample.payload, "tb_cbs.estoque_saidas");

  const social = projectPreparedSample(
    "tb_mkt.redes_sociais",
    socialRows,
    socialContexts,
    (row) => normalizedText(row.instagram) !== null,
  );
  assertPayloadKeys(social.payload, ["id", "instagram"]);
  assertBoolean(social.payload.id === resolvedIdentity(social.context, "client"));
  assertBoolean(social.payload.instagram === normalizedText(social.row.instagram));

  const password = projectPreparedSample("tb_mkt.senhas", passwordRows, passwordContexts);
  assertPayloadKeys(password.payload, [
    "id",
    "local",
    "userPresent",
    "notes",
    "organization_id",
    "credential",
  ]);
  assertPayloadKeys(password.payload.credential, [
    "sourcePresent",
    "encryptionRequired",
    "plaintextIncluded",
  ]);
  assertBoolean(password.payload.id === generatedIdentity("tb_mkt.senhas", password.row.id));
  assertBoolean(password.payload.local === normalizedText(password.row.local));
  assertBoolean(password.payload.userPresent === (normalizedText(password.row.user) !== null));
  assertBoolean(password.payload.notes === normalizedText(password.row.obs));
  assertBoolean(password.payload.credential.sourcePresent === true);
  assertBoolean(password.payload.credential.encryptionRequired === true);
  assertBoolean(password.payload.credential.plaintextIncluded === false);
  assertOrganization(password.payload, "tb_mkt.senhas");

  const pec = projectPreparedSample(
    "tb_pec.notas",
    pecRows,
    pecContexts,
    (row) => normalizedZeroDate(row.conclusao) !== null,
  );
  assertPayloadKeys(pec.payload, [
    "id",
    "user_id",
    "number",
    "note",
    "created_at",
    "due_date",
    "completion_date",
    "status",
    "week_start_date",
    "week_end_date",
    "original_creation_date",
    "has_penalty",
    "is_urgent",
    "is_internal",
    "client_id",
    "organization_id",
  ]);
  assertBoolean(pec.payload.id === generatedIdentity("tb_pec.notas", pec.row.id));
  assertBoolean(pec.payload.user_id === resolvedIdentity(pec.context, "user"));
  assertBoolean(pec.payload.number === Number(pec.row.numero));
  assertBoolean(pec.payload.note === normalizedText(pec.row.tarefa));
  assertBoolean(pec.payload.created_at === normalizedText(pec.row.cadastro));
  assertBoolean(pec.payload.due_date === normalizedZeroDate(pec.row.previsao));
  assertBoolean(pec.payload.completion_date === normalizedZeroDate(pec.row.conclusao));
  assertBoolean(pec.payload.status === (String(pec.row.status).trim() !== "0"));
  assertBoolean(pec.payload.week_start_date === normalizedText(pec.row.inicio_semana));
  assertBoolean(pec.payload.week_end_date === normalizedText(pec.row.fim_semana));
  assertBoolean(pec.payload.original_creation_date === normalizedText(pec.row.cadastro_original));
  assertBoolean(pec.payload.has_penalty === (String(pec.row.multa).trim() === "1"));
  assertBoolean(pec.payload.is_urgent === (String(pec.row.urgente).trim() === "1"));
  const pecClientKey = String(pec.row.cliente_id ?? "").trim();
  const pecIsInternal = pecClientKey.length === 0 || pecClientKey === "0";
  assertBoolean(pec.payload.is_internal === pecIsInternal);
  assertBoolean(
    pec.payload.client_id === (pecIsInternal ? null : resolvedIdentity(pec.context, "client")),
  );
  assertOrganization(pec.payload, "tb_pec.notas");

  const triageFields = [
    ["nfce", "nfce_documents"],
    ["sped", "sped_fiscal"],
    ["spedContribuicoes", "sped_contributions"],
    ["nfce_tomados", "nfse_received"],
    ["modelo_21", "model_21_invoice"],
    ["cte_emitente", "cte_as_issuer"],
    ["prestadas_mei", "services_provided_as_mei"],
  ];
  const expectedTriageItems = (row) =>
    triageFields.flatMap(([field, item]) =>
      String(row[field] ?? "").trim() === "1" ? [item] : [],
    );
  const triage = projectPreparedSample(
    "tb_triagem.campos",
    triageRows,
    triageContexts,
    (row) => expectedTriageItems(row).length > 0,
  );
  assertPayloadKeys(triage.payload, ["id", "client_id", "type", "active_items", "organization_id"]);
  assertBoolean(triage.payload.id === generatedIdentity("tb_triagem.campos", triage.row.id));
  assertBoolean(triage.payload.client_id === resolvedIdentity(triage.context, "client"));
  assertBoolean(triage.payload.type === rule("tb_triagem.campos").destinations[0].constants.type);
  assertBoolean(
    JSON.stringify(triage.payload.active_items) === JSON.stringify(expectedTriageItems(triage.row)),
  );
  assertOrganization(triage.payload, "tb_triagem.campos");

  const workspaceCategory = projectPreparedSample(
    "tb_workspace.solicitacoes_categorias",
    workspaceBundle.categoryRows,
    workspaceBundle.categoryContexts,
  );
  assertPayloadKeys(workspaceCategory.payload, ["id", "name", "active", "organization_id"]);
  assertBoolean(
    workspaceCategory.payload.id ===
      generatedIdentity("tb_workspace.solicitacoes_categorias", workspaceCategory.row.id),
  );
  assertBoolean(workspaceCategory.payload.name === normalizedText(workspaceCategory.row.nome));
  assertBoolean(
    workspaceCategory.payload.active === (String(workspaceCategory.row.status).trim() === "1"),
  );
  assertOrganization(workspaceCategory.payload, "tb_workspace.solicitacoes_categorias");

  const workspaceRequest = projectPreparedSample(
    "tb_workspace.solicitacoes",
    workspaceBundle.requestRows,
    workspaceBundle.requestContexts,
    (row) => normalizedText(row.descricao) !== null,
  );
  assertPayloadKeys(workspaceRequest.payload, [
    "id",
    "title",
    "description",
    "status",
    "requester_id",
    "assigned_to_id",
    "category_id",
    "urgency",
    "attachment",
    "created_at",
    "updated_at",
    "organization_id",
  ]);
  assertBoolean(
    workspaceRequest.payload.id ===
      generatedIdentity("tb_workspace.solicitacoes", workspaceRequest.row.id),
  );
  assertBoolean(workspaceRequest.payload.title === normalizedText(workspaceRequest.row.titulo));
  assertBoolean(
    workspaceRequest.payload.description === normalizedText(workspaceRequest.row.descricao),
  );
  const requestStatuses = new Map([
    ["0", "New"],
    ["1", "In_Progress"],
    ["2", "Resolved"],
    ["3", "Closed"],
  ]);
  const requestUrgencies = new Map([
    ["1", "Low"],
    ["2", "Medium"],
    ["3", "High"],
  ]);
  assertBoolean(
    workspaceRequest.payload.status ===
      requestStatuses.get(String(workspaceRequest.row.status).trim()),
  );
  assertBoolean(
    workspaceRequest.payload.requester_id ===
      resolvedIdentity(workspaceRequest.context, "requester"),
  );
  assertBoolean(
    workspaceRequest.payload.assigned_to_id ===
      (workspaceRequest.context.resolutions.assignee === null
        ? null
        : resolvedIdentity(workspaceRequest.context, "assignee")),
  );
  assertBoolean(
    workspaceRequest.payload.category_id === resolvedIdentity(workspaceRequest.context, "category"),
  );
  assertBoolean(
    workspaceRequest.payload.urgency ===
      requestUrgencies.get(String(workspaceRequest.row.urgencia).trim()),
  );
  assertBoolean(workspaceRequest.payload.attachment === null);
  assertBoolean(
    workspaceRequest.payload.created_at === normalizedText(workspaceRequest.row.data_cadastro),
  );
  assertBoolean(
    workspaceRequest.payload.updated_at === normalizedText(workspaceRequest.row.data_atualizacao),
  );
  assertOrganization(workspaceRequest.payload, "tb_workspace.solicitacoes");

  const messageIndex = workspaceBundle.messageRows.findIndex(
    (row) => normalizedText(row.mensagem) !== null,
  );
  assertBoolean(messageIndex >= 0);
  const messageRow = workspaceBundle.messageRows[messageIndex];
  const messageAudit = ruleExports.projectRemainingRow({
    sourceTable: "tb_workspace.solicitacoes_mensagens",
    row: messageRow,
    context: workspaceBundle.messageContexts[messageIndex],
  });
  assertBoolean(messageAudit.decision.status === "quarantine");
  assertBoolean(messageAudit.payload === null);
  assertBoolean(messageAudit.candidate !== null);
  assertPayloadKeys(messageAudit.candidate, ["type", "content", "attachment"]);
  assertPayloadKeys(messageAudit.candidate.content, ["present", "length"]);
  const mappedMessageType = ruleExports.mapWorkspaceMessageType(messageRow.tipo);
  const messageText = normalizedText(messageRow.mensagem);
  assertBoolean(
    messageAudit.candidate.type ===
      (mappedMessageType.status === "mapped" ? mappedMessageType.value : null),
  );
  assertBoolean(messageAudit.candidate.content.present === (messageText !== null));
  assertBoolean(messageAudit.candidate.content.length === (messageText?.length ?? 0));
  assertBoolean(
    messageAudit.candidate.attachment ===
      (mappedMessageType.status === "mapped" && mappedMessageType.attachment),
  );
  assertBoolean(!JSON.stringify(messageAudit.candidate).includes(messageText));
});

test("comportamento real cobre as quinze origens originalmente confirmadas após downgrade", async () => {
  const [departments, users, stocks, categories, entries, inventory, locations, floors, exits] =
    await Promise.all(
      [
        "tb_admin.departamentos",
        "tb_admin.usuarios",
        "tb_cbs.estoque",
        "tb_cbs.estoque_categorias",
        "tb_cbs.estoque_entradas",
        "tb_cbs.estoque_inventario",
        "tb_cbs.estoque_localizacoes",
        "tb_cbs.estoque_andares",
        "tb_cbs.estoque_saidas",
      ].map(loadRows),
    );
  const categoryContexts = buildCbsStockCategoryContexts({
    rows: categories,
    departmentRows: departments,
  });
  const { rows: stockRows, contexts: stockRuleContexts } = await stockContexts();
  const entryContexts = buildCbsStockEntryContexts({
    rows: entries,
    stockRows: stocks,
    stockContexts: stockRuleContexts,
    userRows: users,
  });
  const locationContexts = buildCbsStockLocationContexts({
    rows: locations,
    floorRows: floors,
    departmentRows: departments,
  });
  const exitContexts = buildCbsStockExitContexts({
    rows: exits,
    stockRows: stocks,
    stockContexts: stockRuleContexts,
    userRows: users,
  });
  const socialRows = await loadRows("tb_mkt.redes_sociais");
  const pecRows = await loadRows("tb_pec.notas");
  const triageRows = await loadRows("tb_triagem.campos");
  const workspaceCategories = await loadRows("tb_workspace.solicitacoes_categorias");
  const workspaceRequests = await loadRows("tb_workspace.solicitacoes");
  const workspaceMessages = await loadRows("tb_workspace.solicitacoes_mensagens");
  const clientResolver = await auditedClientResolver();
  const socialContexts = buildMarketingSocialContexts({ rows: socialRows, clientResolver });
  const pecContexts = buildPecNoteContexts({ rows: pecRows, userRows: users, clientResolver });
  const triageContexts = buildTriageClientSlotContexts({ rows: triageRows, clientResolver });
  const workspaceCategoryContexts = buildWorkspaceCategoryContexts({
    rows: workspaceCategories,
    departmentRows: departments,
  });
  const workspaceRequestContexts = buildWorkspaceRequestContexts({
    rows: workspaceRequests,
    userRows: users,
    departmentRows: departments,
    categoryRows: workspaceCategories,
    categoryContexts: workspaceCategoryContexts,
  });
  const workspaceMessageContexts = buildWorkspaceMessageContexts({
    rows: workspaceMessages,
    requestRows: workspaceRequests,
    requestContexts: workspaceRequestContexts,
    userRows: users,
  });
  const emailRows = await loadRows("tb_cbc.emails");
  const passwordRows = await loadRows("tb_mkt.senhas");
  const passwordContexts = buildMarketingPasswordContexts({
    rows: passwordRows,
    encryptionConfigured: true,
  });

  const cases = [
    ["tb_cbc.emails", emailRows, emailRows.map(() => ({})), { prepared: 22 }],
    ["tb_cbs.estoque", stockRows, stockRuleContexts, { prepared: 75, quarantine: 358 }],
    ["tb_cbs.estoque_categorias", categories, categoryContexts, { prepared: 28, quarantine: 37 }],
    ["tb_cbs.estoque_entradas", entries, entryContexts, { prepared: 736, quarantine: 1479 }],
    ["tb_cbs.estoque_inventario", inventory, inventory.map(() => ({})), { prepared: 26 }],
    ["tb_cbs.estoque_localizacoes", locations, locationContexts, { prepared: 2, quarantine: 25 }],
    ["tb_cbs.estoque_saidas", exits, exitContexts, { prepared: 61, quarantine: 2939 }],
    [
      "tb_mkt.redes_sociais",
      socialRows,
      socialContexts,
      { prepared: 203, not_emitted: 1, quarantine: 1 },
    ],
    ["tb_mkt.senhas", passwordRows, passwordContexts, { prepared: 52, quarantine: 2 }],
    ["tb_pec.notas", pecRows, pecContexts, { prepared: 41620, quarantine: 8 }],
    [
      "tb_triagem.campos",
      triageRows,
      triageContexts,
      { prepared: 243, quarantine: 309, not_emitted: 1 },
    ],
    [
      "tb_workspace.solicitacoes",
      workspaceRequests,
      workspaceRequestContexts,
      { prepared: 4, quarantine: 1 },
    ],
    [
      "tb_workspace.solicitacoes_categorias",
      workspaceCategories,
      workspaceCategoryContexts,
      { prepared: 1 },
    ],
    [
      "tb_workspace.solicitacoes_mensagens",
      workspaceMessages,
      workspaceMessageContexts,
      { quarantine: 2 },
    ],
  ];

  for (const [sourceTable, rows, contexts, expected] of cases) {
    const emissions = rows.map((row, index) => rule(sourceTable).emitRows(row, contexts[index])[0]);
    assert.deepEqual(summary(emissions), expected, sourceTable);
    assert.equal(
      emissions.every(
        ({ identityRef }) => typeof identityRef === "string" && identityRef.length > 0,
      ),
      true,
      sourceTable,
    );
  }
  assert.equal(
    REMAINING_RULES.find(({ sourceTable }) => sourceTable === "tb_cbs.ramais"),
    undefined,
    "ramais deve ser post-downgrade pending",
  );
});

test("cada regra declara os campos efetivamente emitidos pelo contrato atual", () => {
  const expectedFields = {
    "tb_cbc.emails": ["id", "email", "responsible", "new_client_sending", "task_stalled_sending"],
    "tb_mkt.eventos": [
      "id",
      "legacy_id",
      "name",
      "name_key",
      "logo",
      "status",
      "priority",
      "objective",
      "audience",
    ],
    "tb_mkt.eventos_edicoes": [
      "id",
      "legacy_id",
      "event_id",
      "name",
      "date",
      "place",
      "partnerships",
      "organizing_team",
      "logistics",
      "marketing_communication",
      "during_event",
      "after_event",
      "notes",
      "edition_id",
      "amount",
      "position",
    ],
    "tb_cbs.estoque": [
      "id",
      "department_id",
      "name",
      "description",
      "status",
      "category_id",
      "quantity",
      "location_id",
    ],
    "tb_cbs.estoque_categorias": ["id", "name", "department_id"],
    "tb_cbs.estoque_entradas": ["id", "stock_id", "quantity", "entry_date", "entry_by_user_id"],
    "tb_cbs.estoque_inventario": ["id", "name", "tag", "active"],
    "tb_cbs.estoque_localizacoes": ["id", "name", "floor", "department_id"],
    "tb_cbs.estoque_saidas": [
      "id",
      "stock_id",
      "quantity",
      "exit_date",
      "destination",
      "requester_id",
      "approver_id",
      "operator_id",
    ],
    "tb_mkt.redes_sociais": ["id", "instagram"],
    "tb_mkt.senhas": ["id", "local", "user", "password", "notes"],
    "tb_pec.notas": [
      "id",
      "user_id",
      "number",
      "note",
      "created_at",
      "due_date",
      "completion_date",
      "status",
      "week_start_date",
      "week_end_date",
      "original_creation_date",
      "has_penalty",
      "is_urgent",
      "client_id",
      "is_internal",
    ],
    "tb_triagem.campos": ["id", "client_id", "active_items"],
    "tb_workspace.solicitacoes": [
      "id",
      "title",
      "description",
      "status",
      "requester_id",
      "assigned_to_id",
      "category_id",
      "urgency",
      "created_at",
      "updated_at",
    ],
    "tb_workspace.solicitacoes_categorias": ["id", "name", "active"],
    "tb_workspace.solicitacoes_mensagens": [
      "id",
      "request_id",
      "type",
      "sender_id",
      "created_at",
      "message",
    ],
  };

  for (const mappingRule of REMAINING_RULES) {
    const actual = [
      ...new Set(
        mappingRule.destinations.flatMap(({ columns }) => columns)
          .filter(({ status }) => status === "mapped")
          .map(({ destinationColumn }) => destinationColumn),
      ),
    ];
    assert.deepEqual(actual, expectedFields[mappingRule.sourceTable], mappingRule.sourceTable);
  }
});
