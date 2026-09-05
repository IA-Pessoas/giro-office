import { createHash } from "node:crypto";
import { normalizeRequiredScalarText } from "../lib/empty-scalar-policy.mjs";
import { createRuntimeEntry } from "../lib/execution-registry.mjs";
import { CASTELO_ORGANIZATION_ID, REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";
import { uuidV5 } from "../lib/uuid-v5.mjs";
import { CERTIFICATE_RULES, CERTIFICATE_RUNTIME_SOURCE_TABLES } from "../rules/certificates.mjs";
import { PARCELAMENTO_RULES, PARCELAMENTO_RUNTIME_SOURCE_TABLES } from "../rules/parcelamento.mjs";
import { TECHNOLOGY_RULES, TECHNOLOGY_RUNTIME_SOURCE_TABLES } from "../rules/tecnologia.mjs";

const SPECIALIZED_RULES = Object.freeze([
  ...TECHNOLOGY_RULES,
  ...CERTIFICATE_RULES,
  ...PARCELAMENTO_RULES,
]);
const STEPS_BY_ID = new Map(
  SPECIALIZED_RULES.flatMap((rule) =>
    rule.destinations.map((step) => [step.stepId, Object.freeze({ rule, step })]),
  ),
);
const EMPTY_RESOLUTION = Object.freeze({ state: "not_executed", id: null, value: null });
const EMPTY_CERTIFICATE_ASSET = Object.freeze({
  encryptionIv: null,
  encryptionKeyVersion: null,
  encryptionTag: null,
  mimeType: null,
  originalName: null,
  path: null,
  sha256: null,
  sizeBytes: null,
  storageBucket: null,
  storageProvider: null,
  uploadedAt: null,
  uploadedByUserId: null,
});
const SPECIALIZED_SOURCE_TABLES = Object.freeze([
  ...TECHNOLOGY_RUNTIME_SOURCE_TABLES,
  ...CERTIFICATE_RUNTIME_SOURCE_TABLES,
  ...PARCELAMENTO_RUNTIME_SOURCE_TABLES,
]);

export const SPECIALIZED_TRANSFORMERS = Object.freeze({
  derive_aes_gcm_authentication_tag: certificateField("encryptionTag"),
  derive_aes_gcm_iv: certificateField("encryptionIv"),
  derive_configured_encryption_key_version: certificateField("encryptionKeyVersion"),
  derive_configured_storage_bucket: certificateField("storageBucket"),
  derive_configured_storage_provider: certificateField("storageProvider"),
  derive_from_verified_encrypted_file: ({ value, row }) =>
    Number(value) === 1 && !isEmpty(row?.arquivo),
  derive_plaintext_sha256_before_encryption: certificateField("sha256"),
  derive_storage_upload_timestamp: certificateField("uploadedAt"),
  derive_validated_certificate_mime_type: certificateField("mimeType"),
  derive_verified_original_name: certificateField("originalName"),
  derive_verified_plaintext_size: certificateField("sizeBytes"),
  encrypt_credential: ({ value, runtimeState, metadata }) =>
    encryptSecret(value, runtimeState, metadata, "CREDENTIAL_ENCRYPTION_UNAVAILABLE"),
  map_installment_status_explicitly: ({ value }) => mapEnum(value, INSTALLMENT_STATUSES),
  map_shutdown_reason_explicitly: ({ value }) => mapEnum(value, SHUTDOWN_REASONS),
  map_submission_type_explicitly: ({ value }) => mapEnum(value, SUBMISSION_TYPES),
  normalize_boolean: ({ value }) => normalizeBoolean(value),
  normalize_boolean_code: ({ value }) => normalizeBooleanCode(value),
  normalize_document: ({ value }) => required(normalizeDigits(value), "DOCUMENT_REQUIRED"),
  normalize_legacy_document_path_fallback: ({ value }) => normalizeText(value),
  normalize_legacy_document_url_preferred: ({ value }) => normalizeText(value),
  normalize_lookup_company_name: ({ value }) => normalizeText(value),
  normalize_lookup_document: ({ value }) =>
    required(normalizeDigits(value), "LOOKUP_DOCUMENT_REQUIRED"),
  normalize_lookup_fantasy_name: ({ value }) => normalizeText(value),
  normalize_lookup_name: ({ value }) => normalizeRequiredScalarText(normalizeText(value)),
  normalize_lookup_regime: ({ value }) => normalizeText(value),
  normalize_non_negative_integer: ({ value }) => normalizeInteger(value, { minimum: 0 }),
  normalize_non_negative_number: ({ value }) => normalizeNumber(value, { minimum: 0 }),
  normalize_nullable_boolean_code: ({ value }) =>
    isEmpty(value) ? null : normalizeBooleanCode(value),
  normalize_optional_date: ({ value }) => normalizeDate(value, { nullable: true }),
  normalize_optional_document: ({ value }) => normalizeDigits(value),
  normalize_optional_legacy_date: ({ value }) => normalizeDate(value, { nullable: true }),
  normalize_optional_non_negative_number: ({ value }) =>
    isEmpty(value) ? null : normalizeNumber(value, { minimum: 0 }),
  normalize_optional_text: ({ value }) => normalizeText(value),
  normalize_positive_integer: ({ value }) => normalizeInteger(value, { minimum: 1 }),
  normalize_required_asset_code: ({ value }) => normalizeRequiredScalarText(normalizeText(value)),
  normalize_required_date: ({ value }) => required(normalizeDate(value), "DATE_REQUIRED"),
  normalize_required_document: ({ value }) => required(normalizeDigits(value), "DOCUMENT_REQUIRED"),
  normalize_required_name: ({ value }) => normalizeRequiredScalarText(normalizeText(value)),
  normalize_required_stock_name: ({ value }) => normalizeRequiredScalarText(normalizeText(value)),
  normalize_required_text: ({ value }) => normalizeRequiredScalarText(normalizeText(value)),
  normalize_stock_status: ({ value }) => normalizeStockStatus(value),
  normalize_year_month: ({ value }) => normalizeYearMonth(value),
  normalize_zero_date_to_null: ({ value }) => normalizeDate(value, { nullable: true }),
  preserve_private_certificate_password: ({ value, runtimeState, metadata }) =>
    encryptSecret(value, runtimeState, metadata, "CERTIFICATE_ENCRYPTION_UNAVAILABLE"),
  resolve_client_by_externo: ({ value, runtimeState, row }) =>
    resolveId(
      runtimeState.resolveClient(value, Number(row?.externo) === 1 ? "external" : "integration"),
    ),
  resolve_client_reference: ({ value, runtimeState }) =>
    resolveId(runtimeState.resolveClient(value, "regularize")),
  resolve_collaborator_user_reference: ({ value, runtimeState }) =>
    resolveId(runtimeState.resolveReference("collaboratorUser", value)),
  resolve_derived_category: ({ value }) => generatedId("stock.categories:organization-name", value),
  resolve_derived_location: ({ value }) => generatedId("stock.locations:organization-name", value),
  resolve_installment_reference: ({ value, runtimeState }) =>
    resolveId(runtimeState.resolveReference("installment", value)),
  resolve_inventory_category_by_name: ({ value, runtimeState }) =>
    resolveId(runtimeState.resolveReference("inventoryCategory", value)),
  resolve_inventory_location_reference: ({ value, runtimeState }) =>
    resolveId(runtimeState.resolveReference("inventoryLocation", value)),
  resolve_optional_department_reference: ({ value, runtimeState }) =>
    optionalResolvedId(runtimeState.resolveReference("department", value)),
  resolve_optional_user_reference: ({ value, runtimeState }) =>
    optionalResolvedId(runtimeState.resolveReference("user", value)),
  resolve_stock_location_floor: ({ value, runtimeState }) =>
    runtimeState.resolveReference("stockLocation", value).value?.floor ?? null,
  resolve_stock_location_name: ({ value, runtimeState }) =>
    runtimeState.resolveReference("stockLocation", value).value?.name ?? null,
  resolve_stock_reference: ({ value, runtimeState }) =>
    resolveId(runtimeState.resolveReference("stock", value)),
  resolve_storage_uploader_user: ({ runtimeState, metadata }) =>
    certificateAsset(metadata, runtimeState).then((asset) => asset.uploadedByUserId),
  resolve_technology_department: ({ runtimeState }) =>
    resolveId(runtimeState.resolveReference("technologyDepartment", CASTELO_ORGANIZATION_ID)),
  resolve_user_reference: ({ value, runtimeState }) =>
    resolveId(runtimeState.resolveReference("user", value)),
  store_encrypted_certificate_object_path: ({ runtimeState, metadata }) =>
    certificateAsset(metadata, runtimeState).then((asset) => asset.path),
  uuid_v5_from_full_source_table_and_legacy_id: ({ value, sourceTable }) =>
    generatedId(sourceTable, value),
  uuid_v5_from_organization_and_normalized_name: ({ value }) =>
    generatedId("organization-normalized-name", value),
  uuid_v5_from_organization_and_resolved_normalized_location_name: ({ value, runtimeState }) =>
    generatedId(
      "organization-resolved-location-name",
      runtimeState.resolveReference("stockLocation", value).value?.name,
    ),
});

export function buildSpecializedRuntimeState(options = {}) {
  if (!isPlainObject(options)) throw new TypeError("buildSpecializedRuntimeState exige opções");
  if (options.organizationId !== CASTELO_ORGANIZATION_ID) {
    throw runtimeError("SPECIALIZED_TENANT_INVALID");
  }

  const resolvers = Object.freeze({
    department: createCasteloReferenceResolver(options.departmentCandidates),
    inventoryCategory: createCasteloReferenceResolver(options.inventoryCategoryCandidates),
    inventoryLocation: createCasteloReferenceResolver(options.inventoryLocationCandidates),
    installment: createCasteloReferenceResolver(options.installmentCandidates),
    stock: createCasteloReferenceResolver(options.stockCandidates),
    stockLocation: createCasteloReferenceResolver(options.stockLocationCandidates),
    technologyDepartment: createCasteloReferenceResolver(options.technologyDepartmentCandidates),
    user: createCasteloReferenceResolver(options.userCandidates),
    collaboratorUser: createCasteloReferenceResolver(options.collaboratorUserCandidates),
  });
  const sourceRows = normalizeSourceRows(options.sourceRows);
  const explicitResolver =
    typeof options.resolveReference === "function" ? options.resolveReference : null;
  const uniqueResolver = typeof options.resolveUnique === "function" ? options.resolveUnique : null;
  const clientResolver = createCasteloClientResolver(options.clientCandidates);

  return Object.freeze({
    organizationId: CASTELO_ORGANIZATION_ID,
    encrypt: options.encrypt,
    storeCertificate: options.storeCertificate,
    resolveClient: clientResolver,
    resolveUnique(kind, value) {
      if (uniqueResolver === null) return EMPTY_RESOLUTION;
      try {
        return normalizeResolution(uniqueResolver(kind, value));
      } catch {
        throw runtimeError("SPECIALIZED_UNIQUE_RESOLUTION_FAILED");
      }
    },
    resolveReference(kind, value) {
      if (explicitResolver !== null) {
        try {
          return normalizeResolution(explicitResolver(kind, value));
        } catch {
          throw runtimeError("SPECIALIZED_REFERENCE_RESOLUTION_FAILED");
        }
      }
      const resolver = resolvers[kind];
      return resolver === undefined ? EMPTY_RESOLUTION : resolver(value);
    },
    deduplication(sourceTable, row, fields) {
      const rows = sourceRows.get(sourceTable);
      if (rows === undefined) return "not_executed";
      const identity = sourceRowIdentity(row);
      const normalized = fields.map((field) => normalizeKey(row?.[field])).join("\0");
      const matches = rows.filter(
        (candidate) =>
          fields.map((field) => normalizeKey(candidate?.[field])).join("\0") === normalized,
      );
      if (matches.length === 0) return "not_executed";
      const owner = [...matches].sort(compareSourceRows)[0];
      return sourceRowIdentity(owner) === identity ? "owner" : "duplicate";
    },
  });
}

export function createCasteloClientResolver(candidates) {
  const resolver = createCasteloReferenceResolver(candidates);
  return (value, catalog = "integration") => {
    if (isEmpty(value)) return { state: "zero", id: null, value: null };
    const resolution = resolver(value, catalog);
    if (resolution.state !== "zero") return resolution;
    return resolverByFields(candidates, value, ["cpf_cnpj", "cpfCnpj", "name", "nome"], catalog);
  };
}

export const SPECIALIZED_EXECUTION_ENTRIES = Object.freeze(
  SPECIALIZED_RULES.flatMap((rule) => {
    const runtimeRule = runtimeRuleFor(rule);
    return rule.destinations.map((step) =>
      createRuntimeEntry({
        rule: runtimeRule,
        step,
        organizationId: CASTELO_ORGANIZATION_ID,
        contextRequirements: [],
        projector: projectSpecializedEmission,
        cleanup: cleanupForStep(step),
      }),
    );
  }),
);

function runtimeRuleFor(rule) {
  return {
    ...rule,
    classifySourceRow(row, runtimeState) {
      return rule.classifySourceRow(row, contextFor(rule.sourceTable, row, runtimeState));
    },
    emitRows(row, runtimeState) {
      return rule.emitRows(row, contextFor(rule.sourceTable, row, runtimeState));
    },
  };
}

function contextFor(sourceTable, row, runtimeState) {
  const reference = (kind, value) =>
    runtimeState?.resolveReference?.(kind, value) ?? EMPTY_RESOLUTION;
  const stateOf = (kind, value) => reference(kind, value).state;
  if (sourceTable.startsWith("tb_tecnologia.")) {
    if (sourceTable === "tb_tecnologia.estoque") {
      const stockLocation = reference("stockLocation", row?.localizacao);
      return {
        categoryDeduplication: runtimeState?.deduplication(sourceTable, row, ["categoria"]),
        locationDeduplication: runtimeState?.deduplication(sourceTable, row, ["localizacao"]),
        stockLocationName: stockLocation.value?.name ?? null,
        stockLocationResolution: stockLocation.state,
        technologyDepartmentResolution: stateOf("technologyDepartment", CASTELO_ORGANIZATION_ID),
      };
    }
    if (sourceTable === "tb_tecnologia.estoque_entradas") {
      return {
        stockResolution: stateOf("stock", row?.produto_id),
        userResolution: stateOf("user", row?.repositor),
      };
    }
    if (sourceTable === "tb_tecnologia.estoque_saidas") {
      return {
        approverResolution: stateOf("user", row?.autorizador),
        operatorResolution: stateOf("user", row?.operador),
        requesterResolution: stateOf("collaboratorUser", row?.solicitante),
        stockResolution: stateOf("stock", row?.produto_id),
      };
    }
    if (sourceTable === "tb_tecnologia.inventario") {
      return {
        assetCodeResolution: runtimeState?.deduplication(sourceTable, row, ["cod"]),
        categoryResolution: stateOf("inventoryCategory", row?.tipo),
        staffResolution: stateOf("user", row?.ti_responsavel),
        userResolution: stateOf("user", row?.usuario_id),
      };
    }
    if (sourceTable === "tb_tecnologia.inventario_itens") {
      return {
        assetCodeResolution: runtimeState?.deduplication(sourceTable, row, ["cod"]),
        categoryResolution: stateOf("inventoryCategory", row?.tipo),
        locationResolution: stateOf("inventoryLocation", row?.local_id),
        staffResolution: stateOf("user", row?.id_responsavel),
      };
    }
    if (sourceTable === "tb_tecnologia.inventario_loc") {
      return {
        locationDeduplication: runtimeState?.deduplication(sourceTable, row, ["nome"]),
      };
    }
    if (sourceTable === "tb_tecnologia.opcoes") {
      return {
        categoryDeduplication: runtimeState?.deduplication(sourceTable, row, ["categoria"]),
      };
    }
    if (sourceTable === "tb_tecnologia.senhas") {
      return {
        credentialEncryptionVerified: typeof runtimeState?.encrypt === "function",
        userResolution: stateOf("user", row?.id_usuario),
      };
    }
    if (sourceTable === "tb_tecnologia.termos") {
      return {
        departmentResolution: stateOf("department", row?.departamento),
        userResolution: stateOf("user", row?.user_id),
      };
    }
    return {};
  }
  if (sourceTable.startsWith("tb_certificados.")) {
    return {
      certificateFileMetadataComplete: typeof runtimeState?.storeCertificate === "function",
      certificateFileResolution:
        typeof runtimeState?.storeCertificate === "function" ? "one" : "not_executed",
      certificateIdentityResolution: runtimeState?.deduplication(sourceTable, row, [
        "nome",
        "cpf",
        "cnpj",
        "modelo",
      ]),
      certificateStorageEncryptionVerified:
        typeof runtimeState?.storeCertificate === "function" &&
        typeof runtimeState?.encrypt === "function",
    };
  }
  if (sourceTable === "tb_parcelamento.clientes") {
    return {
      clientLookupResolution: runtimeState?.resolveClient?.(row?.cpf_cnpj).state ?? "not_executed",
    };
  }
  if (sourceTable === "tb_parcelamento.parcelamentos") {
    return {
      agreementIdentityResolution: runtimeState?.resolveUnique?.("installment", {
        legacyId: row?.id,
      }).state,
      externalClientResolution:
        runtimeState?.resolveClient?.(row?.cliente_id, "external").state ?? "not_executed",
      integrationClientResolution:
        runtimeState?.resolveClient?.(row?.cliente_id, "integration").state ?? "not_executed",
    };
  }
  if (sourceTable === "tb_parcelamento.competencia") {
    const installment = reference("installment", row?.id_parcelamento);
    return {
      competenceIdentityResolution: runtimeState?.resolveUnique?.("competence", {
        competence: row?.data,
        installmentId: installment.id,
      }).state,
      installmentResolution: installment.state,
    };
  }
  const panoramaClient = runtimeState?.resolveClient?.(row?.cliente_id, "regularize");
  return {
    clientResolution: panoramaClient?.state ?? "not_executed",
    panoramaIdentityResolution: runtimeState?.resolveUnique?.("panorama", {
      clientId: panoramaClient?.id,
      competence: row?.comp,
    }).state,
    responsibleResolution: stateOf("user", row?.responsavel_id),
  };
}

async function projectSpecializedEmission(emission, row, runtimeState) {
  const definition = STEPS_BY_ID.get(emission?.stepId);
  if (definition === undefined || emission?.destinationTable !== definition.step.destinationTable) {
    throw runtimeError("SPECIALIZED_PROJECTION_STEP_UNKNOWN");
  }
  if (emission.status !== "prepared") throw runtimeError("SPECIALIZED_PROJECTION_NOT_PREPARED");
  if (!isPlainObject(row)) throw runtimeError("SPECIALIZED_PROJECTION_ROW_INVALID");

  const { rule, step } = definition;
  const payload = { ...step.defaults, ...step.constants };
  const metadata = { assetPromise: null, row, rule, step };
  for (const column of step.columns) {
    if (column.status !== "mapped") continue;
    const transformer = SPECIALIZED_TRANSFORMERS[column.transformation];
    if (typeof transformer !== "function") throw runtimeError("SPECIALIZED_TRANSFORMER_MISSING");
    const value = row[column.sourceColumn];
    const transformed = await transformer({
      value,
      row,
      runtimeState,
      sourceTable: rule.sourceTable,
      column,
      metadata,
      payload,
    });
    if (transformed !== undefined) payload[column.destinationColumn] = transformed;
  }
  return Object.freeze(payload);
}

function cleanupForStep(step) {
  if (step.mode === "lookup") return { kind: "none" };
  return {
    kind: "delete_by_identity",
    identityColumns: ["id"],
    ownedColumns: [],
    resetValues: {},
  };
}

function certificateField(field) {
  return ({ runtimeState, metadata }) =>
    certificateAsset(metadata, runtimeState).then((asset) => asset[field]);
}

async function certificateAsset(metadata, runtimeState) {
  if (metadata.assetPromise === null) {
    if (isEmpty(metadata.row?.arquivo)) {
      metadata.assetPromise = Promise.resolve(EMPTY_CERTIFICATE_ASSET);
      return metadata.assetPromise;
    }
    if (typeof runtimeState?.storeCertificate !== "function") {
      throw runtimeError("CERTIFICATE_STORAGE_UNAVAILABLE");
    }
    metadata.assetPromise = Promise.resolve()
      .then(() => runtimeState.storeCertificate(metadata.row?.arquivo, publicMetadata(metadata)))
      .then(normalizeCertificateAsset)
      .catch(() => {
        throw runtimeError("CERTIFICATE_STORAGE_FAILED");
      });
  }
  return metadata.assetPromise;
}

function normalizeCertificateAsset(value) {
  if (!isPlainObject(value)) throw runtimeError("CERTIFICATE_STORAGE_METADATA_INVALID");
  const asset = {
    encryptionIv: requiredText(value.encryptionIv ?? value.file_encryption_iv),
    encryptionKeyVersion: requiredText(
      value.encryptionKeyVersion ?? value.file_encryption_key_version,
    ),
    encryptionTag: requiredText(value.encryptionTag ?? value.file_encryption_tag),
    mimeType: requiredText(value.mimeType ?? value.file_mime_type),
    originalName: requiredText(value.originalName ?? value.file_original_name),
    path: requiredText(value.path ?? value.file_path),
    sha256: requiredText(value.sha256 ?? value.file_sha256),
    sizeBytes: normalizeInteger(value.sizeBytes ?? value.file_size_bytes, { minimum: 0 }),
    storageBucket: requiredText(value.storageBucket ?? value.file_storage_bucket),
    storageProvider: requiredText(value.storageProvider ?? value.file_storage_provider),
    uploadedAt: required(
      normalizeDate(value.uploadedAt ?? value.file_uploaded_at),
      "CERTIFICATE_UPLOAD_DATE_INVALID",
    ),
    uploadedByUserId: requiredText(value.uploadedByUserId ?? value.file_uploaded_by_user_id),
  };
  return Object.freeze(asset);
}

async function encryptSecret(value, runtimeState, metadata, unavailableCode) {
  if (typeof runtimeState?.encrypt !== "function") throw runtimeError(unavailableCode);
  const plaintext = normalizeRequiredScalarText(value);
  let encrypted;
  try {
    encrypted = await runtimeState.encrypt(plaintext, publicMetadata(metadata));
  } catch {
    throw runtimeError("SECRET_ENCRYPTION_FAILED");
  }
  if (typeof encrypted !== "string" || encrypted.length === 0 || encrypted === plaintext) {
    throw runtimeError("SECRET_ENCRYPTION_RESULT_INVALID");
  }
  return encrypted;
}

function publicMetadata({ column, rule, step }) {
  return Object.freeze({
    destinationColumn: column?.destinationColumn ?? null,
    destinationTable: step?.destinationTable,
    sourceTable: rule?.sourceTable,
    stepId: step?.stepId,
  });
}

function createCasteloReferenceResolver(candidates) {
  const rows = normalizeCandidates(candidates);
  return (value, catalog) =>
    resolverByFields(rows, value, ["legacyId", "legacy_id", "id"], catalog);
}

function resolverByFields(candidates, value, fields, catalog) {
  const normalized = normalizeKey(value);
  if (normalized === null) return Object.freeze({ state: "zero", id: null, value: null });
  const matches = normalizeCandidates(candidates).filter(
    (candidate) =>
      isCasteloCandidate(candidate) &&
      (candidate.catalog === undefined || candidate.catalog === catalog) &&
      fields.some((field) => normalizeKey(candidate[field]) === normalized),
  );
  const unique = [
    ...new Map(matches.map((candidate) => [String(candidate.id), candidate])).values(),
  ];
  return Object.freeze({
    state: unique.length === 0 ? "zero" : unique.length === 1 ? "one" : "many",
    id: unique.length === 1 ? String(unique[0].id) : null,
    value: unique.length === 1 ? Object.freeze({ ...unique[0] }) : null,
  });
}

function normalizeResolution(value) {
  if (!isPlainObject(value)) return EMPTY_RESOLUTION;
  const state = value.state ?? value.resolution;
  if (!["zero", "one", "many", "not_executed"].includes(state)) return EMPTY_RESOLUTION;
  return Object.freeze({
    state,
    id: state === "one" && !isEmpty(value.id) ? String(value.id) : null,
    value: state === "one" && isPlainObject(value.value) ? Object.freeze({ ...value.value }) : null,
  });
}

function normalizeCandidates(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((candidate) => !isPlainObject(candidate))) {
    throw new TypeError("candidates deve ser um array de objetos");
  }
  return value;
}

function normalizeSourceRows(value) {
  if (value === undefined) return new Map();
  const entries = value instanceof Map ? [...value] : Object.entries(value);
  if (!Array.isArray(entries)) throw new TypeError("sourceRows deve ser Map ou objeto");
  return new Map(
    entries.map(([sourceTable, rows]) => {
      if (!Array.isArray(rows) || rows.some((row) => !isPlainObject(row))) {
        throw new TypeError("sourceRows deve conter arrays de objetos");
      }
      return [sourceTable, [...rows]];
    }),
  );
}

function isCasteloCandidate(candidate) {
  const organizationId = candidate.organization_id ?? candidate.organizationId;
  return organizationId === CASTELO_ORGANIZATION_ID;
}

function resolveId(resolution) {
  if (resolution?.state !== "one" || isEmpty(resolution.id)) {
    throw runtimeError("SPECIALIZED_REFERENCE_NOT_RESOLVED");
  }
  return String(resolution.id);
}

function optionalResolvedId(resolution) {
  if (resolution?.state === "zero") return null;
  return resolveId(resolution);
}

function generatedId(scope, value) {
  const normalized = normalizeText(value);
  if (normalized === null) throw runtimeError("SPECIALIZED_IDENTITY_VALUE_INVALID");
  return uuidV5(REQUIRED_IDENTITY_NAMESPACE, `${scope}:${CASTELO_ORGANIZATION_ID}:${normalized}`);
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).normalize("NFKC").trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeKey(value) {
  return normalizeText(value)?.toLocaleLowerCase("pt-BR") ?? null;
}

function normalizeDigits(value) {
  const text = normalizeText(value);
  if (text === null) return null;
  const digits = text.replaceAll(/\D/g, "");
  return digits.length === 0 ? null : digits;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  return normalizeBooleanCode(value);
}

function normalizeStockStatus(value) {
  const normalized = normalizeKey(value);
  if (normalized === "ativo") return true;
  if (normalized === "inativo") return false;
  return normalizeBoolean(value);
}

function normalizeBooleanCode(value) {
  if ([1, "1", true].includes(value)) return true;
  if ([0, "0", false, null, undefined, ""].includes(value)) return false;
  throw runtimeError("BOOLEAN_CODE_INVALID");
}

function normalizeInteger(value, { minimum }) {
  const text = normalizeText(value);
  if (text === null || !/^-?\d+$/.test(text)) throw runtimeError("INTEGER_INVALID");
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw runtimeError("INTEGER_INVALID");
  return parsed;
}

function normalizeNumber(value, { minimum }) {
  const text = normalizeText(value);
  if (text === null) throw runtimeError("NUMBER_INVALID");
  const parsed = Number(text.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < minimum) throw runtimeError("NUMBER_INVALID");
  return parsed;
}

function normalizeDate(value, { nullable = false } = {}) {
  const text = normalizeText(value);
  if (text === null || text.startsWith("0000-00-00")) return nullable ? null : null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match === null) throw runtimeError("DATE_INVALID");
  const date = new Date(0);
  date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setUTCHours(Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0), 0);
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw runtimeError("DATE_INVALID");
  }
  return date.toISOString();
}

function normalizeYearMonth(value) {
  const text = normalizeText(value);
  if (text === null || !/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) {
    throw runtimeError("YEAR_MONTH_INVALID");
  }
  return text;
}

function mapEnum(value, values) {
  const mapped = values.get(String(value));
  if (mapped === undefined) throw runtimeError("ENUM_VALUE_INVALID");
  return mapped;
}

function required(value, code) {
  if (value === null || value === undefined || value === "") throw runtimeError(code);
  return value;
}

function requiredText(value) {
  return required(normalizeText(value), "CERTIFICATE_STORAGE_METADATA_INVALID");
}

function isEmpty(value) {
  return normalizeText(value) === null;
}

function sourceRowIdentity(row) {
  const hash = createHash("sha256");
  for (const key of Object.keys(row ?? {}).sort()) {
    const value = row[key];
    hash.update(`${key}:${value === null || value === undefined ? "" : String(value)}\0`);
  }
  return hash.digest("hex");
}

function compareSourceRows(left, right) {
  return sourceRowIdentity(left).localeCompare(sourceRowIdentity(right), "en-US");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runtimeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

const INSTALLMENT_STATUSES = new Map([
  ["0", "Ativo"],
  ["1", "Concluido"],
  ["2", "Paralisado"],
]);
const SHUTDOWN_REASONS = new Map([
  ["0", "Nenhuma"],
  ["1", "Quitado"],
  ["2", "Cancelado"],
  ["3", "Inadimplente"],
  ["4", "Transferido"],
  ["5", "Outro"],
]);
const SUBMISSION_TYPES = new Map([
  ["0", "Manual"],
  ["1", "Portal"],
  ["2", "Email"],
  ["3", "Integracao"],
]);

void SPECIALIZED_SOURCE_TABLES;
