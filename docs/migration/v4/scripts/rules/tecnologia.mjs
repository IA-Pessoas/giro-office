import { createHash } from "node:crypto";

import { TECHNOLOGY_EVIDENCE } from "../evidence/technology-certificates-parcelamento.mjs";
import { REQUIRED_IDENTITY_NAMESPACE } from "../lib/mapping-contract.mjs";

const ORGANIZATION_ID = "e8048d1c-0830-45d7-84de-68e20abd685b";
const EVIDENCE_BY_SOURCE = new Map(TECHNOLOGY_EVIDENCE.map((item) => [item.sourceTable, item]));

export const TECHNOLOGY_RULES = [
  createStockRule(),
  createSingleRule({
    sourceTable: "tb_tecnologia.estoque_entradas",
    domain: "technology-stock",
    stepId: "technology-stock-entry-insert",
    destinationTable: "stock.entries",
    dependencies: ["tb_tecnologia.estoque", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("produto_id", "stock_id", "resolve_stock_reference", referenceOptions()),
      mapped("quantidade", "quantity", "normalize_positive_integer"),
      mapped("data_entrada", "entry_date", "normalize_required_date"),
      mapped("repositor", "entry_by_user_id", "resolve_user_reference", referenceOptions()),
      notPreserved(
        "estoque",
        "O saldo posterior é derivado dos movimentos e do item atual; copiá-lo criaria uma segunda fonte de verdade.",
      ),
    ],
    classify(row, context) {
      return firstQuarantine([
        classifyIdentity(row),
        classifyPositiveInteger(row, "quantidade", "STOCK_ENTRY_QUANTITY_INVALID"),
        classifyDate(row, "data_entrada", "STOCK_ENTRY_DATE_INVALID"),
        classifyRequiredReference(row, context, "produto_id", "stockResolution", "STOCK"),
        classifyRequiredReference(row, context, "repositor", "userResolution", "ENTRY_USER"),
      ]);
    },
  }),
  createSingleRule({
    sourceTable: "tb_tecnologia.estoque_saidas",
    domain: "technology-stock",
    stepId: "technology-stock-exit-insert",
    destinationTable: "stock.exits",
    dependencies: ["tb_tecnologia.estoque", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("produto_id", "stock_id", "resolve_stock_reference", referenceOptions()),
      mapped("quantidade", "quantity", "normalize_positive_integer"),
      mapped("data_saida", "exit_date", "normalize_required_date"),
      mapped("destino", "destination", "normalize_optional_text"),
      mapped("solicitante", "requester_id", "resolve_user_reference", referenceOptions()),
      mapped("autorizador", "approver_id", "resolve_optional_user_reference", referenceOptions()),
      mapped("operador", "operator_id", "resolve_optional_user_reference", referenceOptions()),
      notPreserved(
        "estoque",
        "O saldo posterior é derivado dos movimentos e do item atual; não é uma coluna do evento de saída.",
      ),
      notPreserved(
        "obs",
        "O contrato stock.exits atual não possui observação; o texto não será deslocado para destination sem equivalência semântica.",
        { sensitivity: "personal" },
      ),
    ],
    defaults: { approver_id: null, operator_id: null, location_destination_id: null },
    classify(row, context) {
      return firstQuarantine([
        classifyIdentity(row),
        classifyPositiveInteger(row, "quantidade", "STOCK_EXIT_QUANTITY_INVALID"),
        classifyDate(row, "data_saida", "STOCK_EXIT_DATE_INVALID"),
        classifyRequiredReference(row, context, "produto_id", "stockResolution", "STOCK"),
        classifyRequiredReference(row, context, "solicitante", "requesterResolution", "REQUESTER"),
        classifyOptionalReference(row, context, "autorizador", "approverResolution", "APPROVER"),
        classifyOptionalReference(row, context, "operador", "operatorResolution", "OPERATOR"),
      ]);
    },
  }),
  createSingleRule({
    sourceTable: "tb_tecnologia.inventario",
    domain: "technology-inventory",
    stepId: "technology-inventory-assigned-insert",
    destinationTable: "tecnologia.inventory",
    dependencies: ["tb_tecnologia.opcoes", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("usuario_id", "user_id", "resolve_optional_user_reference", referenceOptions()),
      mapped("cod", "asset_code", "normalize_required_asset_code"),
      mapped("tipo", "category_id", "resolve_inventory_category_by_name", referenceOptions()),
      mapped("obs", "notes", "normalize_optional_text", personalOptions()),
      mapped("data_entrega", "delivery_date", "normalize_optional_legacy_date"),
      mapped("data_devolucao", "return_date", "normalize_optional_legacy_date"),
      mapped(
        "ti_responsavel",
        "responsible_it_staff_id",
        "resolve_optional_user_reference",
        referenceOptions(),
      ),
      notPreserved(
        "termo",
        "O indicador legado de termo não substitui a entidade tecnologia.terms nem sua identidade própria.",
      ),
      mapped("data_registro", "created_at", "normalize_required_date"),
    ],
    defaults: { location_id: null },
    classify(row, context) {
      return firstQuarantine([
        classifyIdentity(row),
        classifyRequiredText(row, "cod", "INVENTORY_ASSET_CODE_REQUIRED"),
        classifyRequiredText(row, "tipo", "INVENTORY_CATEGORY_REQUIRED"),
        classifyDate(row, "data_registro", "INVENTORY_REGISTRATION_DATE_INVALID"),
        classifyResolution(context?.categoryResolution, "tipo", "INVENTORY_CATEGORY"),
        classifyOptionalReference(row, context, "usuario_id", "userResolution", "INVENTORY_USER"),
        classifyOptionalReference(
          row,
          context,
          "ti_responsavel",
          "staffResolution",
          "INVENTORY_STAFF",
        ),
        classifyUnique(context?.assetCodeResolution, "cod", "INVENTORY_ASSET_CODE"),
      ]);
    },
  }),
  createSingleRule({
    sourceTable: "tb_tecnologia.inventario_itens",
    domain: "technology-inventory",
    stepId: "technology-inventory-location-item-insert",
    destinationTable: "tecnologia.inventory",
    dependencies: ["tb_tecnologia.inventario_loc", "tb_tecnologia.opcoes", "tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("local_id", "location_id", "resolve_inventory_location_reference", referenceOptions()),
      mapped("cod", "asset_code", "normalize_required_asset_code"),
      mapped("tipo", "category_id", "resolve_inventory_category_by_name", referenceOptions()),
      mapped("obs", "notes", "normalize_optional_text", personalOptions()),
      mapped("data_entrega", "delivery_date", "normalize_optional_legacy_date"),
      mapped(
        "id_responsavel",
        "responsible_it_staff_id",
        "resolve_optional_user_reference",
        referenceOptions(),
      ),
      mapped("data_registro", "created_at", "normalize_required_date"),
    ],
    defaults: { user_id: null, return_date: null },
    classify(row, context) {
      return firstQuarantine([
        classifyIdentity(row),
        classifyRequiredText(row, "cod", "INVENTORY_ASSET_CODE_REQUIRED"),
        classifyRequiredText(row, "tipo", "INVENTORY_CATEGORY_REQUIRED"),
        classifyDate(row, "data_registro", "INVENTORY_REGISTRATION_DATE_INVALID"),
        classifyRequiredReference(
          row,
          context,
          "local_id",
          "locationResolution",
          "INVENTORY_LOCATION",
        ),
        classifyResolution(context?.categoryResolution, "tipo", "INVENTORY_CATEGORY"),
        classifyOptionalReference(
          row,
          context,
          "id_responsavel",
          "staffResolution",
          "INVENTORY_STAFF",
        ),
        classifyUnique(context?.assetCodeResolution, "cod", "INVENTORY_ASSET_CODE"),
      ]);
    },
  }),
  createInventoryLocationRule(),
  createInventoryCategoryRule(),
  createTiPasswordRule(),
  createTiTermRule(),
];

function createStockRule() {
  const sourceTable = "tb_tecnologia.estoque";
  const evidenceDecision = requireConfirmedEvidence(sourceTable);
  const categoryStepId = "technology-stock-category-derived";
  const locationStepId = "technology-stock-location-derived";
  const itemStepId = "technology-stock-item-insert";

  return {
    sourceTable,
    status: "confirmed",
    domain: "technology-stock",
    ruleOrigin: evidenceDecision.ruleId,
    evidence: evidenceForRule(evidenceDecision),
    cardinality: "1:N",
    dependencies: ["tb_cbs.estoque_localizacoes", "tb_admin.departamentos"],
    destinations: [
      {
        stepId: categoryStepId,
        destinationTable: "stock.categories",
        mode: "derived",
        identity: generateIdentity("categoria", "stock.categories:organization-name"),
        columns: [
          mapped("categoria", "id", "uuid_v5_from_organization_and_normalized_name"),
          mapped("categoria", "name", "normalize_required_name"),
          mapped(null, "department_id", "resolve_technology_department", referenceOptions()),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: { status: true },
        precedence: ["organization_id", "normalized_name", "first_legacy_row"],
        dependencies: ["tb_admin.departamentos"],
      },
      {
        stepId: locationStepId,
        destinationTable: "stock.locations",
        mode: "derived",
        identity: generateIdentity("localizacao", "stock.locations:organization-resolved-name"),
        columns: [
          mapped(
            "localizacao",
            "id",
            "uuid_v5_from_organization_and_resolved_normalized_location_name",
          ),
          mapped("localizacao", "name", "resolve_stock_location_name"),
          mapped("localizacao", "floor", "resolve_stock_location_floor"),
          mapped(null, "department_id", "resolve_technology_department", referenceOptions()),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: { status: true },
        precedence: [
          "resolved_legacy_location",
          "organization_id",
          "normalized_name",
          "first_legacy_row",
        ],
        dependencies: ["tb_cbs.estoque_localizacoes", "tb_admin.departamentos"],
      },
      {
        stepId: itemStepId,
        destinationTable: "stock",
        mode: "insert",
        identity: generateIdentity("id", sourceTable),
        columns: [
          mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
          mapped("categoria", "category_id", "resolve_derived_category", referenceOptions()),
          mapped("localizacao", "location_id", "resolve_derived_location", referenceOptions()),
          mapped("quantidade", "quantity", "normalize_non_negative_integer"),
          mapped("categoria", "name", "normalize_required_stock_name"),
          mapped("descricao", "description", "normalize_optional_text"),
          notPreserved(
            "criado",
            "O indicador legado 0/1 separa itens automáticos dos cadastrados na tela, mas não possui coluna equivalente em stock.",
          ),
          mapped("status", "status", "normalize_stock_status"),
          mapped(null, "department_id", "resolve_technology_department", referenceOptions()),
        ],
        constants: { organization_id: ORGANIZATION_ID },
        defaults: {},
        precedence: ["legacy_identity", "derived_category", "derived_location"],
        dependencies: ["tb_cbs.estoque_localizacoes", "tb_admin.departamentos"],
      },
    ],
    classifySourceRow(row, context) {
      return classifyStockItem(row, context);
    },
    emitRows(row, context) {
      const category = classifyDerivedCatalog(
        row,
        context,
        "categoria",
        "categoryDeduplication",
        "STOCK_CATEGORY",
      );
      const location = classifyDerivedStockLocation(row, context);
      const item = classifyStockItem(row, context);
      return [
        emission({
          stepId: categoryStepId,
          destinationTable: "stock.categories",
          identityRef: naturalIdentity("stock.categories", row?.categoria),
          classification: category,
        }),
        emission({
          stepId: locationStepId,
          destinationTable: "stock.locations",
          identityRef: naturalIdentity("stock.locations", context?.stockLocationName),
          classification: location,
        }),
        emission({
          stepId: itemStepId,
          destinationTable: "stock",
          identityRef: rowIdentity(sourceTable, row?.id),
          classification: item,
        }),
      ];
    },
  };
}

function classifyDerivedCatalog(row, context, field, deduplicationKey, prefix) {
  const base = firstQuarantine([
    classifyRequiredText(row, field, `${prefix}_NAME_REQUIRED`),
    classifyResolution(context?.technologyDepartmentResolution, field, "TECHNOLOGY_DEPARTMENT"),
  ]);
  if (base.status === "quarantine") return base;
  if (context?.[deduplicationKey] === "owner") return prepared();
  if (context?.[deduplicationKey] === "duplicate") {
    return notEmitted(`${prefix}_DUPLICATE_NAME`);
  }
  return quarantine(field, `${prefix}_DEDUP_NOT_EXECUTED`);
}

function classifyDerivedStockLocation(row, context) {
  const base = firstQuarantine([
    isLegacyIdentity(row?.localizacao)
      ? prepared()
      : quarantine("localizacao", "STOCK_LOCATION_LINK_INVALID"),
    classifyResolution(context?.stockLocationResolution, "localizacao", "STOCK_LOCATION"),
    hasValue(context?.stockLocationName)
      ? prepared()
      : quarantine("localizacao", "STOCK_LOCATION_RESOLVED_NAME_REQUIRED"),
    classifyResolution(
      context?.technologyDepartmentResolution,
      "department_id",
      "TECHNOLOGY_DEPARTMENT",
    ),
  ]);
  if (base.status === "quarantine") return base;
  return classifyDeduplication(context?.locationDeduplication, "localizacao", "STOCK_LOCATION");
}

function classifyStockItem(row, context) {
  const base = firstQuarantine([
    classifyIdentity(row),
    classifyRequiredText(row, "categoria", "STOCK_CATEGORY_NAME_REQUIRED"),
    isLegacyIdentity(row?.localizacao)
      ? prepared()
      : quarantine("localizacao", "STOCK_LOCATION_LINK_INVALID"),
    classifyResolution(context?.stockLocationResolution, "localizacao", "STOCK_LOCATION"),
    hasValue(context?.stockLocationName)
      ? prepared()
      : quarantine("localizacao", "STOCK_LOCATION_RESOLVED_NAME_REQUIRED"),
    classifyNonNegativeInteger(row, "quantidade", "STOCK_QUANTITY_INVALID"),
    classifyResolution(
      context?.technologyDepartmentResolution,
      "department_id",
      "TECHNOLOGY_DEPARTMENT",
    ),
  ]);
  if (base.status === "quarantine") return base;
  for (const [field, key, prefix] of [
    ["categoria", "categoryDeduplication", "STOCK_CATEGORY"],
    ["localizacao", "locationDeduplication", "STOCK_LOCATION"],
  ]) {
    if (!["owner", "duplicate"].includes(context?.[key])) {
      return quarantine(field, `${prefix}_DEDUP_NOT_EXECUTED`);
    }
  }
  return prepared();
}

function createInventoryLocationRule() {
  const sourceTable = "tb_tecnologia.inventario_loc";
  return createSingleRule({
    sourceTable,
    domain: "technology-inventory",
    stepId: "technology-inventory-location-insert",
    destinationTable: "tecnologia.inventoryLocations",
    identity: generateIdentity("nome", "tecnologia.inventoryLocations:organization-name"),
    columns: [
      mapped("id", "id", "uuid_v5_from_organization_and_normalized_name"),
      mapped("nome", "name", "normalize_required_name"),
      notPreserved(
        "andar",
        "A localização de inventário atual não possui andar; o campo não será confundido com stock.locations.floor.",
      ),
    ],
    defaults: { active: true },
    precedence: ["organization_id", "normalized_name", "first_legacy_row"],
    classify(row, context) {
      const base = firstQuarantine([
        classifyIdentity(row),
        classifyRequiredText(row, "nome", "INVENTORY_LOCATION_NAME_REQUIRED"),
      ]);
      if (base.status === "quarantine") return base;
      return classifyDeduplication(context?.locationDeduplication, "nome", "INVENTORY_LOCATION");
    },
    identityRef(row) {
      return naturalIdentity("tecnologia.inventoryLocations", row?.nome);
    },
  });
}

function createInventoryCategoryRule() {
  const sourceTable = "tb_tecnologia.opcoes";
  return createSingleRule({
    sourceTable,
    domain: "technology-inventory",
    stepId: "technology-inventory-category-insert",
    destinationTable: "tecnologia.inventoryCategories",
    identity: generateIdentity("categoria", "tecnologia.inventoryCategories:organization-name"),
    columns: [
      mapped("id", "id", "uuid_v5_from_organization_and_normalized_name"),
      notPreserved(
        "tipo",
        "tipo distingue as duas telas legadas, mas ambas usam o mesmo catálogo atual de categorias.",
      ),
      mapped("categoria", "name", "normalize_required_name"),
    ],
    defaults: { tag: null, active: true },
    precedence: ["organization_id", "normalized_name", "first_legacy_row"],
    classify(row, context) {
      const base = firstQuarantine([
        classifyIdentity(row),
        classifyRequiredText(row, "categoria", "INVENTORY_CATEGORY_NAME_REQUIRED"),
        [0, 1, "0", "1"].includes(row?.tipo)
          ? prepared()
          : quarantine("tipo", "INVENTORY_CATEGORY_TYPE_UNMAPPED"),
      ]);
      if (base.status === "quarantine") return base;
      return classifyDeduplication(
        context?.categoryDeduplication,
        "categoria",
        "INVENTORY_CATEGORY",
      );
    },
    identityRef(row) {
      return naturalIdentity("tecnologia.inventoryCategories", row?.categoria);
    },
  });
}

function createTiPasswordRule() {
  const sourceTable = "tb_tecnologia.senhas";
  return createSingleRule({
    sourceTable,
    domain: "technology-credentials",
    stepId: "technology-password-insert",
    destinationTable: "tecnologia.passwords_users",
    dependencies: ["tb_admin.usuarios"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("id_usuario", "user_id", "resolve_user_reference", referenceOptions()),
      mapped("local", "local", "normalize_required_text"),
      notPreserved(
        "user",
        "O contrato atual não possui login textual; copiar a credencial para notes a exporia nas listagens.",
        { sensitivity: "credential", transformation: "redact_and_not_preserve" },
      ),
      mapped("password", "password", "encrypt_credential", credentialOptions()),
      mapped("obs", "notes", "normalize_optional_text", personalOptions()),
      notPreserved(
        "item",
        "O vínculo Anydesk com item de inventário não existe no contrato atual de senhas de usuário.",
      ),
      notPreserved(
        "tipo",
        "tipo 0 identifica User e tipo 1 identifica localização; somente tipo 0 é compatível com user_id atual.",
      ),
    ],
    defaults: { active: true },
    classify(row, context) {
      const base = firstQuarantine([
        classifyIdentity(row),
        classifyRequiredText(row, "local", "TI_CREDENTIAL_LOCAL_REQUIRED"),
      ]);
      if (base.status === "quarantine") return base;
      if (Number(row?.tipo) !== 0) {
        return quarantine("tipo", "TI_LOCATION_CREDENTIAL_UNSUPPORTED");
      }
      const user = classifyRequiredReference(
        row,
        context,
        "id_usuario",
        "userResolution",
        "TI_CREDENTIAL_USER",
      );
      if (user.status === "quarantine") return user;
      if (!hasValue(row?.password)) {
        return quarantine("password", "TI_CREDENTIAL_PASSWORD_EMPTY");
      }
      if (context?.credentialEncryptionVerified !== true) {
        return quarantine("password", "TI_CREDENTIAL_REQUIRES_ENCRYPTION");
      }
      return prepared();
    },
  });
}

function createTiTermRule() {
  const sourceTable = "tb_tecnologia.termos";
  return createSingleRule({
    sourceTable,
    domain: "technology-terms",
    stepId: "technology-term-insert",
    destinationTable: "tecnologia.terms",
    dependencies: ["tb_admin.usuarios", "tb_admin.departamentos"],
    columns: [
      mapped("id", "id", "uuid_v5_from_full_source_table_and_legacy_id"),
      mapped("user_id", "user_id", "resolve_optional_user_reference", referenceOptions()),
      mapped("data", "date", "normalize_required_date"),
      mapped("nome", "user_name", "normalize_required_text", personalOptions()),
      mapped("cpf", "user_cpf", "normalize_required_document", personalOptions()),
      mapped(
        "departamento",
        "department_id",
        "resolve_optional_department_reference",
        referenceOptions(),
      ),
      mapped("endereco", "address", "normalize_optional_text", personalOptions()),
      mapped("motivo", "reason", "normalize_optional_text", personalOptions()),
      mapped("equipamentos", "equipament_list", "normalize_optional_text"),
      mapped("marca", "brand", "normalize_optional_text"),
      mapped("codigo", "asset_code", "normalize_optional_text"),
      mapped("imei", "imei", "normalize_optional_text", personalOptions()),
      notPreserved(
        "assinatura",
        "A assinatura legada é um arquivo; signed_at registra evento temporal e não pode receber nome ou conteúdo do arquivo.",
        { sensitivity: "secret", transformation: "redact_and_not_preserve" },
      ),
    ],
    defaults: { signed_at: null },
    classify(row, context) {
      const base = firstQuarantine([
        classifyIdentity(row),
        classifyDate(row, "data", "TI_TERM_DATE_INVALID"),
        classifyRequiredText(row, "nome", "TI_TERM_USER_NAME_REQUIRED"),
        classifyRequiredText(row, "cpf", "TI_TERM_USER_DOCUMENT_REQUIRED"),
        classifyOptionalReference(row, context, "user_id", "userResolution", "TI_TERM_USER"),
        classifyOptionalReference(
          row,
          context,
          "departamento",
          "departmentResolution",
          "TI_TERM_DEPARTMENT",
        ),
      ]);
      if (base.status === "quarantine") return base;
      if (hasValue(row?.assinatura)) {
        return quarantine("assinatura", "TI_TERM_SIGNATURE_STORAGE_UNAVAILABLE");
      }
      return prepared();
    },
  });
}

function createSingleRule({
  sourceTable,
  domain,
  stepId,
  destinationTable,
  columns,
  classify,
  dependencies = [],
  constants = {},
  defaults = {},
  precedence = ["legacy_identity"],
  identity = generateIdentity("id", sourceTable),
  identityRef = (row) => rowIdentity(sourceTable, row?.id),
}) {
  const evidenceDecision = requireConfirmedEvidence(sourceTable);
  return {
    sourceTable,
    status: "confirmed",
    domain,
    ruleOrigin: evidenceDecision.ruleId,
    evidence: evidenceForRule(evidenceDecision),
    cardinality: "1:1",
    dependencies,
    destinations: [
      {
        stepId,
        destinationTable,
        mode: "insert",
        identity,
        columns,
        constants: { organization_id: ORGANIZATION_ID, ...constants },
        defaults,
        precedence,
        dependencies,
      },
    ],
    classifySourceRow: classify,
    emitRows(row, context) {
      return [
        emission({
          stepId,
          destinationTable,
          identityRef: identityRef(row),
          classification: classify(row, context),
        }),
      ];
    },
  };
}

function classifyDeduplication(value, field, prefix) {
  if (value === "owner") return prepared();
  if (value === "duplicate") return notEmitted(`${prefix}_DUPLICATE_NAME`);
  return quarantine(field, `${prefix}_DEDUP_NOT_EXECUTED`);
}

function classifyIdentity(row) {
  return isLegacyIdentity(row?.id) ? prepared() : quarantine("id", "LEGACY_IDENTITY_INVALID");
}

function classifyRequiredText(row, field, reasonCode) {
  return hasValue(row?.[field]) ? prepared() : quarantine(field, reasonCode);
}

function classifyPositiveInteger(row, field, reasonCode) {
  const value = Number(row?.[field]);
  return Number.isSafeInteger(value) && value > 0 ? prepared() : quarantine(field, reasonCode);
}

function classifyNonNegativeInteger(row, field, reasonCode) {
  const value = Number(row?.[field]);
  return Number.isSafeInteger(value) && value >= 0 ? prepared() : quarantine(field, reasonCode);
}

function classifyDate(row, field, reasonCode) {
  return isValidLegacyDate(row?.[field]) ? prepared() : quarantine(field, reasonCode);
}

function classifyRequiredReference(row, context, field, contextKey, prefix) {
  if (!isLegacyIdentity(row?.[field])) return quarantine(field, `${prefix}_LINK_INVALID`);
  return classifyResolution(context?.[contextKey], field, prefix);
}

function classifyOptionalReference(row, context, field, contextKey, prefix) {
  if (isEmptyLegacyReference(row?.[field])) return prepared();
  if (!isLegacyIdentity(row?.[field])) return quarantine(field, `${prefix}_LINK_INVALID`);
  return classifyResolution(context?.[contextKey], field, prefix);
}

function classifyResolution(value, field, prefix) {
  if (value === "one") return prepared();
  if (value === "zero") return quarantine(field, `${prefix}_NOT_FOUND`);
  if (value === "many") return quarantine(field, `${prefix}_AMBIGUOUS`);
  return quarantine(field, `${prefix}_LOOKUP_NOT_EXECUTED`);
}

function classifyUnique(value, field, prefix) {
  if (value === "zero") return prepared();
  if (value === "one" || value === "many") return quarantine(field, `${prefix}_DUPLICATE`);
  return quarantine(field, `${prefix}_LOOKUP_NOT_EXECUTED`);
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

function notEmitted(reasonCode) {
  return { status: "not_emitted", reasonCode };
}

function emission({ stepId, destinationTable, identityRef, classification }) {
  if (classification.status === "prepared") {
    return {
      stepId,
      destinationTable,
      status: "prepared",
      identityRef,
      field: null,
      reasonCode: null,
    };
  }
  if (classification.status === "not_emitted") {
    return {
      stepId,
      destinationTable,
      status: "not_emitted",
      identityRef,
      field: null,
      reasonCode: classification.reasonCode,
    };
  }
  return {
    stepId,
    destinationTable,
    status: "quarantine",
    identityRef,
    field: classification.field,
    reasonCode: classification.reasonCode,
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

function naturalIdentity(scope, value) {
  const normalized = normalizeNatural(value);
  const digest = createHash("sha256")
    .update(`${ORGANIZATION_ID}:${normalized}`, "utf8")
    .digest("hex");
  return `${scope}:${digest}`;
}

function normalizeNatural(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function isLegacyIdentity(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0;
  return typeof value === "string" && /^[1-9]\d*$/.test(value.trim());
}

function isEmptyLegacyReference(value) {
  return value === null || value === undefined || value === "" || value === 0 || value === "0";
}

function isValidLegacyDate(value) {
  if (!hasValue(value)) return false;
  const text = String(value).trim();
  if (text.startsWith("0000-00-00")) return false;
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) return false;
  const normalized = text.replace(" ", "T");
  const parsed = new Date(`${normalized}Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const expectedDate = text.slice(0, 10);
  return parsed.toISOString().slice(0, 10) === expectedDate;
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim().length > 0;
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
      `A coluna legada ${sourceColumn ?? "derivada"} alimenta ${destinationColumn} conforme o contrato atual validado.`,
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

function referenceOptions() {
  return {
    referenceRole: "foreign_key",
    reason: "A referência legada exige resolução explícita e nunca fabrica entidade ausente.",
  };
}

function credentialOptions() {
  return {
    sensitivity: "credential",
    nullHandling: "required_encrypted_value",
    reason: "A credencial somente pode ser persistida após criptografia verificada.",
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
