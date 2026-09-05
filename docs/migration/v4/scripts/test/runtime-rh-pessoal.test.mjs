import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExecutionGroupCoverage,
  assertTransformationCoverage,
  createExecutionRegistry,
  validateExecutionCoverage,
} from "../lib/execution-registry.mjs";
import { loadPrismaCatalog } from "../lib/prisma-catalog.mjs";
import { iterateSqlRows } from "../lib/sql-dump-parser.mjs";
import { RH_PESSOAL_RULES } from "../rules/rh-pessoal.mjs";
import {
  buildRhPessoalRuntimeState,
  RH_PESSOAL_EXECUTION_ENTRIES,
  RH_PESSOAL_TRANSFORMERS,
} from "../runtime/rh-pessoal.mjs";

function entry(sourceTable) {
  const found = RH_PESSOAL_EXECUTION_ENTRIES.find(
    (candidate) => candidate.sourceTable === sourceTable,
  );
  assert.ok(found, `entrada runtime ausente: ${sourceTable}`);
  return found;
}

function decision(runtimeEntry, row, state) {
  return runtimeEntry.emitRows(row, state).find(({ stepId }) => stepId === runtimeEntry.stepId);
}

function resolved(id, value = undefined) {
  return value === undefined ? { id } : { id, value };
}

function userJsonState(state, value = []) {
  return { state, value };
}

function completeRuntimeState(overrides = {}) {
  const options = {
    resolveClient: (legacyId) => resolved(`client-${legacyId}`),
    resolveUser: (legacyId) => resolved(`user-${legacyId}`),
    resolveCollaboratorUser: (legacyId) => resolved(`collaborator-user-${legacyId}`),
    resolveUnion: (legacyId) => resolved(`union-${legacyId}`),
    resolvePoint: (legacyId) => resolved(`point-${legacyId}`),
    resolveScore: ({ collaboratorId, quarter }) => resolved(`score-${collaboratorId}-${quarter}`),
    resolveQuestion: (legacyId) => resolved(`question-${legacyId}`),
    resolveRequestCategory: (legacyId) => resolved(`category-${legacyId}`),
    resolveRequest: (legacyId) => resolved(`request-${legacyId}`),
    resolveUnique: () => null,
    readUserJson: () => userJsonState("empty"),
    encryptCredential: (value) => `encrypted:${Buffer.from(String(value)).toString("base64")}`,
    ...overrides,
  };
  return buildRhPessoalRuntimeState(options);
}

const LEGACY_DUMP_ROOT = "/home/bruno/Documents/03.08.2026";

test("runtime RH/Pessoal cobre exatamente 25 origens, 23 inserts e 2 aggregates", async () => {
  assertExecutionGroupCoverage(RH_PESSOAL_RULES, RH_PESSOAL_EXECUTION_ENTRIES);
  assertTransformationCoverage(
    RH_PESSOAL_RULES,
    RH_PESSOAL_TRANSFORMERS,
    RH_PESSOAL_EXECUTION_ENTRIES,
  );

  const declaredTransformations = new Set(
    RH_PESSOAL_RULES.flatMap(({ destinations }) =>
      destinations.flatMap(({ columns }) =>
        columns
          .filter(({ status }) => status === "mapped")
          .map(({ transformation }) => transformation),
      ),
    ),
  );
  assert.equal(declaredTransformations.size, 50);
  assert.equal(Object.keys(RH_PESSOAL_TRANSFORMERS).length, 50);

  assert.equal(RH_PESSOAL_EXECUTION_ENTRIES.length, 25);
  assert.equal(
    new Set(RH_PESSOAL_EXECUTION_ENTRIES.map(({ sourceTable }) => sourceTable)).size,
    25,
  );
  assert.deepEqual(
    Object.fromEntries(
      RH_PESSOAL_RULES.flatMap(({ destinations }) => destinations)
        .map(({ mode }) => mode)
        .sort()
        .reduce((counts, mode) => counts.set(mode, (counts.get(mode) ?? 0) + 1), new Map()),
    ),
    { aggregate: 2, insert: 23 },
  );
  assert.equal(
    validateExecutionCoverage({
      ruleRegistry: new Map(
        RH_PESSOAL_RULES.map((mappingRule) => [mappingRule.sourceTable, mappingRule]),
      ),
      executionRegistry: createExecutionRegistry([RH_PESSOAL_EXECUTION_ENTRIES]),
      prismaCatalog: await loadPrismaCatalog("infra/prisma/schema.prisma"),
    }),
    true,
  );
});

test("solicitação projeta assignee ausente como null sem relaxar solicitante ou categoria", () => {
  const runtimeEntry = entry("tb_rh.solicitacoes");
  const state = completeRuntimeState({
    resolveCollaboratorUser: (legacyId) => (legacyId === 11 ? resolved("requester-user") : null),
    resolveRequestCategory: (legacyId) => (legacyId === 7 ? resolved("request-category") : null),
  });
  const base = {
    id: 91,
    titulo: "Férias",
    descricao: "Solicitação válida",
    status: 0,
    requerente: 11,
    categoria: 7,
    urgencia: 2,
    data_cadastro: "2026-08-01 09:00:00",
    data_atualizacao: "2026-08-02 10:00:00",
  };

  for (const atribuido of [0, "0", "", null, undefined]) {
    const row = { ...base, atribuido };
    const emission = decision(runtimeEntry, row, state);
    assert.equal(emission.status, "prepared", String(atribuido));
    assert.equal(runtimeEntry.projector(emission, row, state).assigned_to_user_id, null);
  }

  const invalidAssignee = decision(runtimeEntry, { ...base, atribuido: 99 }, state);
  assert.deepEqual(
    {
      status: invalidAssignee.status,
      field: invalidAssignee.field,
      reasonCode: invalidAssignee.reasonCode,
    },
    {
      status: "quarantine",
      field: "atribuido",
      reasonCode: "ASSIGNEE_REFERENCE_NOT_FOUND",
    },
  );

  const missingCategory = decision(runtimeEntry, { ...base, categoria: 404, atribuido: 0 }, state);
  assert.equal(missingCategory.status, "quarantine");
  assert.equal(missingCategory.field, "categoria");
  assert.equal(missingCategory.reasonCode, "CATEGORY_REFERENCE_NOT_FOUND");
});

test("adaptadores resolvem cliente, usuário, sindicato, ponto, score, pergunta e solicitação", () => {
  const state = completeRuntimeState();

  const payrollEntry = entry("tb_pessoal.folhas");
  const payroll = {
    id: 1,
    cliente_id: 2,
    responsavel_id: 3,
    sindicato: 4,
    info: "Folha",
    grupo: "A",
  };
  const payrollDecision = decision(payrollEntry, payroll, state);
  assert.equal(payrollDecision.status, "prepared");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(payrollEntry.projector(payrollDecision, payroll, state)).filter(([key]) =>
        ["client_id", "responsible_id", "union_id"].includes(key),
      ),
    ),
    { client_id: "client-2", responsible_id: "user-3", union_id: "union-4" },
  );

  const pointRequestEntry = entry("tb_rh.pontos_solicitacoes");
  const pointRequest = {
    id: 5,
    colaborador: 6,
    ponto: 7,
    entrada: "08:00:00",
    justificativa: "Correção",
    data: "2026-08-01",
    aprovador: 8,
  };
  const pointDecision = decision(pointRequestEntry, pointRequest, state);
  assert.equal(pointDecision.status, "prepared");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(pointRequestEntry.projector(pointDecision, pointRequest, state)).filter(
        ([key]) => ["user_id", "point_id", "approver_user_id"].includes(key),
      ),
    ),
    {
      user_id: "collaborator-user-6",
      point_id: "point-7",
      approver_user_id: "collaborator-user-8",
    },
  );

  const evaluationEntry = entry("tb_rh.score_avaliacoes");
  const evaluation = {
    id: 9,
    col_id: 10,
    trimestre: "2026-Q2",
    user_id: 11,
    tipo: 0,
    avaliador: 1,
    status: 1,
    p1: 4,
    n1: 3,
    obs1: "boa entrega",
    p2: 0,
    n2: 5,
  };
  const scoreDecision = decision(evaluationEntry, evaluation, state);
  assert.equal(scoreDecision.status, "prepared");
  const scorePayload = evaluationEntry.projector(scoreDecision, evaluation, state);
  assert.equal(scorePayload.score_id, "score-10-2026-Q2");
  assert.equal(scorePayload.evaluator_id, "user-11");
  assert.deepEqual(scorePayload.answers, [
    { question_id: "question-4", answer: 3, obs: "boa entrega" },
  ]);
  assert.equal(scorePayload.average_score, 3);

  const messageEntry = entry("tb_rh.solicitacoes_mensagens");
  const message = {
    id: 12,
    solicitacao: 13,
    remetente: 14,
    tipo: 0,
    data_envio: "2026-08-01 11:00:00",
    mensagem: "Retorno",
  };
  const messageDecision = decision(messageEntry, message, state);
  assert.equal(messageDecision.status, "prepared");
  const messagePayload = messageEntry.projector(messageDecision, message, state);
  assert.equal(messagePayload.request_id, "request-13");
  assert.equal(messagePayload.sender_user_id, "collaborator-user-14");
});

test("pergunta legada não resolvida coloca a avaliação em quarentena", () => {
  const runtimeEntry = entry("tb_rh.score_avaliacoes");
  const row = {
    id: 9,
    col_id: 10,
    trimestre: "2026-Q2",
    user_id: 0,
    tipo: 0,
    avaliador: 0,
    status: 1,
    p1: 44,
    n1: 5,
  };
  const state = completeRuntimeState({ resolveQuestion: () => null });
  const emission = decision(runtimeEntry, row, state);

  assert.equal(emission.status, "quarantine");
  assert.equal(emission.field, "p1");
  assert.equal(emission.reasonCode, "QUESTION_REFERENCE_NOT_FOUND");
});

test("referência obrigatória não nula sem candidato sempre fica em quarentena", () => {
  const cases = [
    ["tb_pessoal.ldd", { id: 1, cliente: 44, tipo: "LDD" }, "resolveClient", "cliente"],
    [
      "tb_rh.pontos_solicitacoes",
      {
        id: 2,
        colaborador: 3,
        ponto: 44,
        entrada: "08:00",
        justificativa: "x",
        data: "2026-08-01",
      },
      "resolvePoint",
      "ponto",
    ],
    [
      "tb_rh.solicitacoes_mensagens",
      { id: 3, solicitacao: 44, remetente: 4, tipo: 0, data_envio: "2026-08-01", mensagem: "x" },
      "resolveRequest",
      "solicitacao",
    ],
  ];

  for (const [sourceTable, row, missingResolver, field] of cases) {
    const runtimeEntry = entry(sourceTable);
    const state = completeRuntimeState({ [missingResolver]: () => null });
    const emission = decision(runtimeEntry, row, state);
    assert.equal(emission.status, "quarantine", sourceTable);
    assert.equal(emission.field, field, sourceTable);
  }
});

test("aggregates JSON acrescentam somente o campo legado de propriedade do step", () => {
  const existingAllergy = { name: "Pó", sources: "Casa", treatment: "Evitar" };
  const existingContact = { name: "Ana", relation: "Irmã", phone: "71999999999" };
  const state = completeRuntimeState({
    resolveCollaboratorUser: () => resolved("user-7"),
    readUserJson: (_userId, field) =>
      userJsonState("legacy", field === "allergies" ? [existingAllergy] : [existingContact]),
  });

  const allergyEntry = entry("tb_rh.alergias");
  const allergyRow = {
    id: 1,
    colaborador_id: 7,
    nome: "Abelha",
    fontes: "Picada",
    tratativo: "Antialérgico",
  };
  const allergyDecision = decision(allergyEntry, allergyRow, state);
  assert.deepEqual(allergyEntry.projector(allergyDecision, allergyRow, state), {
    id: "user-7",
    allergies: [{ name: "Abelha", sources: "Picada", treatment: "Antialérgico" }],
  });
  assert.equal(allergyEntry.contract.write.kind, "replace_owned_aggregate");
  assert.equal(allergyEntry.contract.cleanup.kind, "replace_owned_aggregate");
  assert.deepEqual(allergyEntry.contract.cleanup.ownedColumns, ["allergies"]);

  const contactEntry = entry("tb_rh.contatos_emergencia");
  const contactRow = {
    id: 2,
    colaborador_id: 7,
    nome: "Bruno",
    referencia: "Pai",
    numero: "7133334444",
  };
  const contactDecision = decision(contactEntry, contactRow, state);
  assert.deepEqual(contactEntry.projector(contactDecision, contactRow, state), {
    id: "user-7",
    emergency_contacts: [{ name: "Bruno", relation: "Pai", phone: "7133334444" }],
  });
  assert.equal(contactEntry.contract.write.kind, "replace_owned_aggregate");
  assert.equal(contactEntry.contract.cleanup.kind, "replace_owned_aggregate");
  assert.deepEqual(contactEntry.contract.cleanup.ownedColumns, ["emergency_contacts"]);
});

test("aggregate JSON preserva duas linhas do mesmo usuário em ordem determinística", () => {
  const existingAllergy = { name: "existente", sources: null, treatment: null };
  const state = completeRuntimeState({
    resolveCollaboratorUser: () => resolved("user-2"),
    readUserJson: () => userJsonState("legacy", [existingAllergy]),
  });
  const rows = [
    {
      id: 5,
      colaborador_id: 2,
      nome: "alergia B",
      fontes: "fonte B",
      tratativo: "tratamento B",
    },
    {
      id: 4,
      colaborador_id: 2,
      nome: "alergia A",
      fontes: "fonte A",
      tratativo: "tratamento A",
    },
  ];
  const runtimeEntry = entry("tb_rh.alergias");
  const emission = decision(runtimeEntry, rows[0], state);
  const expected = {
    id: "user-2",
    allergies: [
      { name: "alergia A", sources: "fonte A", treatment: "tratamento A" },
      { name: "alergia B", sources: "fonte B", treatment: "tratamento B" },
    ],
  };

  assert.deepEqual(runtimeEntry.projector(emission, rows, state), expected);
  assert.deepEqual(runtimeEntry.projector(emission, [...rows].reverse(), state), expected);
});

test("projeção aggregate é pura mesmo quando outra linha é projetada entre repetições", () => {
  let readCount = 0;
  const state = completeRuntimeState({
    resolveCollaboratorUser: () => resolved("user-2"),
    readUserJson: () => {
      readCount += 1;
      return userJsonState("empty");
    },
  });
  const runtimeEntry = entry("tb_rh.alergias");
  const row = {
    id: 4,
    colaborador_id: 2,
    nome: "alergia A",
    fontes: "fonte A",
    tratativo: "tratamento A",
  };
  const otherRow = {
    id: 5,
    colaborador_id: 2,
    nome: "alergia B",
    fontes: "fonte B",
    tratativo: "tratamento B",
  };
  const emission = decision(runtimeEntry, row, state);
  const first = runtimeEntry.projector(emission, row, state);

  runtimeEntry.projector(decision(runtimeEntry, otherRow, state), otherRow, state);

  assert.deepEqual(runtimeEntry.projector(emission, row, state), first);
  assert.equal(readCount, 5);
});

test("aggregate preserva filhos legados distintos mesmo quando o conteúdo é igual", () => {
  const existing = { name: "Abelha", sources: "Picada", treatment: "Antialérgico" };
  const state = completeRuntimeState({
    resolveCollaboratorUser: () => resolved("user-7"),
    readUserJson: () => userJsonState("legacy", [existing]),
  });
  const runtimeEntry = entry("tb_rh.alergias");
  const row = {
    id: 1,
    colaborador_id: 7,
    nome: "Abelha",
    fontes: "Picada",
    tratativo: "Antialérgico",
  };
  const emission = decision(runtimeEntry, row, state);

  assert.deepEqual(runtimeEntry.projector(emission, [row, { ...row, id: 2 }], state), {
    id: "user-7",
    allergies: [existing, existing],
  });
});

test("aggregate bloqueia estado JSON ausente ou valor nativo desconhecido antes da projeção", () => {
  const runtimeEntry = entry("tb_rh.alergias");
  const row = {
    id: 1,
    colaborador_id: 7,
    nome: "Abelha",
    fontes: "Picada",
    tratativo: "Antialérgico",
  };
  const missingState = buildRhPessoalRuntimeState({
    resolveCollaboratorUser: () => resolved("user-7"),
  });
  const nativeState = completeRuntimeState({
    resolveCollaboratorUser: () => resolved("user-7"),
    readUserJson: () => userJsonState("native", [{ name: "registro atual" }]),
  });

  assert.deepEqual(
    (({ status, field, reasonCode }) => ({ status, field, reasonCode }))(
      decision(runtimeEntry, row, missingState),
    ),
    {
      status: "quarantine",
      field: "allergies",
      reasonCode: "USER_JSON_STATE_NOT_PROVIDED",
    },
  );
  assert.deepEqual(
    (({ status, field, reasonCode }) => ({ status, field, reasonCode }))(
      decision(runtimeEntry, row, nativeState),
    ),
    {
      status: "quarantine",
      field: "allergies",
      reasonCode: "USER_JSON_NATIVE_VALUE_PRESENT",
    },
  );
});

test("aggregate substitui explicitamente JSON nativo vazio", () => {
  const runtimeEntry = entry("tb_rh.alergias");
  const row = {
    id: 1,
    colaborador_id: 7,
    nome: "Abelha",
    fontes: "Picada",
    tratativo: "Antialérgico",
  };
  const state = completeRuntimeState({
    resolveCollaboratorUser: () => resolved("user-7"),
    readUserJson: () => userJsonState("native"),
  });
  const emission = decision(runtimeEntry, row, state);

  assert.equal(emission.status, "prepared");
  assert.deepEqual(runtimeEntry.projector(emission, row, state), {
    id: "user-7",
    allergies: [{ name: "Abelha", sources: "Picada", treatment: "Antialérgico" }],
  });
});

test("aggregate coloca em quarentena JSON legado inválido", () => {
  const runtimeEntry = entry("tb_rh.contatos_emergencia");
  const state = completeRuntimeState({
    resolveCollaboratorUser: () => resolved("user-7"),
    readUserJson: () => "json legado inválido",
  });
  const emission = decision(
    runtimeEntry,
    { id: 2, colaborador_id: 7, nome: "Contato", referencia: "Pai", numero: "7133334444" },
    state,
  );

  assert.deepEqual((({ status, field, reasonCode }) => ({ status, field, reasonCode }))(emission), {
    status: "quarantine",
    field: "emergency_contacts",
    reasonCode: "USER_JSON_READ_FAILED",
  });
});

test("aggregate deduplica replay da mesma identidade de origem", () => {
  const state = completeRuntimeState({
    resolveCollaboratorUser: () => resolved("user-7"),
    readUserJson: () => userJsonState("empty"),
  });
  const runtimeEntry = entry("tb_rh.contatos_emergencia");
  const row = {
    id: 2,
    colaborador_id: 7,
    nome: "Bruno",
    referencia: "Pai",
    numero: "7133334444",
  };
  const emission = decision(runtimeEntry, row, state);

  assert.deepEqual(
    runtimeEntry.projector(emission, [row, { ...row, numero: "99999999999" }], state),
    {
      id: "user-7",
      emergency_contacts: [{ name: "Bruno", relation: "Pai", phone: "7133334444" }],
    },
  );
});

test("aggregate com colaborador ausente não tenta ler JSON de usuário inexistente", () => {
  const runtimeEntry = entry("tb_rh.contatos_emergencia");
  const state = completeRuntimeState({
    resolveCollaboratorUser: () => ({ state: "zero", id: null }),
    readUserJson: () => {
      throw new Error("não deve executar");
    },
  });
  const emission = decision(
    runtimeEntry,
    { id: 2, colaborador_id: 999, nome: "Contato", referencia: "Pai", numero: "7133334444" },
    state,
  );

  assert.equal(emission.status, "quarantine");
  assert.equal(emission.reasonCode, "USER_REFERENCE_NOT_FOUND");
});

test("estado runtime não expõe acumulador capaz de reter filhos pessoais", () => {
  const state = completeRuntimeState({
    resolveCollaboratorUser: () => resolved("user-7"),
    readUserJson: () => userJsonState("empty"),
  });
  const runtimeEntry = entry("tb_rh.alergias");
  const row = {
    id: 1,
    colaborador_id: 7,
    nome: "SENTINEL_CHILD_NOT_RETAINED",
    fontes: null,
    tratativo: null,
  };
  const emission = decision(runtimeEntry, row, state);

  runtimeEntry.projector(emission, row, state);

  assert.equal(Object.hasOwn(state, "appendUserJson"), false);
  assert.doesNotMatch(JSON.stringify(state), /SENTINEL_CHILD_NOT_RETAINED/);
});

test("folha real com info vazio preserva o default obrigatório não nulo", async () => {
  const runtimeEntry = entry("tb_pessoal.folhas");
  const state = completeRuntimeState();
  let realRow;
  for await (const row of iterateSqlRows(`${LEGACY_DUMP_ROOT}/tb_pessoal.folhas.sql`)) {
    if (String(row.id) === "8") {
      realRow = row;
      break;
    }
  }
  assert.ok(realRow, "tb_pessoal.folhas id=8 ausente do dump aprovado");
  assert.equal(realRow.info, "");

  const emission = decision(runtimeEntry, realRow, state);
  assert.equal(emission.status, "prepared");
  assert.equal(runtimeEntry.projector(emission, realRow, state).info, "");
});

test("normalizações RH preservam códigos legados auditados e horários zero opcionais", () => {
  const state = completeRuntimeState();

  const situationEntry = entry("tb_pessoal.clientes_situacoes");
  const situationBase = {
    id: 1,
    cliente_id: 2,
    titulo: "Situação",
    descricao: "Descrição",
    data_cadastro: "2026-08-01",
    cadastrado_por: 3,
    finalizado_por: 0,
  };
  for (const [status, expected] of [
    [0, "Aberto"],
    [1, "Concluido"],
  ]) {
    const row = { ...situationBase, status };
    const emission = decision(situationEntry, row, state);
    assert.equal(situationEntry.projector(emission, row, state).status, expected);
  }

  const questionEntry = entry("tb_rh.score_perguntas");
  for (const [avaliacao, expected] of [
    [1, "behavioral"],
    [2, "technical"],
    [3, "tech"],
    [4, "leadership"],
  ]) {
    const row = { id: avaliacao, quesito: "Q", avaliacao, status: 1 };
    const emission = decision(questionEntry, row, state);
    assert.equal(questionEntry.projector(emission, row, state).type, expected);
  }

  const messageEntry = entry("tb_rh.solicitacoes_mensagens");
  for (const [tipo, expected] of [
    [0, "Message"],
    [2, "Solution"],
    [3, "Rejection"],
    [4, "Acceptance"],
  ]) {
    const row = {
      id: tipo + 1,
      solicitacao: 2,
      remetente: 3,
      tipo,
      data_envio: "2026-08-01",
      mensagem: "x",
    };
    const emission = decision(messageEntry, row, state);
    assert.equal(messageEntry.projector(emission, row, state).type, expected);
  }

  const pointEntry = entry("tb_rh.pontos_registros");
  const point = {
    id: 1,
    colaborador: 2,
    data: "2026-08-01",
    entrada: "08:00:00",
    saida_almoco: "12:00:00",
    retorno_almoco: "00:00:00",
    saida: "00:00:00",
    assinado: 0,
  };
  const pointDecision = decision(pointEntry, point, state);
  const pointPayload = pointEntry.projector(pointDecision, point, state);
  assert.equal(pointPayload.lunch_in, null);
  assert.equal(pointPayload.clock_out, null);
  assert.equal(pointPayload.signature, null);
  assert.equal(
    pointEntry.projector(pointDecision, { ...point, assinado: 1 }, state).signature,
    "legacy-signed",
  );

  const pointConfigEntry = entry("tb_rh.pontos");
  const invalidConfig = {
    id: 2,
    colaborador: 3,
    entrada: "08:00:00",
    saida_almoco: "12:00:00",
    retorno_almoco: "00:00:00",
    saida: "00:00:00",
  };
  const invalidConfigDecision = decision(pointConfigEntry, invalidConfig, state);
  assert.equal(invalidConfigDecision.status, "quarantine");
  assert.equal(invalidConfigDecision.field, "retorno_almoco");
  assert.equal(invalidConfigDecision.reasonCode, "REQUIRED_TIME_EMPTY");
});

test("credencial só prepara com cifra efêmera e segredo não atravessa contratos ou erros", () => {
  const secret = "SENTINEL_PERSONAL_PASSWORD";
  const runtimeEntry = entry("tb_pessoal.bem");
  const row = { id: 1, empresa: 2, responsavel: 0, usuario: "login", senha: secret };
  const withoutCrypto = buildRhPessoalRuntimeState({
    resolveClient: () => resolved("client-2"),
  });
  const blocked = decision(runtimeEntry, row, withoutCrypto);
  assert.equal(blocked.status, "quarantine");
  assert.equal(blocked.reasonCode, "CREDENTIAL_REQUIRES_ENCRYPTION");
  assert.doesNotMatch(JSON.stringify({ blocked, contract: runtimeEntry.contract }), /SENTINEL/);

  const withCrypto = completeRuntimeState();
  const prepared = decision(runtimeEntry, row, withCrypto);
  assert.equal(prepared.status, "prepared");
  const payload = runtimeEntry.projector(prepared, row, withCrypto);
  assert.equal(payload.senha_main, "encrypted:U0VOVElORUxfUEVSU09OQUxfUEFTU1dPUkQ=");
  assert.doesNotMatch(JSON.stringify(withCrypto), /SENTINEL|encrypted:/);

  const failingCrypto = completeRuntimeState({
    encryptCredential() {
      throw new Error(`falha ao cifrar ${secret}`);
    },
  });
  const failingDecision = decision(runtimeEntry, row, failingCrypto);
  assert.throws(
    () => runtimeEntry.projector(failingDecision, row, failingCrypto),
    (error) => error?.code === "CREDENTIAL_ENCRYPTION_FAILED" && !error.message.includes(secret),
  );
});

test("estado captura callbacks efêmeros sem aceitar mutação posterior das opções", () => {
  const runtimeEntry = entry("tb_pessoal.bem");
  const row = { id: 1, empresa: 2, responsavel: 0, usuario: "login", senha: "segredo" };
  const options = {
    resolveClient: () => resolved("client-2"),
    encryptCredential: () => "cipher-original",
  };
  const state = buildRhPessoalRuntimeState(options);
  options.encryptCredential = () => "cipher-mutada";
  options.resolveClient = () => null;

  const emission = decision(runtimeEntry, row, state);
  assert.equal(emission.status, "prepared");
  assert.equal(runtimeEntry.projector(emission, row, state).senha_main, "cipher-original");
});

test("payload insert contém apenas defaults, constantes e colunas mapeadas", () => {
  const runtimeEntry = entry("tb_rh.score_perguntas");
  const state = completeRuntimeState();
  const row = {
    id: 15,
    quesito: "Qualidade",
    avaliacao: 1,
    status: 1,
    extra_secret: "NÃO DEVE SAIR",
  };
  const emission = decision(runtimeEntry, row, state);

  assert.equal(emission.status, "prepared");
  assert.deepEqual(Object.keys(runtimeEntry.projector(emission, row, state)).sort(), [
    "active",
    "id",
    "organization_id",
    "question",
    "question_id",
    "type",
  ]);
});

test("as 10.375 linhas reais terminam em decisão sanitizada e payload estritamente mapeado", async () => {
  const state = completeRuntimeState();
  let rowCount = 0;

  for (const mappingRule of RH_PESSOAL_RULES) {
    const runtimeEntry = entry(mappingRule.sourceTable);
    const step = mappingRule.destinations[0];
    const allowedPayloadFields = new Set([
      ...Object.keys(step.defaults),
      ...Object.keys(step.constants),
      ...step.columns
        .filter(({ status }) => status === "mapped")
        .map(({ destinationColumn }) => destinationColumn),
    ]);
    for await (const row of iterateSqlRows(`${LEGACY_DUMP_ROOT}/${mappingRule.sourceTable}.sql`)) {
      rowCount += 1;
      const emission = decision(runtimeEntry, row, state);
      assert.ok(["prepared", "quarantine", "not_emitted"].includes(emission.status));
      if (emission.status !== "prepared") continue;
      const payload = runtimeEntry.projector(emission, row, state);
      for (const field of Object.keys(payload)) {
        assert.ok(allowedPayloadFields.has(field), `${mappingRule.sourceTable}.${field}`);
      }
    }
  }

  assert.equal(rowCount, 10_375);
});
