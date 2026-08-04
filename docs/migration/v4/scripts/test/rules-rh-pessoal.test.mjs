import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validateMappingRule } from "../lib/mapping-contract.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { buildRuleRegistry, RH_PESSOAL_RULES, V2_RULES } from "../rules/index.mjs";

const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";

function rule(sourceTable) {
  const found = buildRuleRegistry(RH_PESSOAL_RULES).get(sourceTable);
  assert.ok(found, `regra ausente: ${sourceTable}`);
  return found;
}

function step(mappingRule, stepId) {
  const found = mappingRule.destinations.find((candidate) => candidate.stepId === stepId);
  assert.ok(found, `passo ausente: ${mappingRule.sourceTable}.${stepId}`);
  return found;
}

async function inspectDeclaredColumns(sourceTable) {
  const dump = await readFile(path.join(LEGACY_DUMP_ROOT, `${sourceTable}.sql`), "utf8");
  const createBody = dump.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\) ENGINE=/)?.[1];
  assert.ok(createBody, `CREATE TABLE ausente: ${sourceTable}`);
  return [...createBody.matchAll(/^\s*`([^`]+)`/gm)].map((match) => match[1]);
}

test("registro combinado contém V2 e RH/Pessoal sem colisões de sourceTable", () => {
  const registry = buildRuleRegistry(RH_PESSOAL_RULES);

  assert.equal(V2_RULES.length, 16);
  assert.equal(RH_PESSOAL_RULES.length, 25);
  assert.equal(registry.size, 41);
  assert.equal(
    new Set([...V2_RULES, ...RH_PESSOAL_RULES].map(({ sourceTable }) => sourceTable)).size,
    41,
  );
  assert.equal(
    RH_PESSOAL_RULES.some(({ sourceTable }) => sourceTable === "tb_rh.colaboradores"),
    false,
  );
});

test("todas as regras RH/Pessoal são válidas contra o catálogo Prisma atual", async () => {
  const catalog = await loadPrismaCatalog("infra/prisma/schema.prisma");

  for (const mappingRule of RH_PESSOAL_RULES) {
    assert.equal(validateMappingRule(mappingRule, catalog), true, mappingRule.sourceTable);
  }
});

test("toda coluna declarada nos 25 dumps confirmed termina mapped ou not_preserved com razão", async () => {
  for (const mappingRule of RH_PESSOAL_RULES) {
    const expected = await inspectDeclaredColumns(mappingRule.sourceTable);
    const classified = new Set();

    for (const destination of mappingRule.destinations) {
      for (const column of destination.columns) {
        if (column.sourceColumn === null) continue;
        assert.ok(
          expected.includes(column.sourceColumn),
          `${mappingRule.sourceTable}.${column.sourceColumn}`,
        );
        classified.add(column.sourceColumn);
        assert.ok(["mapped", "not_preserved"].includes(column.status));
        assert.ok(column.reason.length >= 20, `${mappingRule.sourceTable}.${column.sourceColumn}`);
        if (column.status === "not_preserved") {
          assert.equal(column.destinationColumn, null);
        }
      }
    }

    assert.deepEqual([...classified].sort(), [...expected].sort(), mappingRule.sourceTable);
  }
});

test("referência de User ausente não fabrica identidade e produz USER_REFERENCE_NOT_FOUND", () => {
  const mappingRule = rule("tb_rh.alergias");
  const classification = mappingRule.classifySourceRow(
    { id: 7, colaborador_id: 91, nome: "sentinela pessoal" },
    { userResolution: "zero" },
  );
  const emissions = mappingRule.emitRows(
    { id: 7, colaborador_id: 91, nome: "sentinela pessoal" },
    { userResolution: "zero" },
  );

  assert.deepEqual(classification, {
    status: "quarantine",
    field: "colaborador_id",
    reasonCode: "USER_REFERENCE_NOT_FOUND",
  });
  assert.equal(emissions[0].status, "quarantine");
  assert.equal(emissions[0].reasonCode, "USER_REFERENCE_NOT_FOUND");
  assert.doesNotMatch(JSON.stringify({ classification, emissions }), /sentinela pessoal/);
  assert.doesNotMatch(emissions[0].identityRef, /unknown/);
});

test("credenciais exigem criptografia e nenhuma decisão expõe login, senha, email ou CPF", () => {
  const credentialRules = [
    "tb_pessoal.bem",
    "tb_pessoal.bsf",
    "tb_pessoal.codigos_acesso",
    "tb_pessoal.contri_assis",
    "tb_pessoal.empregador_web",
  ];
  const sentinels = {
    usuario: "SENTINEL_LOGIN",
    identificador: "SENTINEL_IDENTIFIER",
    cpf: "SENTINEL_CPF",
    login: "SENTINEL_LOGIN_2",
    senha: "SENTINEL_PASSWORD",
    cod_acesso: "SENTINEL_ACCESS_CODE",
    senha_gov: "SENTINEL_GOV_PASSWORD",
    email: "SENTINEL_EMAIL",
    senha_email: "SENTINEL_EMAIL_PASSWORD",
  };

  for (const sourceTable of credentialRules) {
    const mappingRule = rule(sourceTable);
    const row = { id: 5, empresa: 8, cliente_id: 8, responsavel: 0, ...sentinels };
    const context = { clientResolution: "one", responsibleResolution: "one" };
    const classification = mappingRule.classifySourceRow(row, context);
    const emissions = mappingRule.emitRows(row, context);
    const serialized = JSON.stringify({
      classification,
      emissions,
      evidence: mappingRule.evidence,
    });

    assert.equal(classification.status, "quarantine", sourceTable);
    assert.equal(classification.reasonCode, "CREDENTIAL_REQUIRES_ENCRYPTION", sourceTable);
    assert.equal(emissions[0].reasonCode, "CREDENTIAL_REQUIRES_ENCRYPTION", sourceTable);
    for (const sentinel of Object.values(sentinels)) {
      assert.doesNotMatch(serialized, new RegExp(sentinel), sourceTable);
    }

    const encrypted = mappingRule.destinations[0].columns.filter(
      ({ sensitivity }) => sensitivity === "credential",
    );
    assert.ok(encrypted.length > 0, sourceTable);
    assert.ok(encrypted.every(({ transformation }) => transformation === "encrypt_credential"));
  }
});

test("solicitação resolve requester pelo colaborador e exige assignee explícito ou elegível único", () => {
  const mappingRule = rule("tb_rh.solicitacoes");
  const destination = step(mappingRule, "rh-request-insert");
  const requester = destination.columns.find(({ sourceColumn }) => sourceColumn === "requerente");
  const assignee = destination.columns.find(({ sourceColumn }) => sourceColumn === "atribuido");

  assert.equal(requester.destinationColumn, "requester_user_id");
  assert.equal(requester.transformation, "resolve_collaborator_user_reference");
  assert.match(requester.reason, /tb_rh\.colaboradores/i);
  assert.equal(assignee.destinationColumn, "assigned_to_user_id");
  assert.equal(assignee.transformation, "resolve_required_collaborator_rh_assignee");
  assert.match(assignee.reason, /tb_rh\.colaboradores/i);
  assert.match(assignee.reason, /permissions\.rh/i);
  assert.equal(assignee.nullHandling, "required_lookup_never_null");
  assert.ok(destination.dependencies.includes("tb_rh.colaboradores"));
  assert.ok(destination.dependencies.includes("tb_admin.usuarios"));

  const base = { id: 17, requerente: 145, categoria: 3 };
  const required = { requesterResolution: "one", categoryResolution: "one" };
  assert.equal(
    mappingRule.emitRows({ ...base, atribuido: 44 }, { ...required, assigneeResolution: "one" })[0]
      .status,
    "prepared",
  );

  for (const assigneeResolution of ["zero", "many", "not_executed"]) {
    const [emission] = mappingRule.emitRows(
      { ...base, atribuido: 44 },
      { ...required, assigneeResolution },
    );
    assert.equal(emission.status, "quarantine", assigneeResolution);
    assert.match(emission.reasonCode, /^ASSIGNEE_REFERENCE_/, assigneeResolution);
  }
  assert.equal(
    mappingRule.emitRows(
      { ...base, atribuido: "id inválido" },
      { ...required, assigneeResolution: "one" },
    )[0].reasonCode,
    "ASSIGNEE_REFERENCE_INVALID",
  );

  assert.equal(
    mappingRule.emitRows(
      { ...base, atribuido: 0 },
      { ...required, eligibleAssigneeResolution: "one" },
    )[0].status,
    "prepared",
  );
  for (const eligibleAssigneeResolution of ["zero", "many", "not_executed"]) {
    const [emission] = mappingRule.emitRows(
      { ...base, atribuido: 0 },
      { ...required, eligibleAssigneeResolution },
    );
    assert.equal(emission.status, "quarantine", eligibleAssigneeResolution);
    assert.match(emission.reasonCode, /^ELIGIBLE_RH_ASSIGNEE_/, eligibleAssigneeResolution);
  }
});

test("IDs de operador RH legados resolvem o User pelo vínculo de colaborador", () => {
  const cases = [
    ["tb_rh.pontos_adicionais_folhas", "adicionado_por", "added_by_user_id"],
    ["tb_rh.pontos_solicitacoes", "aprovador", "approver_user_id"],
    ["tb_rh.solicitacoes_mensagens", "remetente", "sender_user_id"],
  ];

  for (const [sourceTable, sourceColumn, destinationColumn] of cases) {
    const mappingRule = rule(sourceTable);
    const column = mappingRule.destinations[0].columns.find(
      (candidate) => candidate.sourceColumn === sourceColumn,
    );

    assert.equal(column.destinationColumn, destinationColumn, sourceTable);
    assert.equal(column.transformation, "resolve_collaborator_user_reference", sourceTable);
    assert.match(column.reason, /tb_rh\.colaboradores/i, sourceTable);
    assert.ok(mappingRule.destinations[0].dependencies.includes("tb_rh.colaboradores"));
  }
});

test("score_avaliacoes usa user_id como avaliador e avaliador como código de papel", () => {
  const mappingRule = rule("tb_rh.score_avaliacoes");
  const destination = step(mappingRule, "rh-score-evaluation-insert");
  const userId = destination.columns.find(({ sourceColumn }) => sourceColumn === "user_id");
  const evaluatorRole = destination.columns.find(
    ({ sourceColumn, destinationColumn }) =>
      sourceColumn === "avaliador" && destinationColumn === "evaluator_role",
  );
  const type = destination.columns.find(
    ({ sourceColumn, destinationColumn }) =>
      sourceColumn === "tipo" && destinationColumn === "type",
  );

  assert.equal(userId.status, "mapped");
  assert.equal(userId.destinationColumn, "evaluator_id");
  assert.equal(userId.transformation, "resolve_optional_user_reference");
  assert.equal(evaluatorRole.transformation, "normalize_score_evaluator_role_code");
  assert.match(evaluatorRole.reason, /0=SELF.*1=LEADER.*2=RH.*3=DIRECTOR.*4=TI.*5=SUBORDINATE/);
  assert.equal(type.transformation, "normalize_score_question_type");
  assert.equal(
    destination.columns.some(
      ({ sourceColumn, destinationColumn }) =>
        sourceColumn === "tipo" && destinationColumn === "evaluator_role",
    ),
    false,
  );
});

test("sindicato e obrigação respeitam as identidades compostas dos contratos atuais", () => {
  const unionRule = rule("tb_pessoal.sindicato");
  const obligationRule = rule("tb_pessoal.obrigacoes");
  const unionStep = step(unionRule, "pessoal-union-insert");
  const obligationStep = step(obligationRule, "pessoal-obligation-insert");

  assert.ok(unionStep.precedence.includes("unique_organization_name_cnpj_base_date"));
  assert.equal(
    unionRule.emitRows(
      { id: 1, nome: "Sindicato", cnpj: "00", data_base: "2026-01-01" },
      { unionUniqueResolution: "zero" },
    )[0].status,
    "prepared",
  );
  assert.equal(
    unionRule.emitRows(
      { id: 1, nome: "Sindicato", cnpj: "00", data_base: "2026-01-01" },
      { unionUniqueResolution: "one" },
    )[0].reasonCode,
    "UNION_UNIQUE_CONFLICT",
  );

  assert.ok(obligationStep.precedence.includes("unique_organization_client_competence"));
  assert.equal(
    obligationRule.emitRows(
      { id: 2, cliente_id: 9, comp: "08/2026", responsavel_id: 0 },
      {
        clientResolution: "one",
        obligationUniqueResolution: "zero",
      },
    )[0].status,
    "prepared",
  );
  assert.equal(
    obligationRule.emitRows(
      { id: 2, cliente_id: 9, comp: "08/2026", responsavel_id: 0 },
      {
        clientResolution: "one",
        obligationUniqueResolution: "one",
      },
    )[0].reasonCode,
    "OBLIGATION_UNIQUE_CONFLICT",
  );
});

test("quarentena nunca inclui valores pessoais nem conteúdo livre da origem", () => {
  const sentinel = "SENTINEL_PERSONAL_CONTENT";
  const cases = [
    [
      "tb_rh.contatos_emergencia",
      { id: 1, colaborador_id: 7, nome: sentinel, referencia: sentinel, numero: sentinel },
      { userResolution: "many" },
    ],
    [
      "tb_pessoal.clientes_situacoes",
      { id: 2, cliente_id: 9, titulo: sentinel, descricao: sentinel, cadastrado_por: 4 },
      { clientResolution: "zero", registeredByResolution: "one" },
    ],
    [
      "tb_rh.solicitacoes_mensagens",
      { id: 3, solicitacao: 10, remetente: 11, mensagem: sentinel },
      { requestResolution: "zero", senderResolution: "one" },
    ],
  ];

  for (const [sourceTable, row, context] of cases) {
    const mappingRule = rule(sourceTable);
    const classification = mappingRule.classifySourceRow(row, context);
    const emissions = mappingRule.emitRows(row, context);
    assert.equal(classification.status, "quarantine", sourceTable);
    assert.doesNotMatch(JSON.stringify({ classification, emissions }), new RegExp(sentinel));
  }
});
