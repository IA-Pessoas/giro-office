export interface ActivityDescription {
  action: string;
  item: string;
}

export type ActivityClassification =
  | { kind: "visible"; description: ActivityDescription }
  | { kind: "technical" }
  | { kind: "unknown" };

interface ResourceCopy {
  singular: string;
  newSingular: string;
  plural: string;
}

interface ResourceRule extends ResourceCopy {
  pattern: RegExp;
}

interface ExplicitRule {
  methods: readonly string[];
  pattern: RegExp;
  description: ActivityDescription;
}

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const IDENTIFIER_SEGMENT = /^(?:\{[^/]+\}|\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{24,})$/i;

function normalizePath(rawPath: string): string | null {
  if (!rawPath.startsWith("/")) return null;

  try {
    const pathname = new URL(rawPath, "http://localhost").pathname.replace(/\/{2,}/g, "/");
    return pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

const TECHNICAL_RULES = [
  /^\/(?:health|ready|openapi\.json)\/?$/,
  /^\/dashboard(?:\/|$)/,
  /^\/audit(?:\/|$)/,
  /^\/internal(?:\/|$)/,
  /^\/user\/(?:session|start-config|me)(?:\/|$)/,
  /^\/platform\/(?:session|me|audit)(?:\/|$)/,
  /^\/project\/metrics$/,
  /^\/ti\/dashboard\/?$/,
  /^\/pessoal\/overview\/?$/,
  /^\/triagem\/overview\/?$/,
  /^\/triagem\/competencies\/[^/]+\/history$/,
] as const;

const EXPLICIT_RULES: ExplicitRule[] = [
  {
    methods: ["POST"],
    pattern: /^\/task\/project-wizard$/,
    description: { action: "criou", item: "um projeto com tarefas" },
  },
  {
    methods: ["POST"],
    pattern: /^\/task\/project-wizard\/extract-tasks$/,
    description: { action: "extraiu", item: "tarefas de uma Ata com IA" },
  },
  {
    methods: ["POST"],
    pattern: /^\/task\/project-wizard\/preview$/,
    description: { action: "gerou", item: "uma prévia de projeto com tarefas" },
  },
  {
    methods: ["POST"],
    pattern: /^\/platform\/organizations\/[^/]+\/users$/,
    description: { action: "criou", item: "um usuário da organização" },
  },
  {
    methods: ["POST"],
    pattern: /^\/platform\/organizations$/,
    description: { action: "criou", item: "uma organização" },
  },
  {
    methods: ["GET"],
    pattern: /^\/commercial\/prospecting\/clients$/,
    description: { action: "consultou", item: "a lista de clientes para prospecção" },
  },
  {
    methods: ["GET"],
    pattern: /^\/commercial\/outbox\/status$/,
    description: { action: "consultou", item: "o estado de entrega da outbox comercial" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/pessoal\/groups\/[^/]+$/,
    description: { action: "arquivou", item: "um grupo de pessoal" },
  },
  {
    methods: ["POST"],
    pattern: /^\/pessoal\/groups\/[^/]+\/reactivate$/,
    description: { action: "reativou", item: "um grupo de pessoal" },
  },
  {
    methods: ["GET"],
    pattern: /^\/pessoal\/group-assignments\/eligible$/,
    description: { action: "consultou", item: "os clientes elegíveis para atribuição de grupo" },
  },
  {
    methods: ["POST"],
    pattern: /^\/pessoal\/group-assignments\/previews$/,
    description: { action: "gerou", item: "uma prévia de atribuição de grupo" },
  },
  {
    methods: ["GET"],
    pattern: /^\/pessoal\/group-assignments\/previews\/[^/]+$/,
    description: { action: "consultou", item: "uma prévia de atribuição de grupo" },
  },
  {
    methods: ["POST"],
    pattern: /^\/pessoal\/group-assignments\/apply$/,
    description: { action: "aplicou", item: "uma atribuição de grupo" },
  },
  {
    methods: ["GET"],
    pattern: /^\/platform\/organizations$/,
    description: { action: "consultou", item: "a lista global de organizações" },
  },
  {
    methods: ["GET"],
    pattern: /^\/platform\/organizations\/[^/]+$/,
    description: { action: "consultou", item: "uma organização" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/platform\/organizations\/[^/]+\/status$/,
    description: { action: "alterou", item: "o status de uma organização" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/platform\/organizations\/[^/]+\/subscription-plan$/,
    description: { action: "alterou", item: "o plano de uma organização" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/platform\/organizations\/[^/]+\/logo-url$/,
    description: { action: "atualizou", item: "a marca de uma organização" },
  },
  {
    methods: ["GET"],
    pattern: /^\/platform\/organizations\/[^/]+\/users$/,
    description: { action: "consultou", item: "a lista global de usuários da organização" },
  },
  {
    methods: ["GET"],
    pattern: /^\/platform\/organizations\/[^/]+\/users\/[^/]+$/,
    description: { action: "consultou", item: "um usuário da organização" },
  },
  {
    methods: ["GET"],
    pattern: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/permissions$/,
    description: { action: "consultou", item: "as permissões de um usuário da organização" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/platform\/organizations\/[^/]+\/users\/[^/]+$/,
    description: { action: "atualizou", item: "um usuário da organização" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/permissions$/,
    description: { action: "alterou", item: "as permissões de um usuário da organização" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/platform\/organizations\/[^/]+\/users\/[^/]+$/,
    description: { action: "desativou", item: "um usuário da organização" },
  },
  {
    methods: ["POST"],
    pattern: /^\/platform\/organizations\/[^/]+\/users\/[^/]+\/reactivate$/,
    description: { action: "reativou", item: "um usuário da organização" },
  },
  {
    methods: ["POST"],
    pattern: /^\/platform\/organizations\/[^/]+\/ownership-transfer$/,
    description: { action: "transferiu", item: "o ownership da organização" },
  },
  {
    methods: ["GET"],
    pattern: /^\/platform\/organizations\/[^/]+\/departments$/,
    description: { action: "consultou", item: "os departamentos da organização" },
  },
  {
    methods: ["GET"],
    pattern: /^\/reports\/catalog$/,
    description: { action: "consultou", item: "o catálogo de relatórios" },
  },
  {
    methods: ["POST"],
    pattern: /^\/reports\/definitions\/validate$/,
    description: { action: "revisou", item: "a configuração de um relatório" },
  },
  {
    methods: ["POST"],
    pattern: /^\/reports\/preview$/,
    description: { action: "gerou", item: "uma prévia de relatório" },
  },
  {
    methods: ["GET"],
    pattern: /^\/reports\/jobs\/list$/,
    description: { action: "consultou", item: "o histórico de relatórios" },
  },
  {
    methods: ["GET"],
    pattern: /^\/reports\/jobs\/[^/]+$/,
    description: { action: "consultou", item: "um job de relatório" },
  },
  {
    methods: ["POST"],
    pattern: /^\/reports\/jobs$/,
    description: { action: "gerou", item: "um relatório" },
  },
  {
    methods: ["POST"],
    pattern: /^\/reports\/jobs\/[^/]+\/cancel$/,
    description: { action: "cancelou", item: "um job de relatório" },
  },
  {
    methods: ["GET"],
    pattern: /^\/reports\/jobs\/[^/]+\/snapshot$/,
    description: { action: "consultou", item: "um snapshot de relatório" },
  },
  {
    methods: ["GET"],
    pattern: /^\/reports\/snapshots\/[^/]+\/export$/,
    description: { action: "exportou", item: "um snapshot de relatório" },
  },
  {
    methods: ["POST"],
    pattern: /^\/reports\/snapshots\/[^/]+\/delete$/,
    description: { action: "excluiu", item: "um snapshot de relatório" },
  },
  {
    methods: ["GET"],
    pattern: /^\/reports\/retention$/,
    description: { action: "consultou", item: "a política de retenção de relatórios" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/reports\/retention$/,
    description: { action: "alterou", item: "a política de retenção de relatórios" },
  },
  {
    methods: ["POST"],
    pattern: /^\/reports\/models\/shared$/,
    description: { action: "cadastrou", item: "um modelo compartilhado de relatório" },
  },
  {
    methods: ["GET"],
    pattern: /^\/reports\/models\/shared\/list$/,
    description: { action: "consultou", item: "a lista de modelos compartilhados de relatório" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/reports\/models\/shared\/[^/]+$/,
    description: { action: "atualizou", item: "um modelo compartilhado de relatório" },
  },
  {
    methods: ["POST"],
    pattern: /^\/reports\/models\/shared\/[^/]+\/copy$/,
    description: { action: "copiou", item: "um modelo compartilhado de relatório" },
  },
  {
    methods: ["POST"],
    pattern: /^\/reports\/models\/shared\/[^/]+\/preview$/,
    description: { action: "gerou", item: "uma prévia de modelo compartilhado de relatório" },
  },
  {
    methods: ["PATCH", "PUT"],
    pattern: /^\/organizations\/[^/]+\/status$/,
    description: { action: "alterou", item: "o status de uma organização" },
  },
  {
    methods: ["PATCH", "PUT"],
    pattern: /^\/organizations\/[^/]+\/subscription-plan$/,
    description: { action: "alterou", item: "o plano de uma organização" },
  },
  {
    methods: ["PATCH", "PUT", "POST"],
    pattern: /^\/organizations\/[^/]+\/logo-url$/,
    description: { action: "atualizou", item: "a marca de uma organização" },
  },
  {
    methods: ["PATCH", "PUT", "POST", "DELETE"],
    pattern: /^\/user\/[^/]+\/photo$/,
    description: { action: "atualizou", item: "a foto de um usuário" },
  },
  {
    methods: ["PATCH", "PUT"],
    pattern: /^\/user\/permission\/[^/]+$/,
    description: { action: "alterou", item: "as permissões de um usuário" },
  },
  {
    methods: ["POST", "PATCH"],
    pattern: /^\/client\/[^/]+\/activate$/,
    description: { action: "ativou", item: "um cliente" },
  },
  {
    methods: ["POST", "PATCH", "PUT"],
    pattern: /^\/client\/[^/]+\/(?:integration|pa|commercial|termination|finance|regularize)$/,
    description: { action: "atualizou", item: "os dados de um cliente" },
  },
  {
    methods: ["POST", "PATCH", "PUT"],
    pattern: /^\/task\/(?:conclusion|complete-request)$/,
    description: { action: "concluiu", item: "uma tarefa" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/task\/complete-request$/,
    description: { action: "cancelou", item: "uma solicitação de conclusão de tarefa" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/complete-request\/list$/,
    description: { action: "consultou", item: "o histórico de conclusão de uma tarefa" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/task\/reopen$/,
    description: { action: "reabriu", item: "uma tarefa" },
  },
  {
    methods: ["POST"],
    pattern: /^\/task\/postponement$/,
    description: { action: "prorrogou", item: "uma tarefa" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/postponement\/list$/,
    description: { action: "consultou", item: "o histórico de prorrogações de uma tarefa" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/notifications$/,
    description: { action: "consultou", item: "as notificações operacionais" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/task\/notifications\/read$/,
    description: { action: "marcou como lida", item: "uma notificação operacional" },
  },
  {
    methods: ["POST"],
    pattern: /^\/task\/attachment$/,
    description: { action: "anexou", item: "um comprovante a uma tarefa" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/task\/attachment$/,
    description: { action: "removeu", item: "um anexo de uma tarefa" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/attachment\/list$/,
    description: { action: "consultou", item: "os anexos de uma tarefa" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/attachment\/access$/,
    description: { action: "abriu", item: "um anexo de uma tarefa" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/financeiro\/queue$/,
    description: { action: "consultou", item: "a fila de cobrança financeira" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/financeiro\/collectors$/,
    description: { action: "consultou", item: "os cobradores de um departamento" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/task\/financeiro\/collectors$/,
    description: { action: "configurou", item: "os cobradores de um departamento" },
  },
  {
    methods: ["POST"],
    pattern: /^\/task\/financeiro\/settle$/,
    description: { action: "deu baixa financeira em", item: "tarefas" },
  },
  {
    methods: ["POST"],
    pattern: /^\/task\/financeiro\/express$/,
    description: { action: "deu Baixa Express em", item: "tarefas de um cliente" },
  },
  {
    methods: ["GET"],
    pattern: /^\/regularize\/dashboard$/,
    description: { action: "consultou", item: "o painel de regularização" },
  },
  {
    methods: ["POST"],
    pattern: /^\/task\/project-plan\/hire$/,
    description: { action: "contratou", item: "um plano de projeto" },
  },
  {
    methods: ["POST"],
    pattern: /^\/project\/progress$/,
    description: { action: "recalculou", item: "o progresso de um projeto" },
  },
  {
    methods: ["POST"],
    pattern: /^\/certificate\/pj\/[^/]+\/file$/,
    description: { action: "enviou", item: "o arquivo de um certificado de pessoa jurídica" },
  },
  {
    methods: ["GET"],
    pattern: /^\/certificate\/pj\/[^/]+\/file$/,
    description: { action: "baixou", item: "o arquivo de um certificado de pessoa jurídica" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/certificate\/pj\/[^/]+\/file$/,
    description: { action: "removeu", item: "o arquivo de um certificado de pessoa jurídica" },
  },
  {
    methods: ["POST"],
    pattern: /^\/certificate\/pf\/[^/]+\/file$/,
    description: { action: "enviou", item: "o arquivo de um certificado de pessoa física" },
  },
  {
    methods: ["GET"],
    pattern: /^\/certificate\/pf\/[^/]+\/file$/,
    description: { action: "baixou", item: "o arquivo de um certificado de pessoa física" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/certificate\/pf\/[^/]+\/file$/,
    description: { action: "removeu", item: "o arquivo de um certificado de pessoa física" },
  },
  {
    methods: ["POST"],
    pattern: /^\/rh\/point\/register$/,
    description: { action: "registrou", item: "um ponto" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/profile\/colaborator$/,
    description: { action: "consultou", item: "o dossiê de um colaborador" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/profile\/colaborator\/list$/,
    description: { action: "consultou", item: "a lista de dossiês de colaboradores" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/profile\/colaborator$/,
    description: { action: "atualizou", item: "o dossiê de um colaborador" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/profile\/contact$/,
    description: { action: "consultou", item: "os contatos de emergência" },
  },
  {
    methods: ["POST"],
    pattern: /^\/rh\/profile\/contact$/,
    description: { action: "cadastrou", item: "um contato de emergência" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/profile\/contact$/,
    description: { action: "atualizou", item: "um contato de emergência" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/rh\/profile\/contact$/,
    description: { action: "removeu", item: "um contato de emergência" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/profile\/allergy$/,
    description: { action: "consultou", item: "as alergias de um colaborador" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/profile\/allergy$/,
    description: { action: "atualizou", item: "as alergias de um colaborador" },
  },
  {
    methods: ["POST", "PATCH"],
    pattern: /^\/rh\/point\/[^/]+\/calculate$/,
    description: { action: "recalculou", item: "um ponto" },
  },
  {
    methods: ["POST"],
    pattern: /^\/rh\/point\/recalculate$/,
    description: { action: "recalculou", item: "os pontos de um colaborador" },
  },
  {
    methods: ["POST"],
    pattern: /^\/rh\/point\/adjustment\/request$/,
    description: { action: "solicitou", item: "um ajuste de ponto" },
  },
  {
    methods: ["POST"],
    pattern: /^\/rh\/point\/adjustment\/retroactive$/,
    description: { action: "registrou", item: "uma entrada retroativa de ponto" },
  },
  {
    methods: ["POST"],
    pattern: /^\/rh\/point\/adjustment\/[^/]+\/attachment$/,
    description: { action: "anexou", item: "um comprovante de ajuste de ponto" },
  },
  {
    methods: ["POST", "PATCH"],
    pattern: /^\/rh\/point\/adjustment\/approve$/,
    description: { action: "aprovou", item: "um ajuste de ponto" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/point\/adjustment\/approve-bulk$/,
    description: { action: "aprovou", item: "um lote de ajustes de ponto" },
  },
  {
    methods: ["POST"],
    pattern: /^\/rh\/score\/quarters\/generate$/,
    description: { action: "gerou", item: "um ciclo de avaliação" },
  },
  {
    methods: ["POST"],
    pattern: /^\/rh\/score\/evaluations\/submit$/,
    description: { action: "enviou", item: "uma avaliação" },
  },
  {
    methods: ["POST", "PATCH", "PUT"],
    pattern: /^\/rh\/score\/nitro\/update$/,
    description: { action: "atualizou", item: "a pontuação Nitro" },
  },
  {
    methods: ["POST", "PATCH"],
    pattern: /^\/rh\/time-bank-releases\/approve$/,
    description: { action: "aprovou", item: "um lançamento do banco de horas" },
  },
  {
    methods: ["POST", "PATCH"],
    pattern: /^\/rh\/timesheets\/sign$/,
    description: { action: "assinou", item: "uma folha de ponto" },
  },
  {
    methods: ["POST"],
    pattern: /^\/ti\/passwords\/[^/]+\/deactivate$/,
    description: { action: "inativou", item: "uma credencial de TI" },
  },
  {
    methods: ["POST", "PATCH"],
    pattern: /^\/ti\/inventory\/[^/]+\/assign-user$/,
    description: { action: "atribuiu", item: "um item de inventário" },
  },
  {
    methods: ["POST", "PATCH"],
    pattern: /^\/ti\/inventory\/[^/]+\/return$/,
    description: { action: "registrou", item: "a devolução de um item de inventário" },
  },
  {
    methods: ["GET"],
    pattern: /^\/ti\/stock$/,
    description: { action: "consultou", item: "o estoque de TI" },
  },
  {
    methods: ["POST"],
    pattern: /^\/ti\/stock\/items\/[^/]+\/entries$/,
    description: { action: "registrou", item: "uma entrada de estoque" },
  },
  {
    methods: ["POST"],
    pattern: /^\/ti\/stock\/items\/[^/]+\/exits$/,
    description: { action: "registrou", item: "uma saída de estoque" },
  },
  {
    methods: ["POST", "PATCH"],
    pattern: /^\/ti\/requests\/[^/]+\/assign$/,
    description: { action: "atribuiu", item: "uma solicitação de TI" },
  },
  {
    methods: ["POST", "PATCH"],
    pattern: /^\/ti\/requests\/[^/]+\/status$/,
    description: { action: "alterou", item: "o status de uma solicitação de TI" },
  },
  {
    methods: ["POST"],
    pattern: /^\/ti\/requests\/[^/]+\/messages$/,
    description: { action: "enviou", item: "uma mensagem em uma solicitação de TI" },
  },
  {
    methods: ["POST"],
    pattern: /^\/ti\/terms\/[^/]+\/sign$/,
    description: { action: "assinou", item: "um termo de TI" },
  },
  {
    methods: ["POST"],
    pattern: /^\/regularize\/guidance\/activity\/add$/,
    description: { action: "adicionou", item: "uma atividade à orientação de regularização" },
  },
  {
    methods: ["POST", "DELETE"],
    pattern: /^\/regularize\/guidance\/activity\/remove$/,
    description: { action: "removeu", item: "uma atividade da orientação de regularização" },
  },
  {
    methods: ["POST"],
    pattern: /^\/regularize\/guidance\/partner\/add$/,
    description: { action: "adicionou", item: "um sócio à orientação de regularização" },
  },
  {
    methods: ["POST", "DELETE"],
    pattern: /^\/regularize\/guidance\/partner\/remove$/,
    description: { action: "removeu", item: "um sócio da orientação de regularização" },
  },
  {
    methods: ["POST"],
    pattern: /^\/pessoal\/obrigations\/competences\/[^/]+\/generate$/,
    description: { action: "gerou", item: "obrigações da competência" },
  },
  {
    methods: ["GET"],
    pattern: /^\/parcelamento\/installments\/[^/]+\/competencies$/,
    description: { action: "consultou", item: "as competências de um parcelamento" },
  },
  {
    methods: ["POST"],
    pattern: /^\/parcelamento\/installments\/[^/]+\/competencies$/,
    description: { action: "cadastrou", item: "uma nova competência de um parcelamento" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/parcelamento\/installment-competencies\/[^/]+$/,
    description: { action: "atualizou", item: "uma competência de parcelamento" },
  },
  {
    methods: ["POST"],
    pattern: /^\/parcelamento\/panoramas\/competences\/[^/]+\/generate$/,
    description: { action: "gerou", item: "panoramas de parcelamento" },
  },
  {
    methods: ["GET"],
    pattern: /^\/user\/[^/]+\/photo$/,
    description: { action: "consultou", item: "a foto de um usuário" },
  },
  {
    methods: ["GET"],
    pattern: /^\/user\/permission\/[^/]+$/,
    description: { action: "consultou", item: "as permissões de um usuário" },
  },
  {
    methods: ["POST"],
    pattern: /^\/client\/integration$/,
    description: { action: "cadastrou", item: "um novo cliente pela integração" },
  },
  {
    methods: ["GET"],
    pattern: /^\/client\/[^/]+\/pa$/,
    description: { action: "consultou", item: "o PA de um cliente" },
  },
  {
    methods: ["GET"],
    pattern: /^\/client\/[^/]+\/histories\/[^/]+\/file$/,
    description: { action: "baixou", item: "o arquivo de um histórico de cliente" },
  },
  {
    methods: ["POST"],
    pattern: /^\/client\/[^/]+\/histories\/pending$/,
    description: { action: "criou", item: "uma pendência de histórico de cliente" },
  },
  {
    methods: ["GET"],
    pattern: /^\/client\/histories\/pending$/,
    description: { action: "consultou", item: "a lista de pendências de histórico" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/client\/histories\/pending\/[^/]+$/,
    description: { action: "removeu", item: "uma pendência de histórico" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/model\/dependent$/,
    description: { action: "consultou", item: "os dependentes de um modelo de tarefa" },
  },
  {
    methods: ["POST"],
    pattern: /^\/task\/model\/dependent$/,
    description: { action: "adicionou", item: "um dependente a um modelo de tarefa" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/task\/model\/dependent$/,
    description: { action: "removeu", item: "um dependente de um modelo de tarefa" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/integration$/,
    description: { action: "consultou", item: "os vínculos de integração de tarefa" },
  },
  {
    methods: ["POST"],
    pattern: /^\/task\/integration$/,
    description: { action: "criou", item: "um vínculo de integração de tarefa" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/task\/integration$/,
    description: { action: "removeu", item: "um vínculo de integração de tarefa" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/task\/financeiro$/,
    description: { action: "atualizou", item: "uma cobrança financeira" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/task\/comercial$/,
    description: { action: "atualizou", item: "uma cobrança comercial" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/deps\/list$/,
    description: { action: "consultou", item: "a lista de departamentos com modelos de tarefa" },
  },
  {
    methods: ["GET"],
    pattern: /^\/task\/deps\/options$/,
    description: { action: "consultou", item: "as opções de modelos de tarefa" },
  },
  {
    methods: ["GET"],
    pattern: /^\/regularize\/guidance\/detail$/,
    description: { action: "consultou", item: "os detalhes de uma orientação de regularização" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/point\/me\/today$/,
    description: { action: "consultou", item: "o ponto do dia" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/point\/summary$/,
    description: { action: "consultou", item: "o resumo mensal de ponto" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/point\/adjustment\/approve$/,
    description: { action: "aprovou", item: "um ajuste de ponto" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/point\/adjustment\/reject$/,
    description: { action: "rejeitou", item: "um ajuste de ponto" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/point\/adjustment\/requests$/,
    description: { action: "consultou", item: "a lista de solicitações de ajuste de ponto" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/timesheets\/reopen$/,
    description: { action: "reabriu", item: "uma folha de ponto assinada" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/timesheets\/rebuild$/,
    description: { action: "reconstruiu", item: "uma folha de ponto aberta" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/timesheets\/[^/]+\/pdf$/,
    description: { action: "baixou", item: "o PDF de uma folha de ponto" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/rh\/score\/quarters\/nitro$/,
    description: { action: "atualizou", item: "a pontuação Nitro de um ciclo de avaliação" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/score\/quarters\/me$/,
    description: { action: "consultou", item: "a lista de ciclos de avaliação" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/score\/evaluations\/pending$/,
    description: { action: "consultou", item: "a lista de avaliações pendentes" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/time-bank\/summary(?:\/[^/]+)?$/,
    description: { action: "consultou", item: "o resumo de um banco de horas" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/time-bank\/overview$/,
    description: { action: "consultou", item: "a visão geral do banco de horas" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/time-bank-releases\/approve$/,
    description: { action: "aprovou", item: "um lançamento do banco de horas" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/timesheets\/sign$/,
    description: { action: "assinou", item: "uma folha de ponto" },
  },
  {
    methods: ["POST"],
    pattern: /^\/rh\/messages$/,
    description: { action: "enviou", item: "uma mensagem em uma solicitação de RH" },
  },
  {
    methods: ["GET"],
    pattern: /^\/rh\/notifications$/,
    description: { action: "consultou", item: "as notificações de solicitações de RH" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/rh\/notifications\/read$/,
    description: { action: "marcou", item: "notificações de solicitações de RH como lidas" },
  },
  {
    methods: ["GET"],
    pattern: /^\/contabil\/responsibles\/client\/[^/]+$/,
    description: { action: "consultou", item: "o responsável contábil de um cliente" },
  },
  {
    methods: ["GET"],
    pattern: /^\/contabil\/relationships\/client\/[^/]+$/,
    description: { action: "consultou", item: "o vínculo contábil de um cliente" },
  },
  {
    methods: ["GET"],
    pattern: /^\/triagem\/(?:monthly|statements)\/?.*$/,
    description: { action: "consultou", item: "as pendências documentais contábeis" },
  },
  {
    methods: ["GET"],
    pattern: /^\/triagem\/external-links\/?$/,
    description: { action: "consultou", item: "os links externos da Triagem" },
  },
  {
    methods: ["GET"],
    pattern: /^\/triagem\/catalogs\/?$/,
    description: { action: "consultou", item: "os catálogos operacionais da Triagem" },
  },
  {
    methods: ["POST"],
    pattern: /^\/triagem\/catalogs\/?$/,
    description: { action: "cadastrou", item: "um item de catálogo da Triagem" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/triagem\/catalogs\/[^/]+\/archive\/?$/,
    description: { action: "arquivou", item: "um item de catálogo da Triagem" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/triagem\/catalogs\/[^/]+\/?$/,
    description: { action: "atualizou", item: "um item de catálogo da Triagem" },
  },
  {
    methods: ["POST"],
    pattern: /^\/triagem\/external-links\/?$/,
    description: { action: "cadastrou", item: "um link externo da Triagem" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/triagem\/external-links\/[^/]+\/?$/,
    description: { action: "atualizou", item: "um link externo da Triagem" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/triagem\/external-links\/[^/]+\/archive\/?$/,
    description: { action: "arquivou", item: "um link externo da Triagem" },
  },
  {
    methods: ["GET"],
    pattern: /^\/triagem\/urgent-requests\/?$/,
    description: { action: "consultou", item: "as solicitações urgentes da Triagem" },
  },
  {
    methods: ["POST"],
    pattern: /^\/triagem\/urgent-requests\/?$/,
    description: { action: "cadastrou", item: "uma solicitação urgente da Triagem" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/triagem\/urgent-requests\/[^/]+\/?$/,
    description: { action: "atualizou", item: "uma solicitação urgente da Triagem" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/triagem\/urgent-requests\/[^/]+\/close\/?$/,
    description: { action: "fechou", item: "uma solicitação urgente da Triagem" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/triagem\/urgent-requests\/[^/]+\/reopen\/?$/,
    description: { action: "reabriu", item: "uma solicitação urgente da Triagem" },
  },
  {
    methods: ["POST"],
    pattern: /^\/contabil\/controls\/year$/,
    description: { action: "criou", item: "os controles contábeis anuais" },
  },
  {
    methods: ["POST"],
    pattern: /^\/contabil\/controls\/restore$/,
    description: { action: "restaurou", item: "uma competência contábil" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/contabil\/controls\/[^/]+\/items$/,
    description: { action: "atualizou", item: "os itens de um controle contábil" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/triagem\/monthly\/[^/]+\/item$/,
    description: { action: "atualizou", item: "uma pendência documental contábil" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/triagem\/monthly\/[^/]+\/items$/,
    description: { action: "atualizou", item: "as pendências documentais contábeis" },
  },
  {
    methods: ["GET"],
    pattern: /^\/triagem\/closing$/,
    description: { action: "consultou", item: "o fechamento recebido" },
  },
  {
    methods: ["PUT"],
    pattern: /^\/triagem\/closing$/,
    description: { action: "atualizou", item: "o fechamento recebido" },
  },
  {
    methods: ["DELETE"],
    pattern: /^\/triagem\/closing$/,
    description: { action: "arquivou", item: "o fechamento recebido" },
  },
  {
    methods: ["GET"],
    pattern: /^\/triagem\/editability$/,
    description: { action: "consultou", item: "a permissão de edição da triagem" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/triagem\/competencies\/[^/]+\/archive$/,
    description: { action: "arquivou", item: "uma competência mensal da Triagem" },
  },
  {
    methods: ["GET"],
    pattern: /^\/ti\/stock\/items\/[^/]+\/movements\/list$/,
    description: { action: "consultou", item: "a lista de movimentações de um item de estoque" },
  },
  {
    methods: ["GET"],
    pattern: /^\/ti\/requests\/[^/]+\/transfer-candidates$/,
    description: {
      action: "consultou",
      item: "os candidatos de transferência de uma solicitação de TI",
    },
  },
  {
    methods: ["GET"],
    pattern: /^\/ti\/requests\/[^/]+\/messages$/,
    description: { action: "consultou", item: "as mensagens de uma solicitação de TI" },
  },
  {
    methods: ["PATCH"],
    pattern: /^\/ti\/terms\/[^/]+\/sign$/,
    description: { action: "assinou", item: "um termo de TI" },
  },
];

const RESOURCE_RULES: ResourceRule[] = [
  {
    pattern: /^\/pessoal\/groups(?:\/|$)/,
    singular: "um grupo de pessoal",
    newSingular: "um novo grupo de pessoal",
    plural: "grupos de pessoal",
  },
  {
    pattern: /^\/commercial\/proposal-configs(?:\/|$)/,
    singular: "uma configuração de proposta comercial",
    newSingular: "uma nova configuração de proposta comercial",
    plural: "configurações de proposta comercial",
  },
  {
    pattern: /^\/commercial\/prospecting(?:\/|$)/,
    singular: "uma prospecção comercial",
    newSingular: "uma nova prospecção comercial",
    plural: "prospecções comerciais",
  },
  {
    pattern: /^\/commercial\/task-billing(?:\/|$)/,
    singular: "uma cobrança comercial de tarefa",
    newSingular: "uma nova cobrança comercial de tarefa",
    plural: "cobranças comerciais de tarefas",
  },
  {
    pattern: /^\/reports\/models\/shared(?:\/|$)/,
    singular: "um modelo compartilhado de relatório",
    newSingular: "um novo modelo compartilhado de relatório",
    plural: "modelos compartilhados de relatório",
  },
  {
    pattern: /^\/reports\/models(?:\/|$)/,
    singular: "um modelo pessoal de relatório",
    newSingular: "um novo modelo pessoal de relatório",
    plural: "modelos pessoais de relatório",
  },
  {
    pattern: /^\/task\/project-plan\/task(?:\/|$)/,
    singular: "uma tarefa do plano de projeto",
    newSingular: "uma nova tarefa no plano de projeto",
    plural: "tarefas do plano de projeto",
  },
  {
    pattern: /^\/task\/project-plan(?:\/|$)/,
    singular: "um plano de projeto",
    newSingular: "um novo plano de projeto",
    plural: "planos de projeto",
  },
  {
    pattern: /^\/task\/model(?:\/|$)/,
    singular: "um modelo de tarefa",
    newSingular: "um novo modelo de tarefa",
    plural: "modelos de tarefa",
  },
  {
    pattern: /^\/task(?:\/|$)/,
    singular: "uma tarefa",
    newSingular: "uma nova tarefa",
    plural: "tarefas",
  },
  {
    pattern: /^\/user(?:\/|$)/,
    singular: "um usuário",
    newSingular: "um novo usuário",
    plural: "usuários",
  },
  {
    pattern: /^\/organizations(?:\/|$)/,
    singular: "uma organização",
    newSingular: "uma nova organização",
    plural: "organizações",
  },
  {
    pattern: /^\/department(?:\/|$)/,
    singular: "um departamento",
    newSingular: "um novo departamento",
    plural: "departamentos",
  },
  {
    pattern: /^\/project(?:\/|$)/,
    singular: "um projeto",
    newSingular: "um novo projeto",
    plural: "projetos",
  },
  {
    pattern: /^\/client\/[^/]+\/histories(?:\/|$)/,
    singular: "um histórico de cliente",
    newSingular: "um novo histórico de cliente",
    plural: "históricos de cliente",
  },
  {
    pattern: /^\/client(?:\/|$)/,
    singular: "um cliente",
    newSingular: "um novo cliente",
    plural: "clientes",
  },
  {
    pattern: /^\/regularize\/(?:passwords?|sites-pass(?:-detail)?)(?:\/|$)/,
    singular: "uma credencial de regularização",
    newSingular: "uma nova credencial de regularização",
    plural: "credenciais de regularização",
  },
  {
    pattern: /^\/regularize\/(?:pf|pfs)(?:\/|$)/,
    singular: "uma pessoa física da regularização",
    newSingular: "uma nova pessoa física na regularização",
    plural: "pessoas físicas da regularização",
  },
  {
    pattern: /^\/regularize\/(?:partner|partners)(?:\/|$)/,
    singular: "um sócio",
    newSingular: "um novo sócio",
    plural: "sócios",
  },
  {
    pattern: /^\/regularize\/municipal-taxes(?:-detail)?(?:\/|$)/,
    singular: "um tributo municipal",
    newSingular: "um novo tributo municipal",
    plural: "tributos municipais",
  },
  {
    pattern: /^\/regularize\/(?:process|processes)(?:\/|$)/,
    singular: "um processo de regularização",
    newSingular: "um novo processo de regularização",
    plural: "processos de regularização",
  },
  {
    pattern: /^\/regularize\/guidance(?:\/|$)/,
    singular: "uma orientação de regularização",
    newSingular: "uma nova orientação de regularização",
    plural: "orientações de regularização",
  },
  {
    pattern: /^\/regularize\/(?:license|licenses)(?:\/|$)/,
    singular: "uma licença",
    newSingular: "uma nova licença",
    plural: "licenças",
  },
  {
    pattern: /^\/fiscal\/ncm(?:-search)?(?:\/|$)/,
    singular: "um NCM",
    newSingular: "um novo NCM",
    plural: "NCMs",
  },
  {
    pattern: /^\/fiscal\/icms(?:\/|$)/,
    singular: "uma regra de ICMS",
    newSingular: "uma nova regra de ICMS",
    plural: "regras de ICMS",
  },
  {
    pattern: /^\/fiscal\/ipi(?:\/|$)/,
    singular: "uma regra de IPI",
    newSingular: "uma nova regra de IPI",
    plural: "regras de IPI",
  },
  {
    pattern: /^\/contabil\/controls(?:\/|$)/,
    singular: "um controle contábil",
    newSingular: "um novo controle contábil",
    plural: "controles contábeis",
  },
  {
    pattern: /^\/contabil\/responsibles(?:\/|$)/,
    singular: "um responsável contábil",
    newSingular: "um novo responsável contábil",
    plural: "responsáveis contábeis",
  },
  {
    pattern: /^\/contabil\/relationships(?:\/|$)/,
    singular: "um vínculo contábil",
    newSingular: "um novo vínculo contábil",
    plural: "vínculos contábeis",
  },
  {
    pattern: /^\/triagem\/monthly(?:\/|$)/,
    singular: "uma pendência documental contábil",
    newSingular: "uma nova pendência documental contábil",
    plural: "pendências documentais contábeis",
  },
  {
    pattern: /^\/triagem\/statements(?:\/|$)/,
    singular: "um marcador de extrato bancário",
    newSingular: "um novo marcador de extrato bancário",
    plural: "marcadores de extratos bancários",
  },
  {
    pattern: /^\/triagem\/competencies(?:\/|$)/,
    singular: "uma competência mensal da Triagem",
    newSingular: "uma nova competência mensal da Triagem",
    plural: "competências mensais da Triagem",
  },
  {
    pattern: /^\/triagem\/external-links(?:\/|$)/,
    singular: "um link externo da Triagem",
    newSingular: "um novo link externo da Triagem",
    plural: "links externos da Triagem",
  },
  {
    pattern: /^\/triagem\/catalogs(?:\/|$)/,
    singular: "um item de catálogo da Triagem",
    newSingular: "um novo item de catálogo da Triagem",
    plural: "itens de catálogo da Triagem",
  },
  {
    pattern: /^\/triagem\/urgent-requests(?:\/|$)/,
    singular: "uma solicitação urgente da Triagem",
    newSingular: "uma nova solicitação urgente da Triagem",
    plural: "solicitações urgentes da Triagem",
  },
  {
    pattern: /^\/rh\/point-config(?:\/|$)/,
    singular: "uma configuração de ponto",
    newSingular: "uma nova configuração de ponto",
    plural: "configurações de ponto",
  },
  {
    pattern: /^\/rh\/point\/adjustment(?:\/|$)/,
    singular: "um ajuste de ponto",
    newSingular: "um novo ajuste de ponto",
    plural: "ajustes de ponto",
  },
  {
    pattern: /^\/rh\/point(?:\/|$)/,
    singular: "um registro de ponto",
    newSingular: "um novo registro de ponto",
    plural: "registros de ponto",
  },
  {
    pattern: /^\/rh\/categories(?:\/|$)/,
    singular: "uma categoria de RH",
    newSingular: "uma nova categoria de RH",
    plural: "categorias de RH",
  },
  {
    pattern: /^\/rh\/operational-users(?:\/|$)/,
    singular: "um usuário operacional",
    newSingular: "um novo usuário operacional",
    plural: "usuários operacionais",
  },
  {
    pattern: /^\/rh\/requests(?:\/|$)/,
    singular: "uma solicitação de RH",
    newSingular: "uma nova solicitação de RH",
    plural: "solicitações de RH",
  },
  {
    pattern: /^\/rh\/score\/questions(?:\/|$)/,
    singular: "uma pergunta de avaliação",
    newSingular: "uma nova pergunta de avaliação",
    plural: "perguntas de avaliação",
  },
  {
    pattern: /^\/rh\/score\/quarters(?:\/|$)/,
    singular: "um ciclo de avaliação",
    newSingular: "um novo ciclo de avaliação",
    plural: "ciclos de avaliação",
  },
  {
    pattern: /^\/rh\/score\/evaluations(?:\/|$)/,
    singular: "uma avaliação",
    newSingular: "uma nova avaliação",
    plural: "avaliações",
  },
  {
    pattern: /^\/rh\/holidays(?:\/|$)/,
    singular: "um feriado",
    newSingular: "um novo feriado",
    plural: "feriados",
  },
  {
    pattern: /^\/rh\/time-bank-releases(?:\/|$)/,
    singular: "um lançamento do banco de horas",
    newSingular: "um novo lançamento no banco de horas",
    plural: "lançamentos do banco de horas",
  },
  {
    pattern: /^\/rh\/time-bank(?:\/|$)/,
    singular: "um banco de horas",
    newSingular: "um novo banco de horas",
    plural: "bancos de horas",
  },
  {
    pattern: /^\/rh\/messages(?:\/|$)/,
    singular: "uma mensagem de RH",
    newSingular: "uma nova mensagem de RH",
    plural: "mensagens de RH",
  },
  {
    pattern: /^\/rh\/timesheets(?:\/|$)/,
    singular: "uma folha de ponto",
    newSingular: "uma nova folha de ponto",
    plural: "folhas de ponto",
  },
  {
    pattern: /^\/ti\/inventory-categories(?:\/|$)/,
    singular: "uma categoria de inventário",
    newSingular: "uma nova categoria de inventário",
    plural: "categorias de inventário",
  },
  {
    pattern: /^\/ti\/inventory-locations(?:\/|$)/,
    singular: "um local de inventário",
    newSingular: "um novo local de inventário",
    plural: "locais de inventário",
  },
  {
    pattern: /^\/ti\/inventory(?:\/|$)/,
    singular: "um item de inventário",
    newSingular: "um novo item de inventário",
    plural: "itens de inventário",
  },
  {
    pattern: /^\/ti\/stock\/items(?:\/|$)/,
    singular: "um item de estoque",
    newSingular: "um novo item de estoque",
    plural: "itens de estoque",
  },
  {
    pattern: /^\/ti\/stock\/categories(?:\/|$)/,
    singular: "uma categoria de estoque",
    newSingular: "uma nova categoria de estoque",
    plural: "categorias de estoque",
  },
  {
    pattern: /^\/ti\/stock\/locations(?:\/|$)/,
    singular: "um local de estoque",
    newSingular: "um novo local de estoque",
    plural: "locais de estoque",
  },
  {
    pattern: /^\/ti\/robots\/[^/]+\/runs(?:\/|$)/,
    singular: "uma execução de robô",
    newSingular: "uma nova execução de robô",
    plural: "execuções de robô",
  },
  {
    pattern: /^\/ti\/robots(?:\/|$)/,
    singular: "um robô",
    newSingular: "um novo robô",
    plural: "robôs",
  },
  {
    pattern: /^\/ti\/requests(?:\/|$)/,
    singular: "uma solicitação de TI",
    newSingular: "uma nova solicitação de TI",
    plural: "solicitações de TI",
  },
  {
    pattern: /^\/ti\/request-categories(?:\/|$)/,
    singular: "uma categoria de solicitação de TI",
    newSingular: "uma nova categoria de solicitação de TI",
    plural: "categorias de solicitação de TI",
  },
  {
    pattern: /^\/ti\/passwords(?:\/|$)/,
    singular: "uma credencial de TI",
    newSingular: "uma nova credencial de TI",
    plural: "credenciais de TI",
  },
  {
    pattern: /^\/ti\/extensions(?:\/|$)/,
    singular: "um ramal",
    newSingular: "um novo ramal",
    plural: "ramais",
  },
  {
    pattern: /^\/ti\/terms(?:\/|$)/,
    singular: "um termo de TI",
    newSingular: "um novo termo de TI",
    plural: "termos de TI",
  },
  {
    pattern: /^\/certificate\/pj(?:\/|$)/,
    singular: "um certificado de pessoa jurídica",
    newSingular: "um novo certificado de pessoa jurídica",
    plural: "certificados de pessoa jurídica",
  },
  {
    pattern: /^\/certificate\/pf(?:\/|$)/,
    singular: "um certificado de pessoa física",
    newSingular: "um novo certificado de pessoa física",
    plural: "certificados de pessoa física",
  },
  {
    pattern: /^\/certificate\/notifications(?:\/|$)/,
    singular: "uma notificação de certificado",
    newSingular: "uma nova notificação de certificado",
    plural: "notificações de certificados",
  },
  {
    pattern: /^\/pessoal\/ldd(?:\/|$)/,
    singular: "um lançamento de departamento pessoal",
    newSingular: "um novo lançamento de departamento pessoal",
    plural: "lançamentos de departamento pessoal",
  },
  {
    pattern: /^\/pessoal\/situations(?:\/|$)/,
    singular: "uma situação trabalhista",
    newSingular: "uma nova situação trabalhista",
    plural: "situações trabalhistas",
  },
  {
    pattern: /^\/pessoal\/unions(?:\/|$)/,
    singular: "um sindicato",
    newSingular: "um novo sindicato",
    plural: "sindicatos",
  },
  {
    pattern: /^\/pessoal\/payroll(?:\/|$)/,
    singular: "uma folha de pagamento",
    newSingular: "uma nova folha de pagamento",
    plural: "folhas de pagamento",
  },
  {
    pattern: /^\/pessoal\/obrigations(?:\/|$)/,
    singular: "uma obrigação trabalhista",
    newSingular: "uma nova obrigação trabalhista",
    plural: "obrigações trabalhistas",
  },
  {
    pattern: /^\/parcelamento\/installments(?:\/|$)/,
    singular: "um parcelamento",
    newSingular: "um novo parcelamento",
    plural: "parcelamentos",
  },
  {
    pattern: /^\/parcelamento\/panoramas(?:\/|$)/,
    singular: "um panorama de parcelamento",
    newSingular: "um novo panorama de parcelamento",
    plural: "panoramas de parcelamento",
  },
  {
    pattern: /^\/pessoal\/passwords(?:\/|$)/,
    singular: "uma credencial do departamento pessoal",
    newSingular: "uma nova credencial do departamento pessoal",
    plural: "credenciais do departamento pessoal",
  },
];

function getCrudSuffix(resource: ResourceRule, path: string): string | null {
  const match = resource.pattern.exec(path);
  if (!match) return null;

  const resourcePath = match[0].replace(/\/$/, "");
  const suffix = path.slice(resourcePath.length);

  if (suffix === "" || suffix === "/list") return suffix;
  if (!suffix.startsWith("/")) return null;

  const identifier = suffix.slice(1);
  return !identifier.includes("/") && IDENTIFIER_SEGMENT.test(identifier) ? suffix : null;
}

export function classifyActivity(method: string, rawPath: string): ActivityClassification {
  const normalizedMethod = method.trim().toUpperCase();
  const path = normalizePath(rawPath);

  if (!HTTP_METHODS.has(normalizedMethod) || !path) return { kind: "unknown" };
  if (TECHNICAL_RULES.some((pattern) => pattern.test(path))) return { kind: "technical" };

  const explicit = EXPLICIT_RULES.find(
    (rule) => rule.methods.includes(normalizedMethod) && rule.pattern.test(path),
  );
  if (explicit) return { kind: "visible", description: explicit.description };

  const resource = RESOURCE_RULES.find((rule) => getCrudSuffix(rule, path) !== null);
  if (!resource) return { kind: "unknown" };

  const isList = getCrudSuffix(resource, path) === "" || path.endsWith("/list");

  if (normalizedMethod === "GET") {
    return {
      kind: "visible",
      description: isList
        ? { action: "consultou", item: `a lista de ${resource.plural}` }
        : { action: "consultou", item: resource.singular },
    };
  }

  if (normalizedMethod === "POST") {
    return {
      kind: "visible",
      description: { action: "cadastrou", item: resource.newSingular },
    };
  }

  if (normalizedMethod === "PUT" || normalizedMethod === "PATCH") {
    return {
      kind: "visible",
      description: { action: "atualizou", item: resource.singular },
    };
  }

  return {
    kind: "visible",
    description: { action: "excluiu", item: resource.singular },
  };
}

export function describeActivity(method: string, rawPath: string): ActivityDescription | null {
  const classification = classifyActivity(method, rawPath);
  return classification.kind === "visible" ? classification.description : null;
}
