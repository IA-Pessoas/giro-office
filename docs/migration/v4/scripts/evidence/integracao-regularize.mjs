const CONFIRMED = new Map(
  [
    {
      sourceTable: "tb_integracao.grupos",
      references: ["classes/Grupo.php:5", "classes/Grupo.php:14", "classes/Grupo.php:34"],
      relationships: [
        "id identifica o grupo selecionado por tb_integracao.clientes.grupo_id; o cadastro legado preserva nome único por consulta.",
      ],
      current: ["infra/prisma/schema.prisma:684"],
      reason: "O catálogo legado de grupos possui entidade atual equivalente em clients.group.",
    },
    {
      sourceTable: "tb_integracao.pa",
      references: ["classes/PA.php:11", "classes/PA.php:30", "classes/PA.php:39"],
      relationships: [
        "cliente_id referencia tb_integracao.clientes.id e o legado mantém no máximo um PA por cliente.",
      ],
      current: ["infra/prisma/schema.prisma:624"],
      reason: "O panorama PA por cliente possui identidade e campos equivalentes em clients.pa.",
    },
    {
      sourceTable: "tb_integracao.pa_historicos",
      references: ["classes/PA.php:50", "classes/PA.php:58", "classes/PA.php:81"],
      relationships: [
        "cliente_id referencia tb_integracao.clientes.id e user_id referencia tb_admin.usuarios.id.",
      ],
      current: ["infra/prisma/schema.prisma:656"],
      reason: "Cada evento do histórico de PA possui destino fiel em clients.history.",
    },
    {
      sourceTable: "tb_integracao.tarefas_dependentes",
      references: ["classes/Tarefa.php:119", "classes/Tarefa.php:1000", "classes/Tarefa.php:1036"],
      relationships: [
        "tarefa_express_id e dependente_id referenciam duas linhas distintas de tb_integracao.tarefas_express.",
      ],
      current: [
        "infra/prisma/schema.prisma:800",
        "services/task-service/src/services/taskDependentService.ts:49",
      ],
      reason:
        "A dependência entre modelos possui contrato atual equivalente e proíbe auto-relação.",
    },
    {
      sourceTable: "tb_integracao.tarefas_express_distrato",
      references: [
        "classes/Tarefa.php:684",
        "classes/Tarefa.php:1112",
        "classes/Colaborador.php:250",
      ],
      relationships: [
        "id identifica o catálogo de modelos; nome e departamento vinculam as ocorrências de tb_integracao.tarefas_distrato sem derivar novos modelos das ocorrências.",
        "responsáveis referenciam tb_admin.usuarios e precisam pertencer ao departamento explícito do modelo.",
      ],
      current: [
        "infra/prisma/schema.prisma:774",
        "services/task-service/src/services/taskModelService.ts:117",
      ],
      reason:
        "O catálogo legado de distrato corresponde a TaskModel e preserva a origem do modelo mesmo quando o backup não contém linhas.",
    },
    {
      sourceTable: "tb_integracao.tarefas_regularize",
      references: ["classes/Tarefa.php:28", "classes/Tarefa.php:186", "classes/Tarefa.php:833"],
      relationships: [
        "tarefa referencia tb_integracao.tarefas_express.id e vinculo descreve o tipo Regularize associado.",
      ],
      current: [
        "infra/prisma/schema.prisma:1655",
        "services/task-service/src/services/taskIntegrationRegularizeService.ts:42",
      ],
      reason:
        "O vínculo entre modelo de tarefa e tipo Regularize possui contrato atual equivalente.",
    },
    {
      sourceTable: "tb_regularize.grupos",
      references: ["classes/Grupo.php:101", "classes/Grupo.php:110", "classes/Grupo.php:142"],
      relationships: [
        "id é referenciado por tb_regularize.grupos_integrantes.grupo_id e situacao controla a ativação do grupo.",
      ],
      current: ["infra/prisma/schema.prisma:684"],
      reason: "O grupo Regularize possui entidade atual equivalente em clients.group.",
    },
    {
      sourceTable: "tb_regularize.grupos_integrantes",
      references: [
        "classes/Grupo.php:150",
        "classes/Grupo.php:158",
        "regularize/pages/relatorios/padrao.php:769",
      ],
      relationships: [
        "codigo_cliente referencia tb_regularize.clientes.codigo e grupo_id referencia tb_regularize.grupos.id.",
      ],
      current: ["infra/prisma/schema.prisma:695"],
      reason: "A associação explícita cliente-grupo possui destino fiel em clients.clientsGroup.",
    },
    {
      sourceTable: "tb_regularize.orientaoes_processual.atividades",
      references: [
        "classes/Processo.php:277",
        "classes/Processo.php:281",
        "regularize/ajax/processo.php:34",
      ],
      relationships: [
        "op_id referencia tb_regularize.orientaoes_processual.id; atividade é conteúdo filho, enquanto cliente_id é redundância de contexto e não uma FK para catálogo.",
      ],
      current: [
        "infra/prisma/schema.prisma:1580",
        "services/regularize-service/src/schemas/guidance.schemas.ts:3",
        "services/regularize-service/src/services/guidanceService.ts:122",
      ],
      reason:
        "As atividades filhas agregam no JSON economic_activities da orientação, sem fabricar relação com o catálogo homônimo.",
    },
    {
      sourceTable: "tb_regularize.pf",
      references: ["classes/PF.php:4", "classes/PF.php:14", "classes/PF.php:16"],
      relationships: [
        "codigo é a identidade legada usada por processos, vencimentos e participações em empresas.",
      ],
      current: [
        "infra/prisma/schema.prisma:740",
        "services/regularize-service/src/services/clientPfService.ts:66",
      ],
      reason: "O cadastro PF possui contrato atual equivalente em clients.pf.",
    },
    {
      sourceTable: "tb_regularize.pf_empresas",
      references: ["classes/PF.php:90", "classes/PF.php:100", "regularize/pages/pf/pf.php:118"],
      relationships: [
        "pf_id referencia tb_regularize.pf.codigo e empresa_id referencia tb_regularize.clientes.codigo.",
      ],
      current: [
        "infra/prisma/schema.prisma:1607",
        "services/regularize-service/src/services/partnersService.ts:32",
      ],
      reason: "A participação PF-PJ possui destino fiel em regularize.partners.",
    },
    {
      sourceTable: "tb_regularize.vencimento",
      references: ["classes/PF.php:53", "classes/PF.php:62", "regularize/pages/pf/pf.php:120"],
      relationships: [
        "referente referencia tb_regularize.pf.codigo e tipo seleciona explicitamente Identidade ou CNH.",
      ],
      current: [
        "infra/prisma/schema.prisma:740",
        "services/regularize-service/src/services/clientPfService.ts:8",
      ],
      reason:
        "Datas de expedição e vencimento agregam por tipo nos campos RG ou CNH do mesmo ClientPF resolvido.",
    },
  ].map((item) => [item.sourceTable, item]),
);

const PENDING = new Map([
  [
    "tb_integracao.tarefas_distrato",
    {
      relationships: [
        "cliente_id, departamento_id e responsáveis são vínculos explícitos, mas a ocorrência não armazena o evento, a competência nem uma chave de Project.",
        "O evento tipo 2 de tb_historico.integracao guarda cliente e competência sem FK para as tarefas; há clientes sem evento e com eventos múltiplos no backup.",
      ],
      reasonCode: "CURRENT_CONTRACT_NOT_FAITHFUL",
      reason:
        "Não é possível vincular cada lote de tarefas a um Project fiel: o CRUD copia o catálogo por evento, porém a tabela final omite a identidade do evento e a competência usada na geração.",
    },
  ],
  [
    "tb_regularize.agenda",
    {
      relationships: [
        "status referencia tb_regularize.agenda_status, cliente_id referencia tb_regularize.clientes.codigo e o gerador legado copia a ocorrência do mês anterior sem armazenar identidade de série.",
      ],
      reasonCode: "CURRENT_CONTRACT_NOT_FAITHFUL",
      reason:
        "O backup contém ocorrências recorrentes já materializadas e datas deslocadas por calendário, sem identidade de série; não é possível reconstruir fielmente um único template recorrente atual.",
    },
  ],
]);

const LEGACY_USAGE = [
  ["tb_integracao.admin_tarefas", "backend/tb_integracao.admin_tarefas.sql:27", []],
  ["tb_integracao.admin_urgencias", "classes/Usuario.php:947", ["delete", "insert", "select"]],
  ["tb_integracao.agenda", "classes/Agenda.php:10", ["delete", "insert", "select", "update"]],
  ["tb_integracao.agenda_horas", "classes/Horas.php:14", ["insert", "select", "update"]],
  ["tb_integracao.agenda_locais", "integracao/pages/agenda/agenda.php:18", ["select"]],
  ["tb_integracao.agenda_status", "integracao/pages/agenda/agenda.php:13", ["select"]],
  ["tb_integracao.bloqueio", "classes/Usuario.php:917", ["insert", "select", "update"]],
  ["tb_integracao.cobradores_solucoes", "classes/Tarefa.php:1072", ["insert", "select"]],
  ["tb_integracao.cobrancas_novas", "classes/Cliente.php:336", ["delete", "insert", "select"]],
  ["tb_integracao.cobrancas_solucoes", "backend/tb_integracao.cobrancas_solucoes.sql:27", []],
  ["tb_integracao.cronograma", "classes/Agenda.php:123", ["insert", "select", "update"]],
  ["tb_integracao.envios", "classes/Cliente.php:453", ["insert", "select", "update"]],
  ["tb_integracao.fluxos", "classes/Tarefa.php:1481", ["insert", "select", "update"]],
  ["tb_integracao.fluxos_clientes", "classes/Tarefa.php:146", ["insert", "select", "update"]],
  ["tb_integracao.grupos", "classes/Grupo.php:14", ["insert", "select", "update"]],
  ["tb_integracao.metricas", "classes/Metrica.php:110", ["insert", "select", "update"]],
  ["tb_integracao.objetivos", "classes/Historico.php:28", ["insert", "select", "update"]],
  ["tb_integracao.pa", "classes/Cliente.php:361", ["delete", "insert", "select", "update"]],
  [
    "tb_integracao.pa_historicos",
    "classes/Cliente.php:385",
    ["delete", "insert", "select", "update"],
  ],
  [
    "tb_integracao.pa_historicos_pendentes",
    "classes/Cliente.php:375",
    ["delete", "insert", "select"],
  ],
  ["tb_integracao.padrinhos", "classes/Usuario.php:804", ["insert", "select", "update"]],
  ["tb_integracao.portes", "classes/Cliente.php:1499", ["select"]],
  [
    "tb_integracao.prospeccao_metricas",
    "integracao/pages/relatorios/padrao.php:1391",
    ["insert", "update"],
  ],
  [
    "tb_integracao.prospeccao_metricas_periodo",
    "integracao/pages/relatorios/padrao.php:1438",
    ["insert", "update"],
  ],
  [
    "tb_integracao.prospeccao_paralisacoes",
    "comercial/pages/prospeccoes/editar.php:102",
    ["insert", "select", "update"],
  ],
  [
    "tb_integracao.prospeccoes_reset",
    "classes/Prospeccao.php:260",
    ["delete", "insert", "select", "update"],
  ],
  ["tb_integracao.responsaveis_projeto", "classes/Cliente.php:509", ["insert", "select", "update"]],
  ["tb_integracao.segmentos", "classes/Segmento.php:10", ["insert", "select", "update"]],
  ["tb_integracao.tarefas_concluir", "classes/Tarefa.php:64", ["delete", "insert", "select"]],
  ["tb_integracao.tarefas_contratadas", "comercial/pages/cobrancas/cobrancas.php:18", ["select"]],
  ["tb_integracao.tarefas_dependentes", "classes/Tarefa.php:1000", ["delete", "insert", "select"]],
  [
    "tb_integracao.tarefas_distrato",
    "classes/Cliente.php:347",
    ["delete", "insert", "select", "update"],
  ],
  ["tb_integracao.tarefas_distrato_imagens", "classes/Tarefa.php:975", ["insert", "select"]],
  ["tb_integracao.tarefas_docs", "integracao/pages/tarefas/editar-tarefa.php:133", ["insert"]],
  [
    "tb_integracao.tarefas_express_distrato",
    "classes/Colaborador.php:250",
    ["insert", "select", "update"],
  ],
  ["tb_integracao.tarefas_imagens", "classes/Tarefa.php:964", ["insert", "select", "update"]],
  ["tb_integracao.tarefas_indicadores", "classes/Tarefa.php:1335", ["insert", "select", "update"]],
  ["tb_integracao.tarefas_justificativa", "classes/Tarefa.php:405", ["insert", "select", "update"]],
  ["tb_integracao.tarefas_ordem", "classes/Tarefa.php:10", ["insert", "select", "update"]],
  ["tb_integracao.tarefas_parceiros", "classes/Tarefa.php:1381", ["insert", "select", "update"]],
  ["tb_integracao.tarefas_regularize", "classes/Prospeccao.php:99", ["insert", "select", "update"]],
  ["tb_integracao.tarefas_total", "classes/Historico.php:286", ["insert", "select", "update"]],
  ["tb_regularize.agenda", "classes/Agenda.php:231", ["insert", "select", "update"]],
  ["tb_regularize.agenda_controle", "classes/Agenda.php:268", ["insert", "select"]],
  ["tb_regularize.agenda_status", "contabil/pages/agenda/agenda.php:14", ["select"]],
  ["tb_regularize.alvaras_vencimentos", "classes/Cliente.php:1832", ["insert", "select", "update"]],
  ["tb_regularize.atividades", "classes/Processo.php:284", ["insert", "select"]],
  ["tb_regularize.clientes_competencia", "classes/Cliente.php:837", ["insert", "update"]],
  [
    "tb_regularize.clientes_dominio_logos",
    "classes/Cliente.php:813",
    ["insert", "select", "update"],
  ],
  ["tb_regularize.clientes_licitacoes", "classes/Cliente.php:574", ["insert", "select", "update"]],
  ["tb_regularize.controle_inativar", "classes/Cliente.php:759", ["insert", "select"]],
  ["tb_regularize.coringa", "classes/Cliente.php:10", ["insert", "select", "update"]],
  ["tb_regularize.coringa_status", "classes/Pdf.php:701", ["select"]],
  ["tb_regularize.distrato_checklist", "classes/Tarefa.php:1562", ["insert", "select", "update"]],
  ["tb_regularize.dte", "classes/Fiscal.php:1532", ["insert", "select", "update"]],
  ["tb_regularize.dte_status", "classes/Fiscal.php:1554", ["insert", "select", "update"]],
  ["tb_regularize.grupos", "classes/Grupo.php:101", ["insert", "select", "update"]],
  ["tb_regularize.grupos_integrantes", "classes/Grupo.php:150", ["insert", "select"]],
  [
    "tb_regularize.orientaoes_checklist",
    "classes/Processo.php:345",
    ["insert", "select", "update"],
  ],
  [
    "tb_regularize.orientaoes_filiais",
    "classes/Processo.php:230",
    ["delete", "insert", "select", "update"],
  ],
  [
    "tb_regularize.orientaoes_processual.atividades",
    "classes/Processo.php:277",
    ["insert", "select", "update"],
  ],
  ["tb_regularize.permissoes_senhas", "classes/Usuario.php:738", ["insert", "select", "update"]],
  ["tb_regularize.pf", "classes/PF.php:4", ["insert", "select", "update"]],
  ["tb_regularize.pf_empresas", "classes/PF.php:90", ["insert", "select", "update"]],
  ["tb_regularize.processos_dias", "classes/Processo.php:121", ["insert", "select"]],
  ["tb_regularize.regimes", "classes/Cliente.php:1214", ["insert", "select", "update"]],
  ["tb_regularize.sites_estado", "classes/Sites.php:43", ["insert", "select", "update"]],
  ["tb_regularize.sites_prefeituras", "classes/Sites.php:13", ["insert", "select", "update"]],
  ["tb_regularize.vencimento", "classes/PF.php:53", ["insert", "select", "update"]],
];

export const INTEGRACAO_REGULARIZE_SOURCE_TABLES = Object.freeze(
  LEGACY_USAGE.map(([sourceTable]) => sourceTable),
);

export const INTEGRACAO_REGULARIZE_EVIDENCE = Object.freeze(
  LEGACY_USAGE.map(([sourceTable, fallbackReference, operations]) => {
    const confirmed = CONFIRMED.get(sourceTable);
    if (confirmed !== undefined) {
      return decision({
        sourceTable,
        legacyModule: moduleFromSourceTable(sourceTable),
        legacyReferences: confirmed.references,
        operations,
        legacyRelationships: confirmed.relationships,
        currentContractEvidence: confirmed.current,
        finalStatus: "confirmed",
        reasonCode: "LEGACY_BEHAVIOR_CONFIRMED",
        reason: confirmed.reason,
        confidence: "high",
        ruleId: `integracao-regularize:${sourceTable}`,
      });
    }

    const pending = PENDING.get(sourceTable);
    const withoutBehavior = operations.length === 0;
    return decision({
      sourceTable,
      legacyModule: moduleFromSourceTable(sourceTable),
      legacyReferences: [fallbackReference],
      operations,
      legacyRelationships: pending?.relationships ?? [],
      currentContractEvidence: [],
      finalStatus: "pending",
      reasonCode:
        pending?.reasonCode ??
        (withoutBehavior ? "NO_LEGACY_CODE_REFERENCE" : "CURRENT_CONTRACT_NOT_FAITHFUL"),
      reason:
        pending?.reason ??
        (withoutBehavior
          ? "Somente o artefato estrutural legado foi localizado; sem comportamento executável não há base para confirmar uma adaptação."
          : "O comportamento legado não possui destino atual integral e comprovado; a origem permanece pending sem sugerir destino parcial."),
      confidence: "low",
      ruleId: null,
    });
  }),
);

function moduleFromSourceTable(sourceTable) {
  return sourceTable.startsWith("tb_integracao.") ? "integracao" : "regularize";
}

function decision(value) {
  return Object.freeze({
    ...value,
    legacyReferences: Object.freeze([...value.legacyReferences]),
    operations: Object.freeze([...value.operations]),
    legacyRelationships: Object.freeze([...value.legacyRelationships]),
    currentContractEvidence: Object.freeze([...value.currentContractEvidence]),
  });
}
