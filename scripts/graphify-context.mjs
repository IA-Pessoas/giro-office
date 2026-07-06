#!/usr/bin/env node

import { existsSync } from "node:fs";
import {
  buildCommunitySummaries,
  buildFileStats,
  loadGraphifyBundle,
} from "./graphify-postprocess.mjs";
import { isDirectScriptExecution, resolveScopePath } from "./graphify-scopes.mjs";

const STOPWORDS = new Set([
  "a",
  "as",
  "ao",
  "aos",
  "and",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "for",
  "from",
  "in",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "of",
  "on",
  "para",
  "por",
  "the",
  "to",
  "um",
  "uma",
  "with",
]);

const MAX_COMMUNITIES = 5;
const MAX_FILES = 12;
const MAX_TESTS = 8;

const TOKEN_ALIASES = {
  cliente: ["client"],
  clientes: ["client", "clients"],
  permissao: ["permission", "permissions", "auth", "role"],
  permissoes: ["permission", "permissions", "auth", "role"],
  usuario: ["user", "users"],
  usuarios: ["user", "users"],
};

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function tokenizeTask(task) {
  const tokens = normalizeSearchText(task)
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
  const expanded = new Set(tokens);
  for (const token of tokens) {
    if (token.length > 3 && token.endsWith("s")) {
      expanded.add(token.slice(0, -1));
    }
    for (const alias of TOKEN_ALIASES[token] ?? []) {
      expanded.add(alias);
    }
  }
  return [...expanded];
}

function scoreText(text, tokens, weight) {
  const normalized = normalizeSearchText(text);
  let score = 0;
  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += weight;
    }
  }
  return score;
}

function scoreCommunity(community, tokens) {
  const labelScore = scoreText(community.label, tokens, 12);
  const fileScore = scoreText(
    community.topFiles.map((file) => file.sourceFile).join(" "),
    tokens,
    6,
  );
  const nodeScore = scoreText(community.searchText, tokens, 2);
  return labelScore + fileScore + nodeScore + Math.log10(community.nodeCount + 1);
}

function isTestFile(path) {
  return /(^|\/)(tests?|__tests__)(\/|$)|\.test\.|\.spec\./u.test(path);
}

function scoreFile(file, tokens, communityScores) {
  const pathScore = scoreText(file.path, tokens, 10);
  const labelScore = scoreText(file.labels.join(" "), tokens, 2);
  const communityScore = [...file.communities].reduce(
    (sum, communityId) => sum + (communityScores.get(communityId) ?? 0),
    0,
  );
  return pathScore + labelScore + communityScore + Math.log10(file.nodeCount + file.linkCount + 1);
}

function sortByScore(items) {
  return items.sort((a, b) => b.score - a.score || a.path?.localeCompare(b.path) || 0);
}

export function buildGraphifyContext(scopeName, task, { cwd = process.cwd() } = {}) {
  const bundle = loadGraphifyBundle(scopeName, { cwd });
  const tokens = tokenizeTask(task);
  const communities = buildCommunitySummaries(bundle);
  const fileStats = buildFileStats(bundle);
  const scoredCommunities = communities.map((community) => ({
    ...community,
    score: tokens.length > 0 ? scoreCommunity(community, tokens) : community.nodeCount,
  }));
  sortByScore(scoredCommunities);
  const selectedCommunities = scoredCommunities.slice(0, MAX_COMMUNITIES);
  const selectedCommunityIds = new Set(selectedCommunities.map((community) => community.id));
  const communityScores = new Map(
    scoredCommunities.map((community) => [
      community.id,
      selectedCommunityIds.has(community.id) ? community.score : community.score * 0.15,
    ]),
  );

  const scoredFiles = fileStats.map((file) => ({
    ...file,
    score: scoreFile(file, tokens, communityScores),
  }));
  sortByScore(scoredFiles);

  const candidateFiles = scoredFiles.filter((file) => !isTestFile(file.path)).slice(0, MAX_FILES);
  const testFiles = scoredFiles.filter((file) => isTestFile(file.path)).slice(0, MAX_TESTS);
  const commit = bundle.graph.built_at_commit ?? "desconhecido";

  return [
    `# Graphify Context - ${bundle.scope.label}`,
    "",
    `Task: ${task || "(sem descricao)"}`,
    `Grafo: \`${bundle.scope.graphPath}\``,
    `Commit do grafo: \`${commit}\``,
    "",
    "## Comunidades provaveis",
    ...selectedCommunities.map(
      (community, index) =>
        `${index + 1}. ${community.label} (score ${community.score.toFixed(1)}, ${community.nodeCount} nodes)`,
    ),
    "",
    "## Arquivos candidatos",
    ...candidateFiles.map((file) => `- ${file.path}`),
    "",
    "## Testes relacionados",
    ...(testFiles.length > 0
      ? testFiles.map((file) => `- ${file.path}`)
      : ["- Nenhum teste relacionado encontrado no grafo. Use `rg -n` antes de editar."]),
    "",
    "## Validacao sugerida",
    ...bundle.scope.validationCommands.map((command) => `- \`${command}\``),
    "",
    "## Proximo passo obrigatorio",
    "- Abra os arquivos candidatos reais antes de alterar codigo; o grafo e apenas guia de navegacao.",
    "",
  ].join("\n");
}

function main() {
  const scopeName = process.argv[2];
  const task = process.argv
    .slice(3)
    .filter((arg) => arg !== "--")
    .join(" ")
    .trim();

  try {
    const bundle = loadGraphifyBundle(scopeName);
    if (!existsSync(resolveScopePath(bundle.scope, "graphPath"))) {
      throw new Error("missing graph");
    }
    console.log(buildGraphifyContext(scopeName, task));
  } catch (err) {
    const scopeLabel = scopeName ? ` (${scopeName})` : "";
    console.error(
      `Graphify indisponivel ou sem grafo local${scopeLabel}; vou usar descoberta manual.`,
    );
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

if (isDirectScriptExecution(import.meta.url)) {
  main();
}
