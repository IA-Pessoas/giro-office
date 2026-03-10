import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const paths = {
  sourceRoot: path.join(repoRoot, "services/src/src"),
  controllers: path.join(repoRoot, "services/src/src/controllers"),
  services: path.join(repoRoot, "services/src/src/services"),
  routes: path.join(repoRoot, "services/src/src/routes"),
  middlewares: path.join(repoRoot, "services/src/src/middlewares"),
  prisma: path.join(repoRoot, "services/src/src/prisma"),
  config: path.join(repoRoot, "services/src/src/config"),
  utils: path.join(repoRoot, "services/src/src/utils"),
  schema: path.join(repoRoot, "infra/prisma/schema.prisma"),
  docs: path.join(repoRoot, "docs"),
  graphJson: path.join(repoRoot, "docs/architecture.system.graph.json"),
  mermaid: path.join(repoRoot, "docs/architecture.system.mmd"),
  overview: path.join(repoRoot, "docs/architecture.overview.md"),
};

const EXCLUDED_PATHS = [
  "services/src/dist",
  "services/src/node_modules",
  "node_modules",
  "app",
  "services/gateway",
  "shared",
  "services/src/src/generated",
];

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const ROUTER_FACTORIES = new Set(["Router"]);
const BUILTIN_MODULES = new Set([
  "crypto",
  "fs",
  "http",
  "path",
  "url",
  "node:crypto",
  "node:fs",
  "node:path",
  "node:url",
  "node:http",
]);

async function main() {
  const [controllerFiles, serviceFiles, routeFiles, schemaText] = await Promise.all([
    listTypeScriptFiles(paths.controllers),
    listTypeScriptFiles(paths.services),
    listTypeScriptFiles(paths.routes),
    fs.readFile(paths.schema, "utf8"),
  ]);

  const sourceFileCache = new Map();
  const getSourceFile = async (absPath) => {
    if (!sourceFileCache.has(absPath)) {
      const text = await fs.readFile(absPath, "utf8");
      sourceFileCache.set(
        absPath,
        ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
      );
    }
    return sourceFileCache.get(absPath);
  };

  const controllerIndex = await collectClassIndex(controllerFiles, getSourceFile, paths.controllers);
  const serviceIndex = await collectClassIndex(serviceFiles, getSourceFile, paths.services);
  const prismaModels = parsePrismaSchema(schemaText);

  const controllerEntities = await analyzeEntities({
    classIndex: controllerIndex,
    kind: "controller",
    serviceIndex,
    controllerIndex,
    prismaModels,
  });

  const serviceEntities = await analyzeEntities({
    classIndex: serviceIndex,
    kind: "service",
    serviceIndex,
    controllerIndex,
    prismaModels,
  });

  const routeEntries = await analyzeRoutes({
    routeFiles,
    getSourceFile,
    controllerIndex,
    serviceIndex,
  });

  attachRoutesToControllers(controllerEntities, routeEntries);

  const graph = buildGraph({
    controllerEntities,
    serviceEntities,
    prismaModels,
    routeEntries,
  });

  const mermaid = buildMermaid(graph);
  const overview = buildOverview(graph);

  await fs.mkdir(paths.docs, { recursive: true });
  await Promise.all([
    fs.writeFile(paths.graphJson, `${JSON.stringify(graph, null, 2)}\n`, "utf8"),
    fs.writeFile(paths.mermaid, mermaid, "utf8"),
    fs.writeFile(paths.overview, overview, "utf8"),
  ]);

  console.log(`Generated ${toRepoPath(paths.graphJson)}`);
  console.log(`Generated ${toRepoPath(paths.mermaid)}`);
  console.log(`Generated ${toRepoPath(paths.overview)}`);
}

async function listTypeScriptFiles(rootDir) {
  const results = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const repoPath = toRepoPath(fullPath);
      if (entry.isDirectory()) {
        if (
          repoPath.includes("/dist/") ||
          repoPath.includes("/node_modules/") ||
          repoPath.includes("/generated/")
        ) {
          continue;
        }
        await walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) {
        continue;
      }
      results.push(fullPath);
    }
  }

  await walk(rootDir);
  results.sort((left, right) => toRepoPath(left).localeCompare(toRepoPath(right)));
  return results;
}

async function collectClassIndex(filePaths, getSourceFile, rootDir) {
  const records = [];
  for (const filePath of filePaths) {
    const sourceFile = await getSourceFile(filePath);
    for (const statement of sourceFile.statements) {
      if (ts.isClassDeclaration(statement) && statement.name) {
        records.push({
          rawName: statement.name.text,
          file: filePath,
          sourceFile,
          node: statement,
        });
      }
    }
  }

  const counts = new Map();
  for (const record of records) {
    counts.set(record.rawName, (counts.get(record.rawName) ?? 0) + 1);
  }

  const byFile = new Map();
  const byName = new Map();
  const uniqueByRawName = new Map();

  for (const record of records) {
    const duplicateCount = counts.get(record.rawName) ?? 0;
    const qualifier = buildQualifier(rootDir, record.file);
    const name =
      duplicateCount > 1 && qualifier.length > 0 ? `${qualifier}.${record.rawName}` : record.rawName;
    const enriched = {
      ...record,
      name,
      duplicateCount,
    };
    byFile.set(record.file, enriched);
    byName.set(name, enriched);
    if (duplicateCount === 1) {
      uniqueByRawName.set(record.rawName, name);
    }
  }

  return {
    records: [...byName.values()].sort((left, right) => left.name.localeCompare(right.name)),
    byFile,
    byName,
    uniqueByRawName,
    canonicalNames: new Set([...byName.keys()]),
  };
}

function parsePrismaSchema(schemaText) {
  const models = [];
  const propertyToModel = new Map();
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match;

  while ((match = modelRegex.exec(schemaText)) !== null) {
    const modelName = match[1];
    const propertyName = lowerFirst(modelName);
    models.push({
      name: modelName,
      propertyName,
      schemaFile: toRepoPath(paths.schema),
      usedByServices: [],
    });
    propertyToModel.set(propertyName, modelName);
  }

  models.sort((left, right) => left.name.localeCompare(right.name));

  return {
    models,
    propertyToModel,
    modelNames: new Set(models.map((model) => model.name)),
  };
}

async function analyzeEntities({ classIndex, kind, serviceIndex, controllerIndex, prismaModels }) {
  const entities = [];

  for (const record of classIndex.records) {
    const sourceFile = record.sourceFile;
    const importContext = buildImportContext(sourceFile, record.file, {
      serviceIndex,
      controllerIndex,
    });
    const serviceAliases = collectServiceAliases(record.node, importContext, serviceIndex);
    const prismaAliases = collectPrismaAliases(record.node, importContext);

    const methodDetails = [];
    const aggregateServices = new Map();
    const aggregateModels = new Map();
    const aggregateUtils = new Set();
    const aggregateConfig = new Set();
    const aggregateExternal = new Set(importContext.externalModules);
    let hasCron = false;

    for (const member of record.node.members) {
      const methodName = getClassMemberName(member);
      const functionBody = getExecutableBody(member);
      if (!methodName || !functionBody) {
        continue;
      }

      const methodAnalysis = analyzeExecutable({
        sourceFile,
        rootNode: functionBody,
        importContext,
        serviceIndex,
        serviceAliases,
        prismaAliases,
        prismaModels,
      });

      for (const [serviceName, evidenceMap] of methodAnalysis.servicesUsed.entries()) {
        mergeUsageMap(aggregateServices, serviceName, evidenceMap);
      }
      for (const [modelName, evidenceMap] of methodAnalysis.modelsUsed.entries()) {
        mergeUsageMap(aggregateModels, modelName, evidenceMap);
      }
      for (const utilPath of methodAnalysis.utilsUsed) {
        aggregateUtils.add(utilPath);
      }
      for (const configPath of methodAnalysis.configUsed) {
        aggregateConfig.add(configPath);
      }
      if (methodAnalysis.hasCron) {
        hasCron = true;
      }

      methodDetails.push({
        name: methodName,
        servicesUsed: sortStrings([...methodAnalysis.servicesUsed.keys()]),
        serviceDetails: mapToSortedArray(methodAnalysis.servicesUsed),
        modelsUsed: sortStrings([...methodAnalysis.modelsUsed.keys()]),
        modelDetails: mapToSortedArray(methodAnalysis.modelsUsed),
        usesUtils: sortStrings([...methodAnalysis.utilsUsed]),
        usesConfig: sortStrings([...methodAnalysis.configUsed]),
        line: lineNumber(sourceFile, member),
      });
    }

    entities.push({
      kind,
      name: record.name,
      className: record.rawName,
      file: toRepoPath(record.file),
      methods: sortStrings(methodDetails.map((method) => method.name)),
      methodDetails: methodDetails.sort((left, right) => left.name.localeCompare(right.name)),
      usesServices: sortStrings([...aggregateServices.keys()]),
      usesServiceDetails: mapToSortedArray(aggregateServices),
      directModelUsage: sortStrings([...aggregateModels.keys()]),
      directModelUsageDetails: mapToSortedArray(aggregateModels),
      usesUtils: sortStrings([...aggregateUtils]),
      usesConfig: sortStrings([...aggregateConfig]),
      externalDependencies: sortStrings([...aggregateExternal]),
      hasCron,
      routes: [],
    });
  }

  entities.sort((left, right) => left.name.localeCompare(right.name));
  return entities;
}

function buildImportContext(sourceFile, filePath, { serviceIndex, controllerIndex }) {
  const identifiers = new Map();
  const externalModules = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }

    const moduleSpecifier = statement.moduleSpecifier.text;
    const resolvedPath = resolveImport(filePath, moduleSpecifier);
    const category = categorizeImport(moduleSpecifier, resolvedPath);

    if (category === "external") {
      externalModules.add(moduleSpecifier);
    }

    const entityName =
      (category === "service" && resolvedPath ? serviceIndex.byFile.get(resolvedPath)?.name : null) ??
      (category === "controller" && resolvedPath
        ? controllerIndex.byFile.get(resolvedPath)?.name
        : null) ??
      null;

    const importClause = statement.importClause;
    if (!importClause) {
      continue;
    }

    if (importClause.name) {
      identifiers.set(importClause.name.text, {
        category,
        moduleSpecifier,
        resolvedPath,
        entityName,
        importedName: "default",
      });
    }

    if (!importClause.namedBindings) {
      continue;
    }

    if (ts.isNamespaceImport(importClause.namedBindings)) {
      identifiers.set(importClause.namedBindings.name.text, {
        category,
        moduleSpecifier,
        resolvedPath,
        entityName,
        importedName: "*",
      });
      continue;
    }

    for (const element of importClause.namedBindings.elements) {
      identifiers.set(element.name.text, {
        category,
        moduleSpecifier,
        resolvedPath,
        entityName,
        importedName: element.propertyName?.text ?? element.name.text,
      });
    }
  }

  return { identifiers, externalModules };
}

function analyzeExecutable({
  sourceFile,
  rootNode,
  importContext,
  serviceIndex,
  serviceAliases,
  prismaAliases,
  prismaModels,
}) {
  const result = {
    servicesUsed: new Map(),
    modelsUsed: new Map(),
    utilsUsed: new Set(),
    configUsed: new Set(),
    hasCron: false,
  };

  const env = {
    serviceVars: new Map(serviceAliases),
    transactionVars: new Set(),
    prismaVars: new Set(prismaAliases),
  };

  visitNode(rootNode, env, result, {
    sourceFile,
    importContext,
    serviceIndex,
    serviceAliases,
    prismaAliases,
    prismaModels,
  });

  return result;
}

function visitNode(node, env, result, context) {
  if (!node) {
    return;
  }

  if (isNestedFunctionLike(node)) {
    const childEnv = {
      serviceVars: new Map(env.serviceVars),
      transactionVars: new Set(env.transactionVars),
      prismaVars: new Set(env.prismaVars),
    };

    if (isTransactionCallback(node, context.importContext, context.prismaModels)) {
      for (const param of node.parameters) {
        if (ts.isIdentifier(param.name)) {
          childEnv.transactionVars.add(param.name.text);
        }
      }
    }

    if (node.body) {
      visitNode(node.body, childEnv, result, context);
    }
    return;
  }

  if (ts.isIdentifier(node)) {
    const importInfo = context.importContext.identifiers.get(node.text);
    if (importInfo?.category === "utils" && importInfo.resolvedPath) {
      result.utilsUsed.add(toRepoPath(importInfo.resolvedPath));
    }
    if (importInfo?.category === "config" && importInfo.resolvedPath) {
      result.configUsed.add(toRepoPath(importInfo.resolvedPath));
    }
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const serviceName = resolveServiceReference(
      node.initializer,
      env,
      context.serviceIndex,
      context.importContext,
    );
    if (serviceName) {
      env.serviceVars.set(node.name.text, serviceName);
    }

    if (isPrismaAliasExpression(node.initializer, env, context.importContext, context.prismaAliases)) {
      env.prismaVars.add(node.name.text);
    }
  }

  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isIdentifier(node.left)
  ) {
    const serviceName = resolveServiceReference(
      node.right,
      env,
      context.serviceIndex,
      context.importContext,
    );
    if (serviceName) {
      env.serviceVars.set(node.left.text, serviceName);
    }

    if (isPrismaAliasExpression(node.right, env, context.importContext, context.prismaAliases)) {
      env.prismaVars.add(node.left.text);
    }
  }

  if (ts.isCallExpression(node)) {
    const serviceCall = extractServiceCall(
      node.expression,
      env,
      context.serviceIndex,
      context.importContext,
    );
    if (serviceCall && serviceCall.callMethod !== "bind") {
      const evidenceKey = `${serviceCall.serviceName}:${serviceCall.callMethod}`;
      const evidence = {
        file: toRepoPath(context.sourceFile.fileName),
        line: lineNumber(context.sourceFile, node),
        call: printNode(node.expression, context.sourceFile),
        method: serviceCall.callMethod,
      };
      addUsage(result.servicesUsed, serviceCall.serviceName, evidenceKey, evidence);
    }

    const prismaCall = extractPrismaModelCall(
      node.expression,
      env,
      context.importContext,
      context.prismaModels,
    );
    if (prismaCall) {
      const evidenceKey = `${prismaCall.modelName}:${prismaCall.operation}:${prismaCall.access}`;
      const evidence = {
        file: toRepoPath(context.sourceFile.fileName),
        line: lineNumber(context.sourceFile, node),
        access: prismaCall.access,
        operation: prismaCall.operation,
      };
      addUsage(result.modelsUsed, prismaCall.modelName, evidenceKey, evidence);
    }

    if (isCronSchedule(node, context.importContext)) {
      result.hasCron = true;
    }
  }

  ts.forEachChild(node, (child) => visitNode(child, env, result, context));
}

function extractServiceCall(expression, env, serviceIndex, importContext) {
  const targetExpression = unwrapExpression(expression);
  if (!ts.isPropertyAccessExpression(targetExpression)) {
    return null;
  }

  const callMethod = targetExpression.name.text;
  const owner = unwrapExpression(targetExpression.expression);

  if (ts.isIdentifier(owner) && env.serviceVars.has(owner.text)) {
    return {
      serviceName: env.serviceVars.get(owner.text),
      callMethod,
    };
  }

  const ownerChain = flattenPropertyAccess(owner);
  if (ownerChain.length === 2 && ownerChain[0] === "this" && env.serviceVars.has(`this.${ownerChain[1]}`)) {
    return {
      serviceName: env.serviceVars.get(`this.${ownerChain[1]}`),
      callMethod,
    };
  }

  if (ts.isNewExpression(owner) && ts.isIdentifier(owner.expression)) {
    const serviceName = getServiceInstanceName(owner, serviceIndex, importContext);
    if (serviceName) {
      return {
        serviceName,
        callMethod,
      };
    }
  }

  return null;
}

function extractPrismaModelCall(expression, env, importContext, prismaModels) {
  const targetExpression = unwrapExpression(expression);
  const chain = flattenPropertyAccess(targetExpression);
  if (chain.length < 3) {
    return null;
  }

  let rootIdentifier = chain[0];
  let modelProperty = chain[1];
  const operation = chain[chain.length - 1];
  let isPrismaRoot =
    importContext.identifiers.get(rootIdentifier)?.category === "prisma" ||
    env.transactionVars.has(rootIdentifier) ||
    env.prismaVars.has(rootIdentifier);

  if (!isPrismaRoot && chain.length >= 4 && chain[0] === "this" && env.prismaVars.has(`this.${chain[1]}`)) {
    rootIdentifier = `this.${chain[1]}`;
    modelProperty = chain[2];
    isPrismaRoot = true;
  }

  if (!isPrismaRoot || modelProperty === "$transaction") {
    return null;
  }

  const modelName = prismaModels.propertyToModel.get(modelProperty);
  if (!modelName) {
    return null;
  }

  return {
    modelName,
    operation,
    access: chain.join("."),
  };
}

function isCronSchedule(callExpression, importContext) {
  const expression = unwrapExpression(callExpression.expression);
  if (!ts.isPropertyAccessExpression(expression)) {
    return false;
  }

  if (expression.name.text !== "schedule") {
    return false;
  }

  const owner = unwrapExpression(expression.expression);
  if (!ts.isIdentifier(owner)) {
    return false;
  }

  const importInfo = importContext.identifiers.get(owner.text);
  return importInfo?.moduleSpecifier === "node-cron";
}

async function analyzeRoutes({ routeFiles, getSourceFile, controllerIndex, serviceIndex }) {
  const routeEntries = [];

  for (const filePath of routeFiles) {
    const sourceFile = await getSourceFile(filePath);
    const importContext = buildImportContext(sourceFile, filePath, {
      serviceIndex,
      controllerIndex,
    });
    const routerVariables = collectRouterVariables(sourceFile);
    const controllerInstances = collectControllerInstances(sourceFile, importContext, controllerIndex);

    function visit(node) {
      if (ts.isCallExpression(node)) {
        const routeEntry = buildRouteEntry({
          callExpression: node,
          sourceFile,
          filePath,
          routerVariables,
          controllerInstances,
          importContext,
          controllerIndex,
        });
        if (routeEntry) {
          routeEntries.push(...routeEntry);
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  routeEntries.sort((left, right) => {
    return (
      left.controller.localeCompare(right.controller) ||
      left.path.localeCompare(right.path) ||
      left.method.localeCompare(right.method) ||
      left.handler.localeCompare(right.handler)
    );
  });

  return routeEntries;
}

function collectRouterVariables(sourceFile) {
  const routerVariables = new Set();

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const expression = unwrapExpression(node.initializer.expression);
      if (ts.isIdentifier(expression) && ROUTER_FACTORIES.has(expression.text)) {
        routerVariables.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return routerVariables;
}

function collectControllerInstances(sourceFile, importContext, controllerIndex) {
  const controllerInstances = new Map();

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isNewExpression(unwrapExpression(node.initializer)) &&
      ts.isIdentifier(unwrapExpression(node.initializer).expression)
    ) {
      const controllerName = getControllerInstanceName(
        unwrapExpression(node.initializer),
        importContext,
        controllerIndex,
      );
      if (controllerName) {
        controllerInstances.set(node.name.text, controllerName);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return controllerInstances;
}

function buildRouteEntry({
  callExpression,
  sourceFile,
  filePath,
  routerVariables,
  controllerInstances,
  importContext,
  controllerIndex,
}) {
  const expression = unwrapExpression(callExpression.expression);
  if (!ts.isPropertyAccessExpression(expression)) {
    return null;
  }

  const routerTarget = unwrapExpression(expression.expression);
  if (!ts.isIdentifier(routerTarget) || !routerVariables.has(routerTarget.text)) {
    return null;
  }

  const method = expression.name.text.toLowerCase();
  if (!HTTP_METHODS.has(method)) {
    return null;
  }

  const [pathArgument, ...handlerArguments] = callExpression.arguments;
  const routePath = getRoutePath(pathArgument);
  if (!routePath) {
    return null;
  }

  const handlers = handlerArguments
    .map((argument) => {
      const handler = resolveControllerHandler(
        argument,
        controllerInstances,
        importContext,
        controllerIndex,
      );
      if (!handler) {
        return null;
      }
      return handler;
    })
    .filter(Boolean);

  if (handlers.length === 0) {
    return null;
  }

  return handlers.map((handler) => ({
    method: method.toUpperCase(),
    path: routePath,
    controller: handler.controller,
    handler: handler.method,
    file: toRepoPath(filePath),
    line: lineNumber(sourceFile, callExpression),
  }));
}

function attachRoutesToControllers(controllerEntities, routeEntries) {
  const controllerMap = new Map(controllerEntities.map((entity) => [entity.name, entity]));

  for (const routeGroup of routeEntries) {
    const entries = Array.isArray(routeGroup) ? routeGroup : [routeGroup];
    for (const route of entries) {
      const controller = controllerMap.get(route.controller);
      if (!controller) {
        continue;
      }
      controller.routes.push({
        method: route.method,
        path: route.path,
        handler: route.handler,
        file: route.file,
        line: route.line,
      });
    }
  }

  for (const controller of controllerEntities) {
    controller.routes.sort((left, right) => {
      return (
        left.path.localeCompare(right.path) ||
        left.method.localeCompare(right.method) ||
        left.handler.localeCompare(right.handler)
      );
    });
  }
}

function buildGraph({ controllerEntities, serviceEntities, prismaModels, routeEntries }) {
  const controllers = controllerEntities.map((controller) => ({
    name: controller.name,
    className: controller.className,
    file: controller.file,
    methods: controller.methods,
    methodDetails: controller.methodDetails,
    routes: controller.routes,
    usesServices: controller.usesServices,
    directModelUsage: controller.directModelUsage,
    directModelUsageDetails: controller.directModelUsageDetails,
    usesUtils: controller.usesUtils,
    usesConfig: controller.usesConfig,
    externalDependencies: controller.externalDependencies,
  }));

  const services = serviceEntities.map((service) => ({
    name: service.name,
    className: service.className,
    file: service.file,
    methods: service.methods,
    methodDetails: service.methodDetails,
    dependsOnServices: service.usesServices,
    dependsOnServiceDetails: service.usesServiceDetails,
    usesModels: service.directModelUsage,
    usesModelDetails: service.directModelUsageDetails,
    usesUtils: service.usesUtils,
    usesConfig: service.usesConfig,
    externalDependencies: service.externalDependencies,
    hasCron: service.hasCron,
  }));

  const serviceMap = new Map(serviceEntities.map((service) => [service.name, service]));
  const controllerMap = new Map(controllerEntities.map((controller) => [controller.name, controller]));

  const modelUsageByService = new Map(prismaModels.models.map((model) => [model.name, new Set()]));
  for (const service of serviceEntities) {
    for (const modelName of service.directModelUsage) {
      modelUsageByService.get(modelName)?.add(service.name);
    }
  }

  const models = prismaModels.models.map((model) => ({
    name: model.name,
    schemaFile: model.schemaFile,
    usedByServices: sortStrings([...(modelUsageByService.get(model.name) ?? [])]),
  }));

  const edgeAccumulator = new Map();

  for (const controller of controllerEntities) {
    for (const methodDetail of controller.methodDetails) {
      for (const detail of methodDetail.serviceDetails ?? []) {
        const matchingRoutes = controller.routes.filter((route) => route.handler === methodDetail.name);
        addEdge(edgeAccumulator, {
          type: "controller_to_service",
          from: controller.name,
          to: detail.name,
          evidence: [
            ...detail.evidence.map((item) => ({
              ...item,
              kind: "method_call",
              controllerMethod: methodDetail.name,
            })),
            ...matchingRoutes.map((route) => ({
              kind: "route_handler",
              file: route.file,
              line: route.line,
              route: `${route.method} ${route.path}`,
              handler: `${controller.name}.${route.handler}`,
            })),
          ],
        });
      }
    }
  }

  for (const service of serviceEntities) {
    for (const detail of service.usesServiceDetails) {
      addEdge(edgeAccumulator, {
        type: "service_to_service",
        from: service.name,
        to: detail.name,
        evidence: detail.evidence.map((item) => ({
          ...item,
          kind: "method_call",
        })),
      });
    }
    for (const detail of service.directModelUsageDetails) {
      addEdge(edgeAccumulator, {
        type: "service_to_model",
        from: service.name,
        to: detail.name,
        evidence: detail.evidence.map((item) => ({
          ...item,
          kind: "prisma_call",
        })),
      });
    }
  }

  const edges = [...edgeAccumulator.values()]
    .map((edge) => ({
      type: edge.type,
      from: edge.from,
      to: edge.to,
      evidence: sortEvidence(edge.evidence),
    }))
    .sort((left, right) => {
      return (
        left.type.localeCompare(right.type) ||
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to)
      );
    });

  validateGraph({ controllers, services, models, edges });

  const serviceClusters = buildServiceClusters(services, edges);
  const routeCount = controllerEntities.reduce((total, controller) => total + controller.routes.length, 0);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceRoots: [
        toRepoPath(paths.controllers),
        toRepoPath(paths.services),
        toRepoPath(paths.routes),
        toRepoPath(paths.middlewares),
        toRepoPath(paths.prisma),
        toRepoPath(paths.config),
        toRepoPath(paths.utils),
        toRepoPath(paths.schema),
      ],
      excludedPaths: EXCLUDED_PATHS,
      counts: {
        controllers: controllers.length,
        services: services.length,
        models: models.length,
        edges: edges.length,
        routes: routeCount,
      },
      routeFiles: countUnique(routeEntries.map((route) => route.file)),
      controllerFiles: controllers.length,
      serviceFiles: services.length,
    },
    controllers,
    services,
    models,
    edges,
    analysis: {
      serviceClusters,
      topServiceDependencies: buildTopServiceDependencies(services, edges),
      topModelUsage: buildTopModelUsage(models),
    },
  };
}

function buildServiceClusters(services, edges) {
  const serviceNames = new Set(services.map((service) => service.name));
  const adjacency = new Map(services.map((service) => [service.name, new Set()]));

  for (const edge of edges) {
    if (edge.type !== "service_to_service") {
      continue;
    }
    if (!serviceNames.has(edge.from) || !serviceNames.has(edge.to)) {
      continue;
    }
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set();
  const clusters = [];

  for (const service of services) {
    if (visited.has(service.name)) {
      continue;
    }

    const queue = [service.name];
    visited.add(service.name);
    const members = [];

    while (queue.length > 0) {
      const current = queue.pop();
      members.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    members.sort((left, right) => left.localeCompare(right));
    const modelFrequency = new Map();

    for (const memberName of members) {
      const serviceNode = services.find((candidate) => candidate.name === memberName);
      for (const modelName of serviceNode?.usesModels ?? []) {
        modelFrequency.set(modelName, (modelFrequency.get(modelName) ?? 0) + 1);
      }
    }

    const topModels = [...modelFrequency.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 10)
      .map(([name, usageCount]) => ({ name, usageCount }));

    clusters.push({
      size: members.length,
      services: members,
      topModels,
    });
  }

  clusters.sort((left, right) => right.size - left.size || left.services[0].localeCompare(right.services[0]));
  return clusters;
}

function buildTopServiceDependencies(services, edges) {
  const inbound = new Map(services.map((service) => [service.name, 0]));
  const outbound = new Map(services.map((service) => [service.name, 0]));

  for (const edge of edges) {
    if (edge.type !== "service_to_service") {
      continue;
    }
    outbound.set(edge.from, (outbound.get(edge.from) ?? 0) + 1);
    inbound.set(edge.to, (inbound.get(edge.to) ?? 0) + 1);
  }

  return services
    .map((service) => ({
      name: service.name,
      inbound: inbound.get(service.name) ?? 0,
      outbound: outbound.get(service.name) ?? 0,
      modelCount: service.usesModels.length,
      routeCount: 0,
    }))
    .sort((left, right) => {
      const scoreLeft = left.inbound + left.outbound + left.modelCount;
      const scoreRight = right.inbound + right.outbound + right.modelCount;
      return scoreRight - scoreLeft || left.name.localeCompare(right.name);
    })
    .slice(0, 15);
}

function buildTopModelUsage(models) {
  return models
    .map((model) => ({
      name: model.name,
      usedByCount: model.usedByServices.length,
      usedByServices: model.usedByServices,
    }))
    .sort((left, right) => right.usedByCount - left.usedByCount || left.name.localeCompare(right.name))
    .slice(0, 15);
}

function buildMermaid(graph) {
  const lines = ["graph TD"];
  const controllerNodes = graph.controllers.map((controller) => ({
    id: `controller_${sanitizeId(controller.name)}`,
    label: controller.name,
  }));
  const serviceNodes = graph.services.map((service) => ({
    id: `service_${sanitizeId(service.name)}`,
    label: service.name,
  }));
  const modelNodes = graph.models.map((model) => ({
    id: `model_${sanitizeId(model.name)}`,
    label: model.name,
  }));

  lines.push("  subgraph Controllers");
  for (const node of controllerNodes) {
    lines.push(`    ${node.id}["${node.label}"]`);
  }
  lines.push("  end");

  lines.push("  subgraph Services");
  for (const node of serviceNodes) {
    lines.push(`    ${node.id}["${node.label}"]`);
  }
  lines.push("  end");

  lines.push("  subgraph Models");
  for (const node of modelNodes) {
    lines.push(`    ${node.id}["${node.label}"]`);
  }
  lines.push("  end");

  const idMap = new Map([
    ...controllerNodes.map((node) => [node.label, node.id]),
    ...serviceNodes.map((node) => [node.label, node.id]),
    ...modelNodes.map((node) => [node.label, node.id]),
  ]);

  for (const edge of graph.edges) {
    lines.push(`  ${idMap.get(edge.from)} --> ${idMap.get(edge.to)}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildOverview(graph) {
  const edgeGroups = {
    controller_to_service: graph.edges.filter((edge) => edge.type === "controller_to_service"),
    service_to_service: graph.edges.filter((edge) => edge.type === "service_to_service"),
    service_to_model: graph.edges.filter((edge) => edge.type === "service_to_model"),
  };

  const routeRows = graph.controllers.flatMap((controller) =>
    controller.routes.map((route) => {
      const methodDetail = controller.methodDetails.find((detail) => detail.name === route.handler);
      return {
        route: `${route.method} ${route.path}`,
        handler: `${controller.name}.${route.handler}`,
        services: methodDetail?.servicesUsed ?? [],
        file: route.file,
      };
    }),
  );

  const lines = [
    "# Backend Architecture Overview",
    "",
    `Generated from \`${toRepoPath(paths.sourceRoot)}\` and \`${toRepoPath(paths.schema)}\`.`,
    "",
    "## Summary",
    "",
    `- Controllers: ${graph.meta.counts.controllers}`,
    `- Services: ${graph.meta.counts.services}`,
    `- Prisma models: ${graph.meta.counts.models}`,
    `- Routes detected: ${graph.meta.counts.routes}`,
    `- Controller -> Service edges: ${edgeGroups.controller_to_service.length}`,
    `- Service -> Service edges: ${edgeGroups.service_to_service.length}`,
    `- Service -> Model edges: ${edgeGroups.service_to_model.length}`,
    `- Mermaid graph: [architecture.system.mmd](./architecture.system.mmd)`,
    `- JSON graph: [architecture.system.graph.json](./architecture.system.graph.json)`,
    "",
    "## Controllers",
    "",
    "| Controller | File | Methods | Routes | Services | Direct Prisma Models |",
    "| --- | --- | --- | ---: | --- | --- |",
  ];

  for (const controller of graph.controllers) {
    lines.push(
      `| ${controller.name} | \`${controller.file}\` | ${controller.methods.join(", ")} | ${controller.routes.length} | ${formatList(controller.usesServices)} | ${formatList(controller.directModelUsage)} |`,
    );
  }

  lines.push("", "## Services", "", "| Service | File | Methods | Depends On | Models | Utils | Config | Cron |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const service of graph.services) {
    lines.push(
      `| ${service.name} | \`${service.file}\` | ${service.methods.join(", ")} | ${formatList(service.dependsOnServices)} | ${formatList(service.usesModels)} | ${formatList(service.usesUtils)} | ${formatList(service.usesConfig)} | ${service.hasCron ? "yes" : "no"} |`,
    );
  }

  lines.push("", "## Controller Entrypoints and Delegated Services", "");
  lines.push("| Route | Handler | Delegated Services | File |");
  lines.push("| --- | --- | --- | --- |");
  for (const routeRow of routeRows.sort((left, right) => left.route.localeCompare(right.route) || left.handler.localeCompare(right.handler))) {
    lines.push(
      `| ${routeRow.route} | ${routeRow.handler} | ${formatList(routeRow.services)} | \`${routeRow.file}\` |`,
    );
  }

  lines.push("", "## Service Dependency Graph", "");
  lines.push("| From | To | Evidence Count |");
  lines.push("| --- | --- | ---: |");
  for (const edge of edgeGroups.service_to_service) {
    lines.push(`| ${edge.from} | ${edge.to} | ${edge.evidence.length} |`);
  }

  lines.push("", "## Model Usage by Service", "");
  lines.push("| Service | Models |");
  lines.push("| --- | --- |");
  for (const service of graph.services) {
    lines.push(`| ${service.name} | ${formatList(service.usesModels)} |`);
  }

  lines.push("", "## Interaction Clusters", "");
  for (const [index, cluster] of graph.analysis.serviceClusters.entries()) {
    lines.push(`### Cluster ${index + 1}`);
    lines.push("");
    lines.push(`- Services (${cluster.size}): ${formatList(cluster.services)}`);
    lines.push(
      `- Top models: ${cluster.topModels.length === 0 ? "none" : cluster.topModels.map((model) => `${model.name} (${model.usageCount})`).join(", ")}`,
    );
    lines.push("");
  }

  lines.push("## Notable Coupling Hotspots", "");
  lines.push("| Service | Inbound | Outbound | Models |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const hotspot of graph.analysis.topServiceDependencies) {
    lines.push(
      `| ${hotspot.name} | ${hotspot.inbound} | ${hotspot.outbound} | ${hotspot.modelCount} |`,
    );
  }

  lines.push("", "## Most Shared Models", "");
  lines.push("| Model | Used By Services |");
  lines.push("| --- | --- |");
  for (const model of graph.analysis.topModelUsage) {
    lines.push(`| ${model.name} | ${formatList(model.usedByServices)} |`);
  }

  return `${lines.join("\n")}\n`;
}

function validateGraph({ controllers, services, models, edges }) {
  const controllerNames = new Set(controllers.map((controller) => controller.name));
  const serviceNames = new Set(services.map((service) => service.name));
  const modelNames = new Set(models.map((model) => model.name));
  const seenEdges = new Set();

  for (const edge of edges) {
    const edgeKey = `${edge.type}:${edge.from}:${edge.to}`;
    if (seenEdges.has(edgeKey)) {
      throw new Error(`Duplicate edge detected: ${edgeKey}`);
    }
    seenEdges.add(edgeKey);

    if (edge.type === "controller_to_service") {
      if (!controllerNames.has(edge.from)) {
        throw new Error(`Unknown controller edge source: ${edge.from}`);
      }
      if (!serviceNames.has(edge.to)) {
        throw new Error(`Unknown service edge target: ${edge.to}`);
      }
      continue;
    }

    if (edge.type === "service_to_service") {
      if (!serviceNames.has(edge.from) || !serviceNames.has(edge.to)) {
        throw new Error(`Unknown service edge endpoint: ${edge.from} -> ${edge.to}`);
      }
      continue;
    }

    if (edge.type === "service_to_model") {
      if (!serviceNames.has(edge.from) || !modelNames.has(edge.to)) {
        throw new Error(`Unknown service/model edge endpoint: ${edge.from} -> ${edge.to}`);
      }
    }
  }
}

function addEdge(edgeAccumulator, edge) {
  const key = `${edge.type}:${edge.from}:${edge.to}`;
  if (!edgeAccumulator.has(key)) {
    edgeAccumulator.set(key, {
      type: edge.type,
      from: edge.from,
      to: edge.to,
      evidence: [],
    });
  }

  const current = edgeAccumulator.get(key);
  current.evidence = mergeEvidenceArrays(current.evidence, edge.evidence ?? []);
}

function mergeUsageMap(targetMap, name, sourceMap) {
  if (!targetMap.has(name)) {
    targetMap.set(name, new Map());
  }

  const destination = targetMap.get(name);
  for (const [evidenceKey, evidence] of sourceMap.entries()) {
    destination.set(evidenceKey, evidence);
  }
}

function addUsage(map, name, evidenceKey, evidence) {
  if (!map.has(name)) {
    map.set(name, new Map());
  }
  map.get(name).set(evidenceKey, evidence);
}

function mapToSortedArray(map) {
  return [...map.entries()]
    .map(([name, evidenceMap]) => ({
      name,
      evidence: sortEvidence(mapValues(evidenceMap)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function mergeEvidenceArrays(existing = [], incoming = []) {
  const merged = new Map();

  for (const item of [...existing, ...incoming]) {
    const key = JSON.stringify(item);
    merged.set(key, item);
  }

  return [...merged.values()];
}

function sortEvidence(evidence) {
  return [...evidence].sort((left, right) => {
    const leftFile = left.file ?? "";
    const rightFile = right.file ?? "";
    const leftLine = left.line ?? 0;
    const rightLine = right.line ?? 0;
    const leftRoute = left.route ?? "";
    const rightRoute = right.route ?? "";
    const leftCall = left.call ?? left.access ?? left.handler ?? "";
    const rightCall = right.call ?? right.access ?? right.handler ?? "";
    return (
      leftFile.localeCompare(rightFile) ||
      leftLine - rightLine ||
      leftRoute.localeCompare(rightRoute) ||
      leftCall.localeCompare(rightCall)
    );
  });
}

function mapValues(mapLike) {
  if (!mapLike) {
    return [];
  }
  if (mapLike instanceof Map) {
    return [...mapLike.values()];
  }
  return [...mapLike];
}

function resolveControllerHandler(expression, controllerInstances, importContext, controllerIndex) {
  const target = unwrapExpression(expression);

  if (ts.isCallExpression(target)) {
    const callExpression = unwrapExpression(target.expression);
    if (
      ts.isPropertyAccessExpression(callExpression) &&
      callExpression.name.text === "bind"
    ) {
      return resolveControllerHandler(
        callExpression.expression,
        controllerInstances,
        importContext,
        controllerIndex,
      );
    }
    return null;
  }

  if (!ts.isPropertyAccessExpression(target)) {
    return null;
  }

  const method = target.name.text;
  const owner = unwrapExpression(target.expression);

  if (ts.isIdentifier(owner) && controllerInstances.has(owner.text)) {
    return {
      controller: controllerInstances.get(owner.text),
      method,
    };
  }

  if (ts.isNewExpression(owner) && ts.isIdentifier(owner.expression)) {
    const controllerName = getControllerInstanceName(owner, importContext, controllerIndex);
    if (controllerName) {
      return {
        controller: controllerName,
        method,
      };
    }
  }

  return null;
}

function getRoutePath(argument) {
  const target = unwrapExpression(argument);
  if (ts.isStringLiteral(target) || ts.isNoSubstitutionTemplateLiteral(target)) {
    return target.text;
  }
  return null;
}

function resolveImport(filePath, moduleSpecifier) {
  if (!moduleSpecifier.startsWith(".")) {
    return null;
  }

  const basePath = path.resolve(path.dirname(filePath), moduleSpecifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.js"),
  ];

  for (const candidate of candidates) {
    try {
      if (ts.sys.fileExists(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore file resolution failures.
    }
  }

  return null;
}

function categorizeImport(moduleSpecifier, resolvedPath) {
  if (!moduleSpecifier.startsWith(".")) {
    return "external";
  }
  if (!resolvedPath) {
    return "other";
  }

  const repoPath = toRepoPath(resolvedPath);
  if (repoPath.startsWith("services/src/src/services/")) {
    return "service";
  }
  if (repoPath.startsWith("services/src/src/controllers/")) {
    return "controller";
  }
  if (repoPath.startsWith("services/src/src/prisma")) {
    return "prisma";
  }
  if (repoPath.startsWith("services/src/src/config/")) {
    return "config";
  }
  if (repoPath.startsWith("services/src/src/utils/")) {
    return "utils";
  }
  if (repoPath.startsWith("services/src/src/middlewares/")) {
    return "middleware";
  }
  if (repoPath.startsWith("services/src/src/routes/")) {
    return "routes";
  }
  return "other";
}

function getClassMemberName(member) {
  if (
    (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) &&
    member.name &&
    ts.isIdentifier(member.name)
  ) {
    return member.name.text;
  }
  return null;
}

function getExecutableBody(member) {
  if (ts.isMethodDeclaration(member) && member.body) {
    return member.body;
  }
  if (
    ts.isPropertyDeclaration(member) &&
    member.initializer &&
    (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))
  ) {
    return member.initializer.body;
  }
  return null;
}

function getServiceInstanceName(expression, serviceIndex, importContext) {
  const target = unwrapExpression(expression);
  if (!ts.isNewExpression(target) || !ts.isIdentifier(target.expression)) {
    return null;
  }

  const importInfo = importContext.identifiers.get(target.expression.text);
  if (importInfo?.category === "service" && importInfo.entityName) {
    return importInfo.entityName;
  }

  return serviceIndex.uniqueByRawName.get(target.expression.text) ?? null;
}

function resolveServiceReference(expression, env, serviceIndex, importContext) {
  const directService = getServiceInstanceName(expression, serviceIndex, importContext);
  if (directService) {
    return directService;
  }

  const target = unwrapExpression(expression);
  if (ts.isIdentifier(target) && env.serviceVars.has(target.text)) {
    return env.serviceVars.get(target.text);
  }

  const chain = flattenPropertyAccess(target);
  if (chain.length === 2 && chain[0] === "this") {
    return env.serviceVars.get(`this.${chain[1]}`) ?? null;
  }

  return null;
}

function collectServiceAliases(classNode, importContext, serviceIndex) {
  const aliases = new Map();

  for (const member of classNode.members) {
    if (
      ts.isPropertyDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name) &&
      member.initializer
    ) {
      const serviceName = getServiceInstanceName(member.initializer, serviceIndex, importContext);
      if (serviceName) {
        aliases.set(`this.${member.name.text}`, serviceName);
      }
    }
  }

  return aliases;
}

function collectPrismaAliases(classNode, importContext) {
  const aliases = new Set();

  for (const member of classNode.members) {
    if (
      ts.isPropertyDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name) &&
      member.initializer &&
      isImportedPrismaIdentifier(member.initializer, importContext)
    ) {
      aliases.add(`this.${member.name.text}`);
    }
  }

  return aliases;
}

function isPrismaAliasExpression(expression, env, importContext, prismaAliases) {
  const target = unwrapExpression(expression);

  if (ts.isIdentifier(target)) {
    return importContext.identifiers.get(target.text)?.category === "prisma" || env.prismaVars.has(target.text);
  }

  const chain = flattenPropertyAccess(target);
  if (chain.length === 2 && chain[0] === "this") {
    return prismaAliases.has(`this.${chain[1]}`);
  }

  return false;
}

function isImportedPrismaIdentifier(expression, importContext) {
  const target = unwrapExpression(expression);
  return ts.isIdentifier(target) && importContext.identifiers.get(target.text)?.category === "prisma";
}

function flattenPropertyAccess(expression) {
  const parts = [];
  let current = unwrapExpression(expression);

  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = unwrapExpression(current.expression);
  }

  if (ts.isIdentifier(current)) {
    parts.unshift(current.text);
    return parts;
  }

  if (current.kind === ts.SyntaxKind.ThisKeyword) {
    parts.unshift("this");
    return parts;
  }

  return [];
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isNestedFunctionLike(node) {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node)
  );
}

function isTransactionCallback(node, importContext, prismaModels) {
  const parent = node.parent;
  if (!parent || !ts.isCallExpression(parent)) {
    return false;
  }

  const expression = unwrapExpression(parent.expression);
  const chain = flattenPropertyAccess(expression);
  if (chain.length < 2) {
    return false;
  }

  const [rootIdentifier, operation] = chain;
  if (operation !== "$transaction") {
    return false;
  }

  return importContext.identifiers.get(rootIdentifier)?.category === "prisma";
}

function lineNumber(sourceFile, node) {
  return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line + 1;
}

function printNode(node, sourceFile) {
  return node.getText(sourceFile);
}

function lowerFirst(value) {
  return value.length === 0 ? value : `${value[0].toLowerCase()}${value.slice(1)}`;
}

function buildQualifier(rootDir, filePath) {
  const relativeDir = path.relative(rootDir, path.dirname(filePath)).split(path.sep).filter(Boolean);
  return relativeDir.join(".");
}

function getControllerInstanceName(expression, importContext, controllerIndex) {
  const target = unwrapExpression(expression);
  if (!ts.isNewExpression(target) || !ts.isIdentifier(target.expression)) {
    return null;
  }

  const importInfo = importContext.identifiers.get(target.expression.text);
  if (importInfo?.category === "controller" && importInfo.entityName) {
    return importInfo.entityName;
  }

  return controllerIndex.uniqueByRawName.get(target.expression.text) ?? null;
}

function sanitizeId(value) {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function formatList(values) {
  if (!values || values.length === 0) {
    return "none";
  }
  return values.join(", ");
}

function countUnique(values) {
  return new Set(values).size;
}

function toRepoPath(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
