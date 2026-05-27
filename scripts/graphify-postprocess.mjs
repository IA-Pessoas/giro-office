#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  displayGraphFilePath,
  getGraphifyScope,
  isDirectScriptExecution,
  resolveScopePath,
} from "./graphify-scopes.mjs";

const MAX_BRIEF_COMMUNITIES = 12;
const MAX_BRIEF_FILES = 16;
const MAX_FILE_MAP_GROUPS = 60;
const MAX_FILE_MAP_FILES_PER_GROUP = 8;

export function readJsonIfExists(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadGraphifyBundle(scopeName, { cwd = process.cwd() } = {}) {
  const scope = getGraphifyScope(scopeName);
  const graphPath = resolveScopePath(scope, "graphPath", cwd);
  if (!existsSync(graphPath)) {
    throw new Error(`Graphify sem grafo local em ${scope.graphPath}. Use ${scope.extractScript}.`);
  }

  const graph = readJsonIfExists(graphPath, {});
  return {
    scope,
    graph,
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    links: Array.isArray(graph.links) ? graph.links : [],
    labels: readJsonIfExists(resolveScopePath(scope, "labelsPath", cwd), {}),
    analysis: readJsonIfExists(resolveScopePath(scope, "analysisPath", cwd), {}),
  };
}

export function humanizeIdentifier(value) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function topEntries(map, limit) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

function graphNodeId(node) {
  return node?.id ?? node?.label;
}

function getNodeCommunity(node) {
  return String(node?.community ?? "sem-comunidade");
}

function fallbackCommunityLabel(scope, communityId, files, labels) {
  const fileHint = topEntries(files, 1)[0]?.[0] ?? "";
  const labelHint = labels[0] ?? "";
  const hint = humanizeIdentifier(fileHint.split("/").slice(0, 3).join(" ") || labelHint);
  return hint ? `${scope.label}: ${hint}` : `${scope.label}: comunidade ${communityId}`;
}

export function buildCommunitySummaries(bundle) {
  const nodeById = new Map();
  for (const node of bundle.nodes) {
    const id = graphNodeId(node);
    if (id) {
      nodeById.set(id, node);
    }
  }

  const communities = new Map();
  const ensureCommunity = (communityId) => {
    if (!communities.has(communityId)) {
      communities.set(communityId, {
        id: communityId,
        label: bundle.labels?.[communityId],
        nodeCount: 0,
        linkCount: 0,
        files: new Map(),
        nodeLabels: [],
      });
    }
    return communities.get(communityId);
  };

  for (const node of bundle.nodes) {
    const community = ensureCommunity(getNodeCommunity(node));
    community.nodeCount += 1;
    if (node.source_file) {
      community.files.set(node.source_file, (community.files.get(node.source_file) ?? 0) + 1);
    }
    if (node.label && community.nodeLabels.length < 25) {
      community.nodeLabels.push(node.label);
    }
  }

  for (const link of bundle.links) {
    const sourceNode = nodeById.get(link.source);
    const targetNode = nodeById.get(link.target);
    for (const node of [sourceNode, targetNode]) {
      if (node) {
        ensureCommunity(getNodeCommunity(node)).linkCount += 1;
      }
    }
    if (link.source_file) {
      const sourceCommunity = sourceNode
        ? ensureCommunity(getNodeCommunity(sourceNode))
        : undefined;
      sourceCommunity?.files.set(
        link.source_file,
        (sourceCommunity.files.get(link.source_file) ?? 0) + 1,
      );
    }
  }

  return [...communities.values()]
    .map((community) => ({
      ...community,
      label:
        community.label ??
        fallbackCommunityLabel(bundle.scope, community.id, community.files, community.nodeLabels),
      topFiles: topEntries(community.files, 8).map(([sourceFile, count]) => ({
        sourceFile,
        count,
        path: displayGraphFilePath(bundle.scope, sourceFile),
      })),
      searchText: [
        community.label,
        ...community.nodeLabels,
        ...topEntries(community.files, 12).map(([sourceFile]) => sourceFile),
      ]
        .filter(Boolean)
        .join(" "),
    }))
    .sort(
      (a, b) => b.nodeCount - a.nodeCount || b.linkCount - a.linkCount || a.id.localeCompare(b.id),
    );
}

export function buildFileStats(bundle) {
  const nodeById = new Map();
  const files = new Map();
  const ensureFile = (sourceFile) => {
    if (!files.has(sourceFile)) {
      files.set(sourceFile, {
        sourceFile,
        path: displayGraphFilePath(bundle.scope, sourceFile),
        nodeCount: 0,
        linkCount: 0,
        communities: new Set(),
        labels: [],
      });
    }
    return files.get(sourceFile);
  };

  for (const node of bundle.nodes) {
    const id = graphNodeId(node);
    if (id) {
      nodeById.set(id, node);
    }
    if (!node.source_file) {
      continue;
    }
    const file = ensureFile(node.source_file);
    file.nodeCount += 1;
    file.communities.add(getNodeCommunity(node));
    if (node.label && file.labels.length < 20) {
      file.labels.push(node.label);
    }
  }

  for (const link of bundle.links) {
    const linkedFiles = new Set();
    if (link.source_file) {
      linkedFiles.add(link.source_file);
    }
    for (const node of [nodeById.get(link.source), nodeById.get(link.target)]) {
      if (node?.source_file) {
        linkedFiles.add(node.source_file);
      }
    }
    for (const sourceFile of linkedFiles) {
      ensureFile(sourceFile).linkCount += 1;
    }
  }

  return [...files.values()].sort(
    (a, b) =>
      b.nodeCount + b.linkCount - (a.nodeCount + a.linkCount) || a.path.localeCompare(b.path),
  );
}

function classifyAppFile(sourceFile) {
  const parts = sourceFile.split("/");
  if (parts[0] === "src" && parts[1] === "modules") {
    return `modules/${parts[2] ?? "unknown"} ${parts[3] ?? "root"}`;
  }
  if (parts[0] === "src" && parts[1] === "pages") {
    return `pages/${parts[2] ?? "root"}`;
  }
  if (parts[0] === "src" && parts[1] === "shared") {
    return `shared/${parts[2] ?? "root"}`;
  }
  if (parts[0] === "src") {
    return `src/${parts[1] ?? "root"}`;
  }
  if (parts[0] === "scripts") {
    return "scripts";
  }
  if (parts[0] === "docs") {
    return "docs";
  }
  return "root";
}

function classifyServiceFile(sourceFile) {
  const parts = sourceFile.split("/");
  const service = parts[0] ?? "unknown-service";
  const rest = sourceFile;
  if (rest.includes("/src/routes/")) {
    return `${service} routes`;
  }
  if (rest.includes("/src/schemas/")) {
    return `${service} schemas`;
  }
  if (rest.includes("/src/openapi/")) {
    return `${service} openapi`;
  }
  if (rest.includes("/src/services/")) {
    return `${service} services`;
  }
  if (rest.includes("/src/config/")) {
    return `${service} config`;
  }
  if (rest.includes("/src/test/") || rest.includes("/tests/") || rest.includes(".test.")) {
    return `${service} tests`;
  }
  if (rest.endsWith("/src/app.ts")) {
    return `${service} app`;
  }
  if (rest.endsWith("/src/server.ts")) {
    return `${service} server`;
  }
  return `${service} other`;
}

export function buildFileGroups(scopeName, fileStats) {
  const groups = new Map();
  for (const file of fileStats) {
    const groupName =
      scopeName === "ui" ? classifyAppFile(file.sourceFile) : classifyServiceFile(file.sourceFile);
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(file);
  }
  return [...groups.entries()]
    .map(([name, files]) => ({ name, files }))
    .sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));
}

function renderCommands(scope) {
  return [
    `- Contexto por task: \`${scope.contextScript} -- "<task>"\``,
    `- Gerar do zero: \`${scope.extractScript}\``,
    `- Atualizar incremental: \`${scope.updateScript}\``,
    ...scope.validationCommands.map((command) => `- Validacao: \`${command}\``),
  ].join("\n");
}

export function renderAgentBrief(bundle, options = {}) {
  const communities = options.communities ?? buildCommunitySummaries(bundle);
  const fileStats = options.fileStats ?? buildFileStats(bundle);
  const communityCount = new Set(bundle.nodes.map((node) => getNodeCommunity(node))).size;
  const commit = bundle.graph.built_at_commit ?? "desconhecido";

  return [
    `# Agent Brief - ${bundle.scope.label}`,
    "",
    "## Status",
    `- Nodes: ${bundle.nodes.length}`,
    `- Links: ${bundle.links.length}`,
    `- Comunidades: ${communityCount}`,
    `- Commit do grafo: \`${commit}\``,
    "",
    "## Protocolo de baixo custo",
    `1. Rode \`${bundle.scope.contextScript} -- "<task>"\` antes de abrir muitos arquivos.`,
    "2. Abra primeiro apenas os arquivos candidatos retornados pelo contexto.",
    "3. Use `GRAPH_REPORT.md` somente quando precisar de navegacao ampla.",
    "4. Depois de editar, rode o update do escopo e as validacoes relevantes.",
    "",
    "## Comunidades principais",
    ...communities.slice(0, MAX_BRIEF_COMMUNITIES).map((community) => {
      const fileList = community.topFiles
        .slice(0, 3)
        .map((file) => file.path)
        .join(", ");
      const suffix = fileList ? `; arquivos: ${fileList}` : "";
      return `- ${community.label} (${community.nodeCount} nodes, ${community.linkCount} links${suffix})`;
    }),
    "",
    "## Arquivos mais conectados",
    ...fileStats
      .slice(0, MAX_BRIEF_FILES)
      .map((file) => `- ${file.path} (${file.nodeCount} nodes, ${file.linkCount} links)`),
    "",
    "## Comandos",
    renderCommands(bundle.scope),
    "",
  ].join("\n");
}

export function renderFileMap(scopeName, bundle, options = {}) {
  const fileStats = options.fileStats ?? buildFileStats(bundle);
  const groups = buildFileGroups(scopeName, fileStats);
  const lines = [
    `# File Map - ${bundle.scope.label}`,
    "",
    "Mapa compacto gerado a partir do grafo local. Use para escolher onde abrir codigo real.",
    "",
  ];

  for (const group of groups.slice(0, MAX_FILE_MAP_GROUPS)) {
    lines.push(`## ${group.name} (${group.files.length})`);
    for (const file of group.files.slice(0, MAX_FILE_MAP_FILES_PER_GROUP)) {
      lines.push(`- ${file.path} (${file.nodeCount} nodes, ${file.linkCount} links)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function writeGraphifyPostprocess(scopeName, { cwd = process.cwd() } = {}) {
  const bundle = loadGraphifyBundle(scopeName, { cwd });
  const communities = buildCommunitySummaries(bundle);
  const fileStats = buildFileStats(bundle);
  const brief = renderAgentBrief(bundle, { communities, fileStats });
  const fileMap = renderFileMap(scopeName, bundle, { fileStats });

  const briefPath = resolveScopePath(bundle.scope, "briefPath", cwd);
  const fileMapPath = resolveScopePath(bundle.scope, "fileMapPath", cwd);
  mkdirSync(dirname(briefPath), { recursive: true });
  writeFileSync(briefPath, brief);
  writeFileSync(fileMapPath, fileMap);

  return {
    briefPath,
    fileMapPath,
    communityCount: communities.length,
    fileCount: fileStats.length,
  };
}

function main() {
  const scopeName = process.argv[2];
  try {
    const result = writeGraphifyPostprocess(scopeName);
    console.log(`Graphify postprocess: ${resolve(result.briefPath)}`);
    console.log(`Graphify postprocess: ${resolve(result.fileMapPath)}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}

if (isDirectScriptExecution(import.meta.url)) {
  main();
}
