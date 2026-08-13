import { CERTIFICATE_EVIDENCE } from "../evidence/technology-certificates-parcelamento.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(CERTIFICATE_EVIDENCE.map((item) => [item.sourceTable, item]));
const FILE_DESTINATION_COLUMNS = [
  "file_path",
  "file_original_name",
  "file_mime_type",
  "file_size_bytes",
  "file_sha256",
  "file_uploaded_at",
  "file_uploaded_by_user_id",
  "file_storage_provider",
  "file_storage_bucket",
  "file_encryption_iv",
  "file_encryption_tag",
  "file_encryption_key_version",
];

export const CERTIFICATE_RULES = [
  createCertificateRule({ kind: "pf", sourceTable: "tb_certificados.pf" }),
  createCertificateRule({ kind: "pj", sourceTable: "tb_certificados.pj" }),
];

export const CERTIFICATE_RUNTIME_SOURCE_TABLES = Object.freeze(
  CERTIFICATE_RULES.map(({ sourceTable }) => sourceTable),
);

function createCertificateRule({ kind, sourceTable }) {
  const evidenceDecision = requireConfirmedEvidence(sourceTable);
  const isPf = kind === "pf";
  const stepId = `certificate-${kind}-insert`;
  const destinationTable = `certificate.${kind}`;
  const documentColumn = isPf ? "cpf" : "cnpj";
  const columns = [
    mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
    mapped("cliente", "client_castelo_status", "normalize_boolean"),
    mapped("nome", "name", "normalize_required_text", personalOptions()),
    mapped(documentColumn, documentColumn, "normalize_document", personalOptions()),
    ...(isPf
      ? []
      : [mapped("responsavel", "responsible", "normalize_required_text", personalOptions())]),
    mapped("modelo", "model", "normalize_required_text"),
    ...(isPf ? [] : [mapped("nj", "legal_nature", "normalize_required_text")]),
    mapped("senha", "password", "preserve_private_certificate_password", secretOptions()),
    mapped("validade", "expiration_date", "normalize_required_date"),
    mapped("obs", "notes", "normalize_optional_text", personalOptions()),
    ...(isPf
      ? [
          mapped("empresa", "enterprise", "normalize_optional_text", personalOptions()),
          mapped("cnpj", "cnpj", "normalize_optional_document", personalOptions()),
        ]
      : []),
    mapped("pagamento", "was_paid", "normalize_boolean"),
    mapped("data_pagamento", "payment_date", "normalize_optional_date"),
    mapped("valor_pagamento", "payment_amount", "normalize_optional_non_negative_number"),
    notPreserved(
      "status",
      "O contrato atual não possui status ativo/inativo; somente linhas ativas podem ser emitidas sem alterar semântica.",
    ),
    mapped("contato", "contact_info", "normalize_optional_text", personalOptions()),
    ...FILE_DESTINATION_COLUMNS.map((destinationColumn) =>
      mapped("arquivo", destinationColumn, fileTransformation(destinationColumn), secretOptions()),
    ),
    mapped("possui", "has_certificate", "derive_from_verified_encrypted_file"),
  ];

  return {
    sourceTable,
    status: "confirmed",
    domain: "certificates",
    ruleOrigin: evidenceDecision.ruleId,
    evidence: evidenceForRule(evidenceDecision),
    cardinality: "1:1",
    dependencies: [],
    destinations: [
      {
        stepId,
        destinationTable,
        mode: "insert",
        identity: generateIdentity("id", sourceTable),
        columns,
        constants: {
          organization_id: ORGANIZATION_ID,
          client_focus_status: false,
        },
        defaults: {},
        precedence: [
          "legacy_identity",
          `unique_organization_name_${documentColumn}_model`,
          "verified_encrypted_file_metadata",
        ],
        dependencies: [],
      },
    ],
    classifySourceRow(row, context) {
      return classifyCertificate(row, context, { documentColumn, isPf });
    },
    emitRows(row, context) {
      const classification = classifyCertificate(row, context, { documentColumn, isPf });
      return [
        emission({
          stepId,
          destinationTable,
          identityRef: rowIdentity(sourceTable, row?.id),
          classification,
        }),
      ];
    },
  };
}

function classifyCertificate(row, context, { documentColumn, isPf }) {
  const requiredFields = ["nome", documentColumn, "modelo", "senha"];
  if (!isPf) requiredFields.push("responsavel", "nj");
  const base = firstQuarantine([
    classifyIdentity(row),
    ...requiredFields.map((field) =>
      field === documentColumn && !hasDocumentValue(row?.[field])
        ? quarantine(field, `CERTIFICATE_${field.toLocaleUpperCase()}_REQUIRED`)
        : prepared(),
    ),
    isValidRequiredDate(row?.validade)
      ? prepared()
      : quarantine("validade", "CERTIFICATE_EXPIRATION_DATE_INVALID"),
    isValidOptionalDate(row?.data_pagamento)
      ? prepared()
      : quarantine("data_pagamento", "CERTIFICATE_PAYMENT_DATE_INVALID"),
    isNonNegativeOptionalNumber(row?.valor_pagamento)
      ? prepared()
      : quarantine("valor_pagamento", "CERTIFICATE_PAYMENT_AMOUNT_INVALID"),
    classifyBooleanCode(row?.cliente, "cliente", "CERTIFICATE_CLIENT_STATUS_UNMAPPED"),
    classifyBooleanCode(row?.pagamento, "pagamento", "CERTIFICATE_PAYMENT_STATUS_UNMAPPED"),
    classifyBooleanCode(row?.possui, "possui", "CERTIFICATE_FILE_STATUS_UNMAPPED"),
  ]);
  if (base.status === "quarantine") return base;

  if (Number(row?.status) !== 1) {
    return quarantine("status", "CERTIFICATE_INACTIVE_STATUS_UNSUPPORTED");
  }
  if (context?.certificateIdentityResolution === "duplicate") {
    return quarantine("id", "CERTIFICATE_IDENTITY_DUPLICATE");
  }
  if (context?.certificateIdentityResolution !== "owner") {
    return quarantine("id", "CERTIFICATE_IDENTITY_DEDUP_NOT_EXECUTED");
  }

  const hasFileReference = hasValue(row?.arquivo);
  const claimsCertificate = Number(row?.possui) === 1;
  if (hasFileReference && !claimsCertificate) {
    return quarantine("possui", "CERTIFICATE_FILE_STATUS_INCONSISTENT");
  }
  if (!hasFileReference) return prepared();

  if (!isSupportedCertificateFileName(row.arquivo)) {
    return quarantine("arquivo", "CERTIFICATE_FILE_TYPE_UNSUPPORTED");
  }
  if (context?.certificateFileResolution === "zero") {
    return quarantine("arquivo", "CERTIFICATE_FILE_NOT_FOUND");
  }
  if (context?.certificateFileResolution === "many") {
    return quarantine("arquivo", "CERTIFICATE_FILE_AMBIGUOUS");
  }
  if (context?.certificateFileResolution !== "one") {
    return quarantine("arquivo", "CERTIFICATE_FILE_LOOKUP_NOT_EXECUTED");
  }
  if (context?.certificateStorageEncryptionVerified !== true) {
    return quarantine("arquivo", "CERTIFICATE_FILE_REQUIRES_ENCRYPTED_STORAGE");
  }
  if (context?.certificateFileMetadataComplete !== true) {
    return quarantine("arquivo", "CERTIFICATE_FILE_METADATA_INCOMPLETE");
  }
  return prepared();
}

function fileTransformation(destinationColumn) {
  const transformations = {
    file_path: "store_encrypted_certificate_object_path",
    file_original_name: "derive_verified_original_name",
    file_mime_type: "derive_validated_certificate_mime_type",
    file_size_bytes: "derive_verified_plaintext_size",
    file_sha256: "derive_plaintext_sha256_before_encryption",
    file_uploaded_at: "derive_storage_upload_timestamp",
    file_uploaded_by_user_id: "resolve_storage_uploader_user",
    file_storage_provider: "derive_configured_storage_provider",
    file_storage_bucket: "derive_configured_storage_bucket",
    file_encryption_iv: "derive_aes_gcm_iv",
    file_encryption_tag: "derive_aes_gcm_authentication_tag",
    file_encryption_key_version: "derive_configured_encryption_key_version",
  };
  return transformations[destinationColumn];
}

function isSupportedCertificateFileName(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("en-US");
  return normalized.endsWith(".pfx") || normalized.endsWith(".p12");
}

function isValidRequiredDate(value) {
  if (!hasValue(value)) return false;
  const text = String(value).trim();
  if (text.startsWith("0000-00-00") || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function isValidOptionalDate(value) {
  if (!hasValue(value) || String(value).trim().startsWith("0000-00-00")) return true;
  return isValidRequiredDate(value);
}

function isNonNegativeOptionalNumber(value) {
  if (!hasValue(value)) return true;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function classifyBooleanCode(value, field, reasonCode) {
  return [0, 1].includes(Number(value)) ? prepared() : quarantine(field, reasonCode);
}

function classifyIdentity(row) {
  return isLegacyIdentity(row?.id)
    ? prepared()
    : quarantine("id", "CERTIFICATE_LEGACY_IDENTITY_INVALID");
}

function firstQuarantine(classifications) {
  return classifications.find(({ status }) => status === "quarantine") ?? prepared();
}

function prepared() {
  return { status: "prepared" };
}

function quarantine(field, reasonCode) {
  return { status: "quarantine", field, reasonCode };
}

function emission({ stepId, destinationTable, identityRef, classification }) {
  return {
    stepId,
    destinationTable,
    status: classification.status,
    identityRef,
    field: classification.status === "prepared" ? null : classification.field,
    reasonCode: classification.status === "prepared" ? null : classification.reasonCode,
  };
}

function generateIdentity(legacyColumn, scope) {
  return {
    kind: "generate",
    legacyColumn,
    scope,
    namespace: REQUIRED_IDENTITY_NAMESPACE,
  };
}

function rowIdentity(sourceTable, legacyId) {
  return isLegacyIdentity(legacyId) ? `${sourceTable}:${legacyId}` : `${sourceTable}:invalid-id`;
}

function isLegacyIdentity(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0;
  return typeof value === "string" && /^[1-9]\d*$/.test(value.trim());
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function hasDocumentValue(value) {
  return String(value ?? "").replace(/\D/g, "").length > 0;
}

function mapped(sourceColumn, destinationColumn, transformation, options = {}) {
  return {
    sourceColumn,
    destinationColumn,
    status: "mapped",
    transformation,
    nullHandling: options.nullHandling ?? "normalize_empty_to_null_or_quarantine_when_required",
    referenceRole: options.referenceRole ?? "none",
    sensitivity: options.sensitivity ?? "none",
    reason:
      options.reason ??
      `A coluna legada ${sourceColumn} alimenta ${destinationColumn} pelo contrato privado validado.`,
  };
}

function notPreserved(sourceColumn, reason, options = {}) {
  return {
    sourceColumn,
    destinationColumn: null,
    status: "not_preserved",
    transformation: options.transformation ?? "not_preserved",
    nullHandling: "not_applicable",
    referenceRole: "none",
    sensitivity: options.sensitivity ?? "none",
    reason,
  };
}

function secretOptions() {
  return {
    sensitivity: "secret",
    nullHandling: "private_channel_or_quarantine",
    reason:
      "O valor secreto nunca integra evidência, relatório ou quarentena e só segue pelo canal privado comprovado.",
  };
}

function personalOptions() {
  return { sensitivity: "personal" };
}

function evidenceForRule(decision) {
  return { legacy: [...decision.legacyReferences], current: [...decision.currentContractEvidence] };
}

function requireConfirmedEvidence(sourceTable) {
  const decision = EVIDENCE_BY_SOURCE.get(sourceTable);
  if (decision?.finalStatus !== "confirmed" || decision.ruleId === null) {
    throw new Error(`EvidenceDecision confirmed ausente para ${sourceTable}.`);
  }
  return decision;
}
