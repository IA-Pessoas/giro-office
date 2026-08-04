import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";

const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";
const rulesModule = await import("../rules/index.mjs").catch(() => null);

function requireImplementation() {
  assert.ok(rulesModule, "regras especializadas ainda não implementadas");
  return rulesModule;
}

function specializedRules() {
  const { CERTIFICATE_RULES, PARCELAMENTO_RULES, TECHNOLOGY_RULES } = requireImplementation();
  return [...TECHNOLOGY_RULES, ...CERTIFICATE_RULES, ...PARCELAMENTO_RULES];
}

function rule(sourceTable) {
  const found = specializedRules().find((candidate) => candidate.sourceTable === sourceTable);
  assert.ok(found, `regra ausente: ${sourceTable}`);
  return found;
}

async function inspectDeclaredColumns(sourceTable) {
  const dump = await readFile(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const createBody = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1];
  assert.ok(createBody, `CREATE TABLE ausente: ${sourceTable}`);
  return [...createBody.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

test("as 15 regras especializadas são válidas no catálogo Prisma atual", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");
  const rules = specializedRules();

  assert.equal(rules.length, 15);
  for (const mappingRule of rules) {
    assert.equal(validateMappingRule(mappingRule, catalog), true, mappingRule.sourceTable);
  }
});

test("toda coluna real das origens confirmed é mapped ou not_preserved", async () => {
  for (const mappingRule of specializedRules()) {
    const expected = await inspectDeclaredColumns(mappingRule.sourceTable);
    const classified = new Set();

    for (const destination of mappingRule.destinations) {
      for (const column of destination.columns) {
        if (column.sourceColumn === null) continue;
        assert.ok(expected.includes(column.sourceColumn));
        classified.add(column.sourceColumn);
        assert.ok(["mapped", "not_preserved"].includes(column.status));
        assert.ok(column.reason.length >= 20);
        if (column.status === "not_preserved") {
          assert.equal(column.destinationColumn, null);
        }
      }
    }
    assert.deepEqual([...classified].sort(), expected.sort(), mappingRule.sourceTable);
  }
});

test("estoque de tecnologia decompõe categoria, localização e item com deduplicação estável", () => {
  const mappingRule = rule("tb_tecnologia.estoque");
  assert.equal(mappingRule.cardinality, "1:N");
  assert.deepEqual(
    mappingRule.destinations.map(({ destinationTable, mode }) => [destinationTable, mode]),
    [
      ["stock.categories", "derived"],
      ["stock.locations", "derived"],
      ["stock", "insert"],
    ],
  );
  assert.ok(mappingRule.dependencies.includes("tb_cbs.estoque_localizacoes"));
  assert.equal(
    mappingRule.destinations[1].columns.find(
      ({ destinationColumn }) => destinationColumn === "name",
    ).transformation,
    "resolve_stock_location_name",
  );
  assert.equal(
    mappingRule.destinations[2].columns.find(
      ({ destinationColumn }) => destinationColumn === "name",
    ).sourceColumn,
    "categoria",
  );

  const row = {
    id: 9,
    categoria: "Notebook",
    localizacao: 12,
    quantidade: 4,
    descricao: "",
    criado: 1,
    status: "Ativo",
  };
  const owners = mappingRule.emitRows(row, {
    technologyDepartmentResolution: "one",
    stockLocationResolution: "one",
    stockLocationName: "Sala TI",
    categoryDeduplication: "owner",
    locationDeduplication: "owner",
  });
  assert.equal(owners.length, 3);
  assert.deepEqual(
    owners.map(({ status }) => status),
    ["prepared", "prepared", "prepared"],
  );

  const duplicates = mappingRule.emitRows(
    { ...row, id: 10, categoria: " notebook ", localizacao: 99 },
    {
      technologyDepartmentResolution: "one",
      stockLocationResolution: "one",
      stockLocationName: "SALA TI",
      categoryDeduplication: "duplicate",
      locationDeduplication: "duplicate",
    },
  );
  assert.deepEqual(
    duplicates.map(({ status }) => status),
    ["not_emitted", "not_emitted", "prepared"],
  );
  assert.equal(owners[0].identityRef, duplicates[0].identityRef);
  assert.equal(owners[1].identityRef, duplicates[1].identityRef);
  assert.notEqual(owners[2].identityRef, duplicates[2].identityRef);
});

test("credencial TI exige User correto e criptografia sem expor valor", () => {
  const mappingRule = rule("tb_tecnologia.senhas");
  const row = {
    id: 5,
    id_usuario: 8,
    local: "Anydesk",
    user: "SENTINEL_TI_LOGIN",
    password: "SENTINEL_TI_PASSWORD",
    obs: "SENTINEL_TI_NOTES",
    item: 11,
    tipo: 0,
  };
  const missingCrypto = mappingRule.emitRows(row, { userResolution: "one" });
  assert.equal(missingCrypto[0].status, "quarantine");
  assert.equal(missingCrypto[0].reasonCode, "TI_CREDENTIAL_REQUIRES_ENCRYPTION");
  assert.doesNotMatch(
    JSON.stringify({ missingCrypto, evidence: mappingRule.evidence }),
    /SENTINEL/,
  );

  const prepared = mappingRule.emitRows(row, {
    userResolution: "one",
    credentialEncryptionVerified: true,
  });
  assert.equal(prepared[0].status, "prepared");
  const locationCredential = mappingRule.emitRows(
    { ...row, tipo: 1 },
    { userResolution: "one", credentialEncryptionVerified: true },
  );
  assert.equal(locationCredential[0].status, "quarantine");
  assert.equal(locationCredential[0].reasonCode, "TI_LOCATION_CREDENTIAL_UNSUPPORTED");

  const passwordColumn = mappingRule.destinations[0].columns.find(
    ({ sourceColumn }) => sourceColumn === "password",
  );
  assert.equal(passwordColumn.transformation, "encrypt_credential");
  assert.equal(passwordColumn.sensitivity, "credential");
});

test("reset legado permanece pending e nenhuma decisão carrega token", () => {
  const { SPECIALIZED_EVIDENCE } = requireImplementation();
  const resetDecision = SPECIALIZED_EVIDENCE.find(
    ({ sourceTable }) => sourceTable === "tb_tecnologia.reset",
  );

  assert.equal(resetDecision.finalStatus, "pending");
  assert.equal(resetDecision.ruleId, null);
  assert.equal(ruleIfPresent("tb_tecnologia.reset"), undefined);
  assert.doesNotMatch(JSON.stringify(resetDecision), /SENTINEL_RESET_TOKEN/);
});

test("certificados validam data, identidade e metadata sem emitir segredo", () => {
  for (const sourceTable of ["tb_certificados.pf", "tb_certificados.pj"]) {
    const mappingRule = rule(sourceTable);
    const documentField = sourceTable.endsWith(".pf") ? "cpf" : "cnpj";
    const row = {
      id: 7,
      cliente: 1,
      nome: "Pessoa",
      [documentField]: "12345678901",
      responsavel: "Responsável",
      modelo: "A1",
      nj: "Sociedade",
      senha: "SENTINEL_CERTIFICATE_PASSWORD",
      validade: "2027-03-10",
      obs: "",
      empresa: "Empresa",
      pagamento: 1,
      data_pagamento: "2026-03-01",
      valor_pagamento: 100,
      status: 1,
      contato: "contato",
      arquivo: "SENTINEL_PFX_CONTENT.pfx",
      possui: 1,
    };

    const invalidDate = mappingRule.emitRows(
      { ...row, validade: "0000-00-00" },
      { certificateIdentityResolution: "owner" },
    );
    assert.equal(invalidDate[0].reasonCode, "CERTIFICATE_EXPIRATION_DATE_INVALID");
    const impossibleDate = mappingRule.emitRows(
      { ...row, validade: "2026-02-30" },
      { certificateIdentityResolution: "owner" },
    );
    assert.equal(impossibleDate[0].reasonCode, "CERTIFICATE_EXPIRATION_DATE_INVALID");

    const unsupportedPem = mappingRule.emitRows(
      { ...row, arquivo: "SENTINEL_PEM_CONTENT.pem" },
      { certificateIdentityResolution: "owner" },
    );
    assert.equal(unsupportedPem[0].reasonCode, "CERTIFICATE_FILE_TYPE_UNSUPPORTED");
    assert.doesNotMatch(JSON.stringify(unsupportedPem), /SENTINEL/);

    const duplicate = mappingRule.emitRows(row, { certificateIdentityResolution: "duplicate" });
    assert.equal(duplicate[0].reasonCode, "CERTIFICATE_IDENTITY_DUPLICATE");

    const missingMetadata = mappingRule.emitRows(row, {
      certificateIdentityResolution: "owner",
      certificateFileResolution: "one",
      certificateStorageEncryptionVerified: true,
    });
    assert.equal(missingMetadata[0].reasonCode, "CERTIFICATE_FILE_METADATA_INCOMPLETE");

    const prepared = mappingRule.emitRows(row, {
      certificateIdentityResolution: "owner",
      certificateFileResolution: "one",
      certificateStorageEncryptionVerified: true,
      certificateFileMetadataComplete: true,
    });
    assert.equal(prepared[0].status, "prepared");
    assert.doesNotMatch(JSON.stringify({ prepared, evidence: mappingRule.evidence }), /SENTINEL/);

    const fileColumns = mappingRule.destinations[0].columns.filter(
      ({ sourceColumn }) => sourceColumn === "arquivo",
    );
    assert.ok(fileColumns.length >= 10);
    assert.ok(fileColumns.every(({ sensitivity }) => sensitivity === "secret"));
  }
});

test("parcelamento resolve cliente, identidade do acordo, estado e competência explicitamente", () => {
  const { SPECIALIZED_EVIDENCE } = requireImplementation();
  for (const sourceTable of [
    "tb_cbc.panorama_clientes_parcelamento",
    "tb_parcelamento.simulacoes",
    "tb_parcelamento.simulacoes_parcelamentos",
  ]) {
    const decision = SPECIALIZED_EVIDENCE.find((item) => item.sourceTable === sourceTable);
    assert.equal(decision.finalStatus, "pending", sourceTable);
    assert.equal(ruleIfPresent(sourceTable), undefined, sourceTable);
  }

  const clientRule = rule("tb_parcelamento.clientes");
  assert.equal(clientRule.destinations[0].mode, "lookup");
  assert.equal(
    clientRule.emitRows(
      { id: 1, nome: "Cliente", razao_social: "Cliente", cpf_cnpj: "123", regime: "R" },
      { clientLookupResolution: "zero" },
    )[0].reasonCode,
    "PARCELAMENTO_CLIENT_NOT_FOUND",
  );

  const installmentRule = rule("tb_parcelamento.parcelamentos");
  const installmentStep = installmentRule.destinations[0];
  assert.equal(installmentStep.defaults.agreement_number, null);
  assert.ok(installmentStep.precedence.includes("agreement_number"));
  assert.ok(installmentStep.precedence.includes("fallback_operational_identity"));

  const installment = {
    id: 2,
    cliente_id: 3,
    natureza: "Tributária",
    tipo: "RFB",
    estancia: "Federal",
    caminho: "",
    debito_automatico: 0,
    total_consolidado: 100,
    primeira_parcela: 10,
    parcela_mes_vigente: 10,
    saldo_devedor: 90,
    parcelas_pagas: 1,
    parcelas_acordadas: 10,
    parcelas_restantes: 9,
    parcelas_vencidas: 0,
    data_adesao: "2026-01-01",
    documento: "",
    externo: 0,
    situacao: 0,
    data_finalizacao: "0000-00-00",
    parcelas_entradas: 0,
    tipo_paralisacao: 0,
  };
  const preparedInstallment = installmentRule.emitRows(installment, {
    integrationClientResolution: "one",
    agreementIdentityResolution: "zero",
  });
  assert.equal(preparedInstallment[0].status, "prepared");
  const unknownState = installmentRule.emitRows(
    { ...installment, situacao: 99 },
    { integrationClientResolution: "one", agreementIdentityResolution: "zero" },
  );
  assert.equal(unknownState[0].reasonCode, "INSTALLMENT_STATUS_UNMAPPED");

  const competencyRule = rule("tb_parcelamento.competencia");
  const competency = {
    id: 3,
    id_parcelamento: 2,
    data: "2026-07",
    pagas: 1,
    vencida: 0,
    download: 1,
    download_obs: "",
    upload: 0,
    envio: 1,
    tipo_envio: 1,
    obs: "",
    recibo: "",
    parcela: 10,
  };
  assert.equal(
    competencyRule.emitRows(competency, {
      installmentResolution: "one",
      competenceIdentityResolution: "zero",
    })[0].status,
    "prepared",
  );
  assert.equal(
    competencyRule.emitRows(
      { ...competency, data: "07/2026" },
      { installmentResolution: "one", competenceIdentityResolution: "zero" },
    )[0].reasonCode,
    "INSTALLMENT_COMPETENCE_INVALID",
  );

  const panoramaRule = rule("tb_cbc.panorama_parcelamentos");
  const panorama = {
    id: 4,
    comp: "2026-07",
    cliente_id: 3,
    cnd_municipal: 1,
    cnd_estadual: 0,
    cnd_federal: 1,
    cnd_fgts: 0,
    cnd_trabalhista: 1,
    protestos: 0,
    situacao_fiscal_estadual: 1,
    situacao_fiscal_federal: 0,
    responsavel_id: 8,
  };
  assert.equal(
    panoramaRule.emitRows(panorama, {
      clientResolution: "one",
      responsibleResolution: "one",
      panoramaIdentityResolution: "zero",
    })[0].status,
    "prepared",
  );
  assert.equal(
    panoramaRule.emitRows(panorama, {
      clientResolution: "one",
      responsibleResolution: "zero",
      panoramaIdentityResolution: "zero",
    })[0].reasonCode,
    "PANORAMA_RESPONSIBLE_NOT_FOUND",
  );
  assert.equal(
    panoramaRule.emitRows(
      { ...panorama, cnd_municipal: 3 },
      {
        clientResolution: "one",
        responsibleResolution: "one",
        panoramaIdentityResolution: "zero",
      },
    )[0].reasonCode,
    "PANORAMA_BOOLEAN_STATE_UNMAPPED",
  );
});

function ruleIfPresent(sourceTable) {
  return specializedRules().find((candidate) => candidate.sourceTable === sourceTable);
}
