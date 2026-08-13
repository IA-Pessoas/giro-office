import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createV2ClientIdentityResolver } from "../rules/admin-business.mjs";
import { CASTELO_ORGANIZATION_ID, REQUIRED_IDENTITY_NAMESPACE } from "./mapping-contract.mjs";
import { iterateSqlRows } from "./sql-dump-parser.mjs";
import { uuidV5 } from "./uuid-v5.mjs";

const AUXILIARY_SOURCE_TABLES = Object.freeze([
  "tb_cbs.estoque_andares",
  "tb_cbs.estoque_categorias_itens",
  "tb_cbs.estoque_itens",
  "tb_rh.cargos",
]);
const INTEGRACAO_REGULARIZE_PREFIXES = Object.freeze(["tb_integracao.", "tb_regularize."]);
const SPECIALIZED_PREFIXES = Object.freeze([
  "tb_certificados.",
  "tb_parcelamento.",
  "tb_tecnologia.",
]);
const CONFIRMED_PERMISSION_TABLES = Object.freeze(
  [
    "certificado",
    "comercial",
    "contabil",
    "financeiro",
    "fiscal",
    "integracao",
    "marketing",
    "parcelamento",
    "pessoal",
    "regularize",
    "rh",
    "triagem",
  ].map((module) => `tb_admin.permissoes_${module}`),
);

export async function loadRuntimeSourceRows({ sourceDir, sourceTables }) {
  const requested = new Set([...sourceTables, ...AUXILIARY_SOURCE_TABLES]);
  requested.delete("tb_admin.logs");
  const rowsBySource = new Map();
  for (const sourceTable of [...requested].sort(compareText)) {
    const rows = [];
    try {
      for await (const row of iterateSqlRows(path.join(sourceDir, `${sourceTable}.sql`))) {
        rows.push(row);
      }
    } catch (error) {
      if (AUXILIARY_SOURCE_TABLES.includes(sourceTable) && error?.code === "ENOENT") continue;
      throw error;
    }
    rowsBySource.set(sourceTable, rows);
  }
  return rowsBySource;
}

export function createRuntimeOptionsFromRows({
  sourceRowsByTable,
  destinationRowsByTable = new Map(),
  capabilities = {},
}) {
  if (!(sourceRowsByTable instanceof Map) || !(destinationRowsByTable instanceof Map)) {
    throw new TypeError("Rows de runtime devem ser Maps");
  }
  const source = (name) => sourceRowsByTable.get(name) ?? [];
  const destination = (name) => destinationRowsByTable.get(name) ?? [];
  const currentDestinationRows = [...destinationRowsByTable].flatMap(([destinationTable, rows]) =>
    rows.map((row) => ({ ...row, destinationTable })),
  );
  const legacyUsers = source("tb_admin.usuarios");
  const departments = source("tb_admin.departamentos");
  const departmentIds = new Set(
    departments
      .map((row) => normalizeKey(row.id))
      .filter((value) => value !== null),
  );
  const regularizeClients = source("tb_regularize.clientes");
  const integrationClients = source("tb_integracao.clientes");
  const migratableLegacyUsers = legacyUsers.filter((row) =>
    departmentIds.has(normalizeKey(row.departamento_id)) &&
    row.password !== null &&
    row.password !== undefined &&
    String(row.password).trim().length > 0,
  );
  const plannedUsers = migratableLegacyUsers.map((row) => ({
    ...plannedStandardCandidate("tb_admin.usuarios", row),
    migrationOrigin: "legacy",
  }));
  const plannedClients = [
    ...integrationClients.map((row) =>
      plannedClientCandidate("tb_integracao.clientes", row.id, row),
    ),
    ...regularizeClients.map((row) =>
      plannedClientCandidate(
        hasPositiveIdentity(row.cliente_id) ? "tb_integracao.clientes" : "tb_regularize.clientes",
        hasPositiveIdentity(row.cliente_id) ? row.cliente_id : row.codigo,
        row,
        row.codigo,
      ),
    ),
  ];
  const permissionRowsBySource = Object.fromEntries(
    [...sourceRowsByTable]
      .filter(([sourceTable]) => CONFIRMED_PERMISSION_TABLES.includes(sourceTable))
      .map(([sourceTable, rows]) => [sourceTable, rows]),
  );
  const sourceRows = Object.fromEntries(sourceRowsByTable);
  const specializedRows = filterRowsByPrefix(sourceRowsByTable, SPECIALIZED_PREFIXES);
  const integracaoRegularizeRows = filterRowsByPrefix(
    sourceRowsByTable,
    INTEGRACAO_REGULARIZE_PREFIXES,
  );
  for (const dependency of ["tb_admin.departamentos", "tb_admin.usuarios"]) {
    if (sourceRowsByTable.has(dependency)) {
      integracaoRegularizeRows.set(dependency, source(dependency));
      specializedRows.set(dependency, source(dependency));
    }
  }
  if (sourceRowsByTable.has("tb_cbc.panorama_parcelamentos")) {
    specializedRows.set("tb_cbc.panorama_parcelamentos", source("tb_cbc.panorama_parcelamentos"));
  }

  const legacyUserIds = new Set(source("tb_admin.usuarios").map((row) => normalizeKey(row.id)));
  const legacyUserIdByCanonicalId = new Map(
    legacyUsers.map((row) => [standardId("tb_admin.usuarios", row.id), row.id]),
  );
  const existingDestinationUsers = destination("users").map((row) => ({
    ...row,
    migrationOrigin: "native",
    legacyId: row.legacyId ?? legacyUserIdByCanonicalId.get(row.id) ?? null,
  }));
  const userCandidates = mergeCandidatesById([
    ...plannedUsers,
    ...existingDestinationUsers,
  ]);
  const collaboratorUserCandidates = source("tb_rh.colaboradores")
    .filter((row) => legacyUserIds.has(normalizeKey(row.user_id)))
    .map((row) => ({
      id: standardId("tb_admin.usuarios", row.user_id),
      legacyId: row.id,
      organization_id: CASTELO_ORGANIZATION_ID,
    }));
  const clientCandidates = mergeCandidatesById([...plannedClients, ...destination("clients")]);
  const plannedV2DestinationRows = [
    ...plannedUsers.map((row) => ({ ...row, destinationTable: "users" })),
    ...plannedClients.map((row) => ({
      ...row,
      cpf_cnpj: normalizeDigits(row.cpf_cnpj),
      destinationTable: "clients",
      name: row.name ?? row.nome ?? null,
    })),
    ...source("tb_integracao.prospeccao_comercial").map((row) => ({
      id: standardId("tb_integracao.prospeccao_comercial", row.id),
      client_id: standardId("tb_integracao.clientes", row.cliente_id),
      destinationTable: "integracao.projects",
      organization_id: CASTELO_ORGANIZATION_ID,
    })),
    ...source("tb_integracao.tarefas_express").map((row) => ({
      id: standardId("tb_integracao.tarefas_express", row.id),
      department_id: standardId("tb_admin.departamentos", row.departamento_id),
      destinationTable: "integracao.tasksModel",
      name: row.nome,
      organization_id: CASTELO_ORGANIZATION_ID,
    })),
    ...source("tb_regularize.processos").map((row) => ({
      id: standardId("tb_regularize.processos", row.id),
      destinationTable: "regularize.process",
      organization_id: CASTELO_ORGANIZATION_ID,
    })),
  ].filter(({ id }) => typeof id === "string");
  const destinationRows = mergeDestinationRowsByIdentity([
    ...plannedV2DestinationRows,
    ...currentDestinationRows,
  ]);
  const rhResolvers = createRhResolvers({ sourceRowsByTable, destinationRowsByTable });
  const technologyDepartment = departments.find((row) => normalizeKey(row.nome) === "tecnologia");
  const stockFloors = new Map(
    source("tb_cbs.estoque_andares").map((row) => [normalizeKey(row.id), normalizeFloor(row.nome)]),
  );
  const specializedClientCandidates = createSpecializedClientCandidates({
    clientCandidates,
    integrationClients,
    installmentClients: source("tb_parcelamento.clientes"),
    regularizeClients,
  });

  return {
    v2: {
      destinationRows,
      sourceRows: source("tb_rh.cargos").map((row) => ({
        ...row,
        sourceTable: "tb_rh.cargos",
      })),
      credentialEncryptionVerified: typeof capabilities.encryptMtk === "function",
      encryptCredential: capabilities.encryptMtk,
      passwordHashingVerified: typeof capabilities.hashLegacyPassword === "function",
      hashLegacyPassword: capabilities.hashLegacyPassword,
      resolveDepartmentReference: deterministicReference(
        sourceRowsByTable,
        "tb_admin.departamentos",
      ),
      resolveIntegrationClientReference: deterministicReference(
        sourceRowsByTable,
        "tb_integracao.clientes",
      ),
      resolveProjectPlanReference: deterministicReference(
        sourceRowsByTable,
        "tb_integracao.planos",
      ),
      resolveRegularizeClientReference: canonicalRegularizeClientReference(sourceRowsByTable),
      resolveTaskModelReference: deterministicReference(
        sourceRowsByTable,
        "tb_integracao.tarefas_express",
      ),
      resolveUserReference: deterministicReference(sourceRowsByTable, "tb_admin.usuarios"),
    },
    adminBusiness: {
      legacyUsers: migratableLegacyUsers,
      destinationUsers: userCandidates,
      regularizeClients,
      integrationClients,
      destinationClients: clientCandidates,
      icmsRows: source("tb_fiscal.icms"),
      permissionRowsBySource,
    },
    integracaoRegularize: {
      sourceRows: Object.fromEntries(integracaoRegularizeRows),
      clientCandidates: [],
      clientPfRows: source("tb_regularize.pf"),
      currentClientPfRows: destination("clients.pf"),
      currentClientPfStateVerified: destinationRowsByTable.has("clients.pf"),
      partnerRows: source("tb_regularize.pf_empresas"),
      regularizeClients,
      integrationClients,
    },
    rhPessoal: {
      ...rhResolvers,
      readUserJson: (userId, field) => readLegacyUserJson(userCandidates, userId, field),
      ...(typeof capabilities.encryptPessoal === "function"
        ? { encryptCredential: capabilities.encryptPessoal }
        : {}),
    },
    specialized: {
      sourceRows: specializedRows,
      clientCandidates: specializedClientCandidates,
      departmentCandidates: plannedCandidates(departments, "tb_admin.departamentos"),
      inventoryCategoryCandidates: source("tb_tecnologia.opcoes").flatMap((row) => {
        const candidate = {
          ...row,
          id: specializedId("organization-normalized-name", row.categoria),
          organization_id: CASTELO_ORGANIZATION_ID,
        };
        return [
          { ...candidate, legacyId: row.id },
          { ...candidate, legacyId: row.categoria },
        ];
      }),
      inventoryLocationCandidates: specializedNameCandidates(
        "organization-normalized-name",
        source("tb_tecnologia.inventario_loc"),
        "nome",
      ),
      installmentCandidates: specializedLegacyCandidates(
        "tb_parcelamento.parcelamentos",
        source("tb_parcelamento.parcelamentos"),
      ),
      stockCandidates: specializedLegacyCandidates(
        "tb_tecnologia.estoque",
        source("tb_tecnologia.estoque"),
      ),
      stockLocationCandidates: source("tb_cbs.estoque_localizacoes").map((row) => ({
        ...row,
        floor: stockFloors.get(normalizeKey(row.andar)) ?? null,
        id: specializedId("organization-resolved-location-name", row.nome),
        legacyId: row.id,
        name: row.nome,
        organization_id: CASTELO_ORGANIZATION_ID,
      })),
      technologyDepartmentCandidates:
        technologyDepartment === undefined
          ? []
          : [
              {
                ...plannedStandardCandidate("tb_admin.departamentos", technologyDepartment),
                legacyId: CASTELO_ORGANIZATION_ID,
              },
            ],
      userCandidates,
      collaboratorUserCandidates,
      resolveUnique: createSpecializedUniqueResolver(destinationRowsByTable),
      encrypt: capabilities.encryptCertificate,
      storeCertificate: capabilities.storeCertificate,
    },
    remaining: {
      sourceRows,
      encryptionConfigured: typeof capabilities.encryptMtk === "function",
    },
  };
}

export function createCryptoCapabilities(env) {
  const encryptMtk = createAesGcmTextEncryptor(env.MTK_ENCRYPTION_KEY, { format: "legacy" });
  const encryptPessoal = createAesGcmTextEncryptor(env.PESSOAL_PASSWORD_ENCRYPTION_KEY, {
    format: "json",
    version: env.PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION,
  });
  const encryptCertificate = createAesGcmTextEncryptor(env.CERTIFICATE_FILE_ENCRYPTION_KEY, {
    format: "json",
    version: env.CERTIFICATE_FILE_ENCRYPTION_KEY_VERSION,
  });
  const bcrypt = loadInstalledBcrypt();
  return {
    encryptMtk,
    encryptPessoal,
    encryptCertificate,
    hashLegacyPassword:
      typeof bcrypt?.hash === "function" ? (value) => bcrypt.hash(String(value), 8) : undefined,
  };
}

function loadInstalledBcrypt() {
  try {
    return createRequire(import.meta.url)("bcryptjs");
  } catch {}
  let directory = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth += 1) {
    for (const relativePath of [
      "node_modules/bcryptjs",
      "node_modules/.pnpm/node_modules/bcryptjs",
      "infra/node_modules/bcryptjs",
      "services/user-service/node_modules/bcryptjs",
    ]) {
      const candidate = path.join(directory, relativePath);
      if (!existsSync(path.join(candidate, "package.json"))) continue;
      try {
        return createRequire(import.meta.url)(candidate);
      } catch {}
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

function createRhResolvers({ sourceRowsByTable, destinationRowsByTable }) {
  const simple = (sourceTable) => referenceResolver(sourceRowsByTable, sourceTable);
  const legacyUserIds = new Set(
    (sourceRowsByTable.get("tb_admin.usuarios") ?? []).map((row) => normalizeKey(row.id)),
  );
  const collaboratorUsers = new Map(
    (sourceRowsByTable.get("tb_rh.colaboradores") ?? []).map((row) => [
      normalizeKey(row.id),
      legacyUserIds.has(normalizeKey(row.user_id))
        ? standardId("tb_admin.usuarios", row.user_id)
        : undefined,
    ]),
  );
  const scoreRows = sourceRowsByTable.get("tb_rh.score") ?? [];
  const resolveScore = (value) => {
    if (typeof value === "object" && value !== null) {
      const matches = scoreRows.filter(
        (row) =>
          normalizeKey(row.col_id) === normalizeKey(value.collaboratorId) &&
          normalizeKey(row.trimestre) === normalizeKey(value.quarter),
      );
      return resolution(matches.map((row) => standardId("tb_rh.score", row.id)));
    }
    return simple("tb_rh.score")(value);
  };
  return {
    resolveClient: createClientResolver(sourceRowsByTable, destinationRowsByTable),
    resolveUser: simple("tb_admin.usuarios"),
    resolveCollaboratorUser: (value) => resolution([collaboratorUsers.get(normalizeKey(value))]),
    resolveUnion: simple("tb_pessoal.sindicato"),
    resolvePoint: simple("tb_rh.pontos_registros"),
    resolveScore,
    resolveQuestion: simple("tb_rh.score_perguntas"),
    resolveRequestCategory: simple("tb_rh.solicitacoes_categorias"),
    resolveRequest: simple("tb_rh.solicitacoes"),
    resolveUnique: (kind, value) => resolveRhUnique(kind, value, destinationRowsByTable),
  };
}

function resolveRhUnique(kind, value, rowsByDestination) {
  const definitions = {
    payroll: ["pessoal.payroll", (row) => normalizeKey(row.client_id) === normalizeKey(value)],
    obligation: [
      "pessoal.obligations",
      (row) =>
        normalizeKey(row.client_id) === normalizeKey(value?.clientId) &&
        normalizeKey(row.competence) === normalizeKey(value?.competence),
    ],
    union: [
      "pessoal.union",
      (row) =>
        normalizeKey(row.name) === normalizeKey(value?.name) &&
        normalizeKey(row.cnpj) === normalizeKey(value?.cnpj) &&
        normalizeDateKey(row.base_date) === normalizeDateKey(value?.baseDate),
    ],
    pointConfig: ["rh.pointConfig", (row) => normalizeKey(row.user_id) === normalizeKey(value)],
    score: [
      "rh.score",
      (row) =>
        normalizeKey(row.user_id) === normalizeKey(value?.userId) &&
        normalizeKey(row.quarter) === normalizeKey(value?.quarter),
    ],
    scoreNitro: ["rh.score_nitro", (row) => normalizeKey(row.score_id) === normalizeKey(value)],
  };
  const [destinationTable, predicate] = definitions[kind] ?? [];
  if (destinationTable === undefined) return { state: "not_executed", id: null };
  return resolution(
    (rowsByDestination.get(destinationTable) ?? []).filter(predicate).map((row) => row.id),
  );
}

function canonicalRegularizeClientReference(rowsBySource) {
  const resolver = createV2ClientIdentityResolver({
    integrationRows: rowsBySource.get("tb_integracao.clientes") ?? [],
    regularizeRows: rowsBySource.get("tb_regularize.clientes") ?? [],
  });
  return (value) => {
    const legacy = resolver.resolve(value);
    return legacy.state === "one" && typeof legacy.identityRef === "string"
      ? uuidV5(REQUIRED_IDENTITY_NAMESPACE, legacy.identityRef)
      : undefined;
  };
}

function createClientResolver(rowsBySource, destinationRowsByTable) {
  const resolver = createV2ClientIdentityResolver({
    integrationRows: rowsBySource.get("tb_integracao.clientes") ?? [],
    regularizeRows: rowsBySource.get("tb_regularize.clientes") ?? [],
  });
  return (value) => {
    const legacy = resolver.resolve(value);
    if (legacy.state !== "one" || typeof legacy.identityRef !== "string") {
      return { state: legacy.state, id: null };
    }
    const id = uuidV5(REQUIRED_IDENTITY_NAMESPACE, legacy.identityRef);
    const current = destinationRowsByTable.get("clients") ?? [];
    const valueAtDestination = current.find((row) => row.id === id) ?? null;
    return { state: "one", id, value: valueAtDestination };
  };
}

function referenceResolver(rowsBySource, sourceTable) {
  const rows = rowsBySource.get(sourceTable) ?? [];
  return (value) => {
    const normalized = normalizeKey(value);
    return resolution(
      rows
        .filter((row) => normalizeKey(row.id) === normalized)
        .map((row) => standardId(sourceTable, row.id)),
    );
  };
}

function deterministicReference(rowsBySource, sourceTable) {
  const resolver = referenceResolver(rowsBySource, sourceTable);
  return (value) => (resolver(value).state === "one" ? standardId(sourceTable, value) : undefined);
}

function resolution(values) {
  const ids = [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
  return {
    state: ids.length === 0 ? "zero" : ids.length === 1 ? "one" : "many",
    id: ids.length === 1 ? ids[0] : null,
  };
}

function plannedCandidates(rows, sourceTable = null) {
  return rows.map((row) => plannedStandardCandidate(sourceTable, row));
}

function plannedStandardCandidate(sourceTable, row) {
  const table = sourceTable ?? row.sourceTable;
  return {
    ...row,
    id: standardId(table, row.id),
    legacyId: row.id,
    organization_id: CASTELO_ORGANIZATION_ID,
  };
}

function specializedLegacyCandidates(scope, rows) {
  return rows.map((row) => ({
    ...row,
    id: specializedId(scope, row.id),
    legacyId: row.id,
    organization_id: CASTELO_ORGANIZATION_ID,
  }));
}

function specializedNameCandidates(scope, rows, field) {
  return rows.map((row) => ({
    ...row,
    id: specializedId(scope, row[field]),
    legacyId: row.id ?? row[field],
    organization_id: CASTELO_ORGANIZATION_ID,
  }));
}

function standardId(scope, value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return uuidV5(REQUIRED_IDENTITY_NAMESPACE, `${scope}:${String(value).trim()}`);
}

function specializedId(scope, value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return uuidV5(
    REQUIRED_IDENTITY_NAMESPACE,
    `${scope}:${CASTELO_ORGANIZATION_ID}:${String(value).normalize("NFKC").trim()}`,
  );
}

function readLegacyUserJson(candidates, userId, field) {
  const rows = candidates.filter((row) => String(row.id) === String(userId));
  if (rows.length !== 1) throw new Error("USER_JSON_IDENTITY_NOT_UNIQUE");
  const value = Array.isArray(rows[0][field]) ? rows[0][field] : [];
  return {
    state:
      value.length === 0 ? "empty" : rows[0].migrationOrigin === "legacy" ? "legacy" : "native",
    value,
  };
}

function plannedClientCandidate(sourceTable, sourceIdentity, row, legacyId = row.id) {
  return {
    ...row,
    id: standardId(sourceTable, sourceIdentity),
    legacyId,
    organization_id: CASTELO_ORGANIZATION_ID,
  };
}

function mergeCandidatesById(rows) {
  const candidates = new Map();
  for (const row of rows) {
    if (typeof row?.id !== "string" || row.id.length === 0) continue;
    const existing = candidates.get(row.id);
    candidates.set(
      row.id,
      existing === undefined
        ? row
        : {
            ...existing,
            ...row,
            legacyId: row.legacyId ?? existing.legacyId,
          },
    );
  }
  return [...candidates.values()];
}

function mergeDestinationRowsByIdentity(rows) {
  const candidates = new Map();
  for (const row of rows) {
    if (typeof row?.destinationTable !== "string" || typeof row?.id !== "string") continue;
    candidates.set(`${row.destinationTable}\0${row.id}`, row);
  }
  return [...candidates.values()];
}

function createSpecializedClientCandidates({
  clientCandidates,
  integrationClients,
  installmentClients,
  regularizeClients,
}) {
  const aliases = [
    ...integrationClients.map((row) => ({
      ...plannedClientCandidate("tb_integracao.clientes", row.id, row),
      catalog: "integration",
    })),
    ...regularizeClients.map((row) => ({
      ...plannedClientCandidate(
        hasPositiveIdentity(row.cliente_id) ? "tb_integracao.clientes" : "tb_regularize.clientes",
        hasPositiveIdentity(row.cliente_id) ? row.cliente_id : row.codigo,
        row,
        row.codigo,
      ),
      catalog: "regularize",
    })),
  ];
  for (const row of installmentClients) {
    const document = normalizeDigits(row.cpf_cnpj);
    const name = normalizeKey(row.nome);
    const matches = mergeCandidatesById(clientCandidates).filter(
      (candidate) =>
        (document !== null && normalizeDigits(candidate.cpf_cnpj) === document) ||
        (name !== null &&
          [candidate.name, candidate.nome].some((value) => normalizeKey(value) === name)),
    );
    if (matches.length !== 1) continue;
    aliases.push({
      ...matches[0],
      catalog: "external",
      legacyId: row.id,
    });
  }
  return aliases;
}

function createSpecializedUniqueResolver(destinationRowsByTable) {
  return (kind, value) => {
    const definitions = {
      installment: [
        "parcelamento.installments",
        (row) => row.id === specializedId("tb_parcelamento.parcelamentos", value?.legacyId),
      ],
      competence: [
        "parcelamento.installmentsCompetencies",
        (row) =>
          normalizeKey(row.installment_id) === normalizeKey(value?.installmentId) &&
          normalizeCompetence(row.competence) === normalizeCompetence(value?.competence),
      ],
      panorama: [
        "parcelamento.panorama",
        (row) =>
          normalizeKey(row.client_id) === normalizeKey(value?.clientId) &&
          normalizeCompetence(row.competence) === normalizeCompetence(value?.competence),
      ],
    };
    const [destinationTable, predicate] = definitions[kind] ?? [];
    if (destinationTable === undefined || !destinationRowsByTable.has(destinationTable)) {
      return { state: "not_executed", id: null };
    }
    return resolution(
      (destinationRowsByTable.get(destinationTable) ?? []).filter(predicate).map((row) => row.id),
    );
  };
}

function hasPositiveIdentity(value) {
  return /^[1-9]\d*$/.test(String(value ?? "").trim());
}

function normalizeDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : normalizeKey(value);
}

function normalizeDigits(value) {
  const digits = String(value ?? "").replaceAll(/\D/g, "");
  return digits.length === 0 ? null : digits;
}

function normalizeCompetence(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})/);
  return match === null ? normalizeKey(value) : `${match[1]}-${match[2]}`;
}

function createAesGcmTextEncryptor(base64Key, { format, version } = {}) {
  if (typeof base64Key !== "string") return undefined;
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) return undefined;
  if (format === "json" && (typeof version !== "string" || version.trim() === "")) {
    return undefined;
  }
  return async (value) => {
    const iv = randomBytes(format === "legacy" ? 16 : 12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    if (format === "legacy") {
      return `${iv.toString("hex")}:${tag.toString("hex")}:${data.toString("hex")}`;
    }
    return JSON.stringify({
      v: version.trim(),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: data.toString("base64"),
    });
  };
}

function filterRowsByPrefix(rowsBySource, prefixes) {
  return new Map(
    [...rowsBySource].filter(([sourceTable]) =>
      prefixes.some((prefix) => sourceTable.startsWith(prefix)),
    ),
  );
}

function normalizeKey(value) {
  if (value === null || value === undefined) return null;
  return String(value).normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
}

function normalizeFloor(value) {
  const match = String(value ?? "").match(/\d+/);
  return match === null ? null : Number(match[0]);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
