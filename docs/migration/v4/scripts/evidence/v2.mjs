function decision({
  sourceTable,
  legacyModule,
  legacyReferences,
  operations,
  legacyRelationships,
  currentContractEvidence,
  reason,
}) {
  return Object.freeze({
    sourceTable,
    legacyModule,
    legacyReferences: Object.freeze(legacyReferences),
    operations: Object.freeze(operations),
    legacyRelationships: Object.freeze(legacyRelationships),
    currentContractEvidence: Object.freeze(currentContractEvidence),
    finalStatus: "confirmed",
    reasonCode: "LEGACY_BEHAVIOR_CONFIRMED",
    reason,
    confidence: "high",
    ruleId: `v2:${sourceTable}`,
  });
}

export const V2_EVIDENCE = Object.freeze([
  decision({
    sourceTable: "tb_admin.departamentos",
    legacyModule: "administração",
    legacyReferences: ["classes/Departamento.php:4", "classes/Departamento.php:14"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "id é referenciado por usuários, modelos e tarefas através de departamento_id.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:224"],
    reason: "CRUD legado e modelo Department atual preservam a entidade departamental.",
  }),
  decision({
    sourceTable: "tb_admin.usuarios",
    legacyModule: "administração",
    legacyReferences: ["classes/Usuario.php:5", "classes/Usuario.php:41"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "id é a identidade administrativa referenciada por tb_rh.colaboradores.user_id.",
      "departamento_id referencia tb_admin.departamentos.id.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:247"],
    reason:
      "O usuário administrativo legado corresponde ao User atual e permanece a identidade base.",
  }),
  decision({
    sourceTable: "tb_rh.colaboradores",
    legacyModule: "recursos humanos",
    legacyReferences: [
      "classes/Colaborador.php:24",
      "classes/Colaborador.php:83",
      "rh/pages/colaboradores/colaborador.php:485",
      "rh/pages/colaboradores/colaborador.php:611",
    ],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "user_id resolve tb_admin.usuarios.id e fornece a faceta cadastral do mesmo usuário.",
      "cargo referencia tb_rh.cargos.id e o legado resolve o nome do cargo antes de exibi-lo.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:247", "infra/prisma/schema.prisma:269"],
    reason:
      "Os dados do colaborador complementam o User; cargo exige resolver a FK legada para nome antes do merge opcional em job_title.",
  }),
  decision({
    sourceTable: "tb_integracao.clientes",
    legacyModule: "integração",
    legacyReferences: ["classes/Cliente.php:177", "classes/Cliente.php:228"],
    operations: ["delete", "insert", "select", "update"],
    legacyRelationships: [
      "id é referenciado por prospecção, projetos lógicos e tarefas através de cliente_id.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:536",
      "services/client-service/src/services/clientService.ts:416",
    ],
    reason: "O cadastro de Integração é a identidade Client base para projetos e tarefas.",
  }),
  decision({
    sourceTable: "tb_regularize.clientes",
    legacyModule: "regularize",
    legacyReferences: ["classes/Cliente.php:535", "classes/Cliente.php:619"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "cliente_id é vínculo explícito opcional para tb_integracao.clientes.id.",
      "codigo permanece identidade própria quando cliente_id não existe.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:536",
      "services/client-service/src/services/clientService.ts:416",
    ],
    reason:
      "O vínculo explícito governa merge; sem vínculo, o cliente Regularize continua entidade própria.",
  }),
  decision({
    sourceTable: "tb_integracao.prospeccao_comercial",
    legacyModule: "integração comercial",
    legacyReferences: ["classes/Prospeccao.php:4", "classes/Prospeccao.php:23"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "cliente_id referencia tb_integracao.clientes.id e identifica a faceta comercial.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:536",
      "infra/prisma/schema.prisma:838",
      "services/project-service/src/services/projectCrudService.ts:125",
    ],
    reason: "Campos comerciais complementam Client e o objetivo operacional produz Project.",
  }),
  decision({
    sourceTable: "tb_integracao.tarefas_express",
    legacyModule: "integração",
    legacyReferences: ["classes/Tarefa.php:767", "classes/Tarefa.php:782"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "departamento_id e responsáveis definem o modelo reutilizável de tarefa.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:774",
      "services/task-service/src/services/taskModelService.ts:144",
    ],
    reason: "A tarefa expressa legada preserva o contrato do TaskModel atual.",
  }),
  decision({
    sourceTable: "tb_integracao.planos",
    legacyModule: "integração",
    legacyReferences: ["classes/Plano.php:4", "classes/Plano.php:13"],
    operations: ["insert", "select", "update"],
    legacyRelationships: ["id é referenciado por tb_integracao.tarefas_planos.plano_id."],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:814",
      "services/task-service/src/services/projectPlanService.ts:166",
    ],
    reason: "O plano legado corresponde diretamente ao ProjectPlan atual.",
  }),
  decision({
    sourceTable: "tb_integracao.tarefas_planos",
    legacyModule: "integração",
    legacyReferences: ["classes/Tarefa.php:1170", "classes/Tarefa.php:1180"],
    operations: ["delete", "insert", "select", "update"],
    legacyRelationships: [
      "plano_id referencia tb_integracao.planos.id.",
      "tarefa_express_id referencia tb_integracao.tarefas_express.id.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:825",
      "services/task-service/src/services/projectPlanService.ts:356",
    ],
    reason: "A ligação ordenada entre plano e modelo corresponde ao ProjectPlanTasks atual.",
  }),
  decision({
    sourceTable: "tb_integracao.tarefas",
    legacyModule: "integração",
    legacyReferences: ["classes/Tarefa.php:11", "classes/Tarefa.php:55"],
    operations: ["delete", "insert", "select", "update"],
    legacyRelationships: [
      "cliente_id deve ser preservado em Task e no Project resolvido ou derivado.",
      "nome e departamento resolvem TaskModel ou originam modelo determinístico.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:857",
      "services/task-service/src/services/taskCrudService.ts:275",
      "services/task-service/src/services/taskModelService.ts:121",
    ],
    reason:
      "O Task atual exige modelo e projeto coerentes com o cliente, demandando resolução ou derivação.",
  }),
  decision({
    sourceTable: "tb_regularize.alvaras",
    legacyModule: "regularize",
    legacyReferences: ["classes/Alvara.php:7", "classes/Alvara.php:18"],
    operations: ["insert", "select", "update"],
    legacyRelationships: ["empresa e cpf_cnpj identificam o cliente do alvará."],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1523",
      "services/regularize-service/src/services/licenseService.ts:60",
    ],
    reason:
      "O alvará legado corresponde diretamente ao License atual com reconciliação de cliente.",
  }),
  decision({
    sourceTable: "tb_regularize.processos",
    legacyModule: "regularize",
    legacyReferences: ["classes/Processo.php:7", "classes/Processo.php:19"],
    operations: ["insert", "select", "update"],
    legacyRelationships: ["cliente e cpf_cnpj identificam a pessoa jurídica relacionada."],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1549",
      "services/regularize-service/src/services/processService.ts:55",
    ],
    reason:
      "O processo legado corresponde ao Process atual; campos sem contrato ficam explicitamente descartados.",
  }),
  decision({
    sourceTable: "tb_regularize.orientaoes_processual",
    legacyModule: "regularize",
    legacyReferences: ["classes/Processo.php:136", "classes/Processo.php:146"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "processo_id pode referenciar tb_regularize.processos.id ou ser zero em orientação autônoma.",
      "cliente_id identifica o cliente usado no processo técnico derivado.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1549",
      "infra/prisma/schema.prisma:1580",
      "services/regularize-service/src/services/guidanceService.ts:25",
    ],
    reason:
      "ProceduralGuidance exige Process, portanto orientações autônomas derivam processo técnico primeiro.",
  }),
  decision({
    sourceTable: "tb_regularize.orientaoes_processual.socios",
    legacyModule: "regularize",
    legacyReferences: ["classes/Processo.php:302", "classes/Processo.php:317"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "op_id referencia tb_regularize.orientaoes_processual.id como coleção filha.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1599",
      "services/regularize-service/src/schemas/guidance.schemas.ts:12",
      "services/regularize-service/src/services/guidanceService.ts:32",
    ],
    reason:
      "Sócios da orientação pertencem ao JSON partners da orientação, não a identidades globais PF/PJ.",
  }),
  decision({
    sourceTable: "tb_regularize.taxas_municipais",
    legacyModule: "regularize",
    legacyReferences: ["classes/Taxas.php:13", "classes/Taxas.php:23"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "cliente referencia o cadastro de cliente Regularize pelo código legado.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1622",
      "services/regularize-service/src/services/municipalTaxesService.ts:89",
    ],
    reason:
      "TFF e TLP legados correspondem ao MunicipalTaxes atual; TLL recebe defaults explícitos.",
  }),
  decision({
    sourceTable: "tb_regularize.clientes_senhas",
    legacyModule: "regularize",
    legacyReferences: ["classes/Cliente.php:665", "regularize/ajax/senhas.php:20"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "empresa referencia tb_regularize.clientes.codigo.",
      "cada conjunto lógico de login e senha representa uma credencial de site independente.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1493",
      "infra/prisma/schema.prisma:1508",
      "services/regularize-service/src/services/passwordService.ts:58",
      "services/regularize-service/src/services/passwordService.ts:66",
    ],
    reason: "A linha larga legada expande em sites lógicos e credenciais 1:N criptografadas.",
  }),
]);
