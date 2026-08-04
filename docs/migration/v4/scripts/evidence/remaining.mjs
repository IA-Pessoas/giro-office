const CONFIRMED = new Map(
  [
    [
      "tb_cbc.emails",
      ["infra/prisma/schema.prisma:910", "services/src/src/services/EmailService.ts:50"],
      "A lista de destinatários e os dois gatilhos de envio possuem contrato atual equivalente.",
      ["Cada linha é um destinatário independente, identificado pelo id legado."],
    ],
    [
      "tb_cbs.estoque",
      ["infra/prisma/schema.prisma:998", "services/ti-service/src/services/tiStockService.ts:104"],
      "O saldo legado vira Stock após resolver item, categoria, localização e departamento pelos vínculos explícitos.",
      [
        "produto_id referencia tb_cbs.estoque_itens.id; localizacao referencia tb_cbs.estoque_localizacoes.id e a categoria é resolvida por tb_cbs.estoque_categorias_itens.",
      ],
    ],
    [
      "tb_cbs.estoque_categorias",
      ["infra/prisma/schema.prisma:985", "services/ti-service/src/services/tiStockService.ts:56"],
      "O catálogo legado de categorias possui entidade atual equivalente em stock.categories.",
      ["departamento_id referencia tb_admin.departamentos.id."],
    ],
    [
      "tb_cbs.estoque_entradas",
      ["infra/prisma/schema.prisma:1019", "services/ti-service/src/services/tiStockService.ts:196"],
      "A entrada de saldo possui entidade atual equivalente em stock.entries.",
      [
        "produto_id referencia tb_cbs.estoque.id, apesar do nome histórico da coluna; repositor referencia tb_admin.usuarios.id.",
      ],
    ],
    [
      "tb_cbs.estoque_inventario",
      [
        "infra/prisma/schema.prisma:1922",
        "services/ti-service/src/services/tiInventoryCategoryService.ts:42",
      ],
      "O catálogo de tipos e tags do inventário possui contrato atual em tecnologia.inventoryCategories.",
      ["tipo_item e tag formam a categoria consumida pelas telas de inventário legado."],
    ],
    [
      "tb_cbs.estoque_localizacoes",
      ["infra/prisma/schema.prisma:970", "services/ti-service/src/services/tiStockService.ts:517"],
      "A localização possui contrato atual e resolve o andar legado antes de normalizar floor.",
      [
        "andar referencia tb_cbs.estoque_andares.id e departamento_id referencia tb_admin.departamentos.id.",
      ],
    ],
    [
      "tb_cbs.estoque_saidas",
      ["infra/prisma/schema.prisma:1033", "services/ti-service/src/services/tiStockService.ts:333"],
      "A saída de saldo possui contrato atual equivalente, com usuários obrigatórios e opcionais explícitos.",
      [
        "produto_id referencia tb_cbs.estoque.id; solicitante, autorizador e operador referenciam tb_admin.usuarios.id.",
      ],
    ],
    [
      "tb_mkt.redes_sociais",
      [
        "infra/prisma/schema.prisma:536",
        "services/client-service/src/services/clientIntegrationService.ts:180",
      ],
      "O Instagram complementa o Client canônico resolvido pelo código Regularize legado.",
      [
        "cliente_id referencia tb_regularize.clientes.codigo; o cliente_id dessa origem governa a identidade canônica V2.",
      ],
    ],
    [
      "tb_mkt.senhas",
      ["infra/prisma/schema.prisma:1283", "services/src/src/services/mkt/PasswordService.ts:20"],
      "A credencial de Marketing possui contrato atual equivalente e exige criptografia antes de emissão.",
      ["local e user são a chave natural verificada pelo CRUD legado; password é segredo."],
    ],
    [
      "tb_pec.notas",
      ["infra/prisma/schema.prisma:1054", "services/src/src/services/NoteService.ts:40"],
      "A nota semanal PEC possui contrato atual equivalente em notes, inclusive continuidade e cliente opcional.",
      [
        "usuario_id referencia tb_admin.usuarios.id; cliente_id referencia tb_regularize.clientes.codigo e zero significa nota interna sem cliente.",
      ],
    ],
    [
      "tb_triagem.campos",
      ["infra/prisma/schema.prisma:2078", "services/src/src/services/triagem/TriageService.ts:36"],
      "Os indicadores fiscais ativos por cliente formam o JSON active_items de triagem.configs.",
      [
        "cliente_id referencia tb_regularize.clientes.codigo; o resolver V2 fornece a identidade Client canônica.",
      ],
    ],
    [
      "tb_workspace.solicitacoes",
      [
        "infra/prisma/schema.prisma:1991",
        "services/ti-service/src/services/tiRequestService.ts:104",
      ],
      "Solicitações do departamento Tecnologia possuem contrato atual fiel em tecnologia.requests.",
      [
        "categoria referencia tb_workspace.solicitacoes_categorias; requerente e atribuido referenciam usuários; departamento precisa resolver Tecnologia.",
      ],
    ],
    [
      "tb_workspace.solicitacoes_categorias",
      [
        "infra/prisma/schema.prisma:2017",
        "services/ti-service/src/services/tiRequestCategoryService.ts:25",
      ],
      "Categorias do departamento Tecnologia possuem contrato atual fiel em tecnologia.request_categories.",
      ["departamento_id referencia tb_admin.departamentos.id e delimita a adaptação ao módulo TI."],
    ],
    [
      "tb_workspace.solicitacoes_mensagens",
      [
        "infra/prisma/schema.prisma:2028",
        "services/ti-service/src/services/tiMessageService.ts:35",
      ],
      "Mensagens de solicitações TI possuem contrato atual, com anexos tratados por capacidade explícita.",
      [
        "solicitacao referencia tb_workspace.solicitacoes.id e remetente referencia tb_admin.usuarios.id.",
      ],
    ],
  ].map(([sourceTable, current, reason, relationships]) => [
    sourceTable,
    { current, reason, relationships },
  ]),
);

const PENDING_OVERRIDES = new Map([
  [
    "tb_cbc.orcamentos",
    {
      current: ["infra/prisma/schema.prisma:1078", "services/src/src/services/BudgetService.ts:45"],
      reasonCode: "PARTIAL_CURRENT_CONTRACT_UNRESOLVED_ADAPTATION",
      reason:
        "O contrato atual parcial Budget preserva departamento, título, status e items em JSON, mas o legado registra cada item como uma linha com categoria, fornecedor e pagamento sem uma identidade explícita do orçamento-pai. Falta comprovar como agrupar as 510 linhas, derivar title/status do Budget e adaptar tb_cbc.orcamentos_categorias sem fabricar cardinalidade.",
      relationships: [
        "categoria referencia tb_cbc.orcamentos_categorias.id; o destino parcial agrupa itens em Budget.items JSON, mas o legado não contém uma chave estável do agrupamento-pai.",
      ],
    },
  ],
  [
    "tb_cbs.ramais",
    {
      current: [
        "infra/prisma/schema.prisma:1908",
        "services/src/src/services/ti/TiAccessService.ts:117",
      ],
      reasonCode: "FUNCTIONAL_FIELD_NO_CURRENT_DESTINATION",
      reason:
        "O destino tecnologia.extensions preserva usuário e número, porém não possui coluna fiel para o tipo funcional do ramal; o backup contém 14 Móvel, 90 Fixo e 90 Computador. Sem autorização explícita de descarte, nenhuma das 194 linhas pode ser emitida parcialmente.",
      relationships: [
        "usuario_id referencia tb_admin.usuarios.id; numero é único por organização no destino, enquanto tipo diferencia Móvel, Fixo e Computador no legado.",
      ],
    },
  ],
]);

const LEGACY_USAGE = [
  [
    "tb.atendimento_documentos",
    "atendimento/pages/clientes/cliente.php:108",
    ["insert", "select", "update"],
  ],
  [
    "tb_cbc.atas",
    "certificado/pages/usuarios/editar-usuario.php:8",
    ["insert", "select", "update"],
  ],
  ["tb_cbc.configs", "classes/Configs.php:17", ["select", "update"]],
  [
    "tb_cbc.emails",
    ["classes/Emails.php:109", "classes/Emails.php:178"],
    ["delete", "insert", "select", "update"],
  ],
  ["tb_cbc.keep_clientes", "classes/Nota.php:107", ["insert", "update"]],
  ["tb_cbc.keep_tags", "classes/Nota.php:118", ["insert", "select", "update"]],
  ["tb_cbc.notificacoes_popup", "ajax/popups.php:11", ["insert"]],
  ["tb_cbc.orcamentos", "classes/Solicitacao.php:375", ["insert", "select", "update"]],
  ["tb_cbc.orcamentos_categorias", "classes/Solicitacao.php:423", ["insert", "select", "update"]],
  [
    "tb_cbc.preferencias",
    "certificado/pages/usuarios/editar-usuario.php:6",
    ["insert", "select", "update"],
  ],
  ["tb_cbc.sininhos", "classes/Parcelamento.php:144", ["delete", "insert", "select", "update"]],
  ["tb_cbs.estoque", "classes/Estoque.php:4", ["insert", "select", "update"]],
  ["tb_cbs.estoque_andares", "classes/Estoque.php:214", ["insert", "select", "update"]],
  ["tb_cbs.estoque_categorias", "classes/Estoque.php:112", ["insert", "select", "update"]],
  ["tb_cbs.estoque_categorias_itens", "classes/Estoque.php:195", ["insert", "select"]],
  ["tb_cbs.estoque_entradas", "classes/Estoque.php:14", ["insert", "select"]],
  ["tb_cbs.estoque_inventario", "classes/Estoque.php:350", ["insert", "select", "update"]],
  ["tb_cbs.estoque_itens", "classes/Estoque.php:157", ["insert", "select", "update"]],
  ["tb_cbs.estoque_localizacoes", "classes/Estoque.php:250", ["insert", "select", "update"]],
  ["tb_cbs.estoque_saidas", "classes/Estoque.php:45", ["insert", "select", "update"]],
  ["tb_cbs.ramais", "classes/Ramais.php:14", ["delete", "insert", "select", "update"]],
  ["tb_historico", "backend/tb_historico.sql:27", []],
  ["tb_historico.admin", "classes/Historico.php:981", ["insert"]],
  ["tb_historico.admin_departamentos", "classes/Historico.php:7", ["insert", "select"]],
  [
    "tb_historico.admin_usuarios",
    "certificado/pages/usuarios/editar-usuario.php:102",
    ["insert", "select"],
  ],
  ["tb_historico.atendimento", "atendimento/pages/viagens/editar.php:149", ["insert"]],
  ["tb_historico.cbs_estoque", "atendimento/pages/estoque/estoque.php:338", ["insert", "select"]],
  ["tb_historico.certificado", "certificado/pages/certificados-pf/pf.php:140", ["insert"]],
  ["tb_historico.comercial", "classes/Historico.php:879", ["insert"]],
  ["tb_historico.contabil", "classes/Historico.php:851", ["insert", "select"]],
  ["tb_historico.financeiro", "classes/Historico.php:1022", ["insert"]],
  ["tb_historico.fiscal", "classes/Historico.php:1014", ["insert"]],
  ["tb_historico.integracao", "classes/Historico.php:870", ["insert", "select", "update"]],
  ["tb_historico.integracao_agenda", "classes/Cliente.php:314", ["delete", "insert"]],
  ["tb_historico.integracao_clientes", "classes/Historico.php:48", ["insert", "select"]],
  ["tb_historico.integracao_clientes_dominio", "classes/Historico.php:54", ["insert"]],
  ["tb_historico.integracao_exclusoes", "classes/Historico.php:475", ["insert"]],
  ["tb_historico.integracao_grupos", "classes/Historico.php:21", ["insert"]],
  ["tb_historico.integracao_objetivos", "classes/Historico.php:29", ["insert"]],
  ["tb_historico.integracao_pas", "classes/Cliente.php:366", ["insert", "select"]],
  [
    "tb_historico.integracao_pas_historicos",
    "classes/Cliente.php:390",
    ["delete", "insert", "select"],
  ],
  ["tb_historico.integracao_planos", "classes/Historico.php:14", ["insert"]],
  ["tb_historico.integracao_prospeccao_comercial", "classes/Cliente.php:406", ["delete", "insert"]],
  ["tb_historico.integracao_tarefas", "classes/Cliente.php:329", ["delete", "insert", "select"]],
  ["tb_historico.integracao_tarefas_distrato", "classes/Cliente.php:356", ["delete", "insert"]],
  [
    "tb_historico.integracao_tarefas_express",
    "classes/Historico.php:309",
    ["delete", "insert", "select"],
  ],
  [
    "tb_historico.integracao_tarefas_express_distrato",
    "classes/Historico.php:483",
    ["insert", "select"],
  ],
  ["tb_historico.keep", "classes/Historico.php:903", ["insert"]],
  ["tb_historico.marketing", "classes/Historico.php:932", ["insert", "select"]],
  ["tb_historico.parcelamento", "classes/Historico.php:944", ["insert", "select"]],
  ["tb_historico.permissoes", "classes/Historico.php:990", ["insert"]],
  ["tb_historico.pessoal", "classes/Historico.php:958", ["insert"]],
  ["tb_historico.regularize", "classes/Historico.php:758", ["insert", "select", "update"]],
  ["tb_historico.rh", "classes/Historico.php:802", ["insert", "select"]],
  ["tb_historico.tecnologia", "classes/Historico.php:823", ["insert", "select"]],
  ["tb_historico.triagem", "classes/Historico.php:835", ["insert"]],
  ["tb_historico.wiki", "classes/Historico.php:971", ["insert"]],
  ["tb_historico.workspace", "classes/Historico.php:1036", ["insert"]],
  ["tb_mkt.controle_ia", "classes/Usuario.php:1015", ["insert", "select", "update"]],
  ["tb_mkt.eventos", "classes/Marketing.php:13", ["insert", "select", "update"]],
  ["tb_mkt.eventos_edicoes", "classes/Marketing.php:107", ["insert", "select", "update"]],
  ["tb_mkt.eventos_feedbacks", "classes/Marketing.php:302", ["insert", "select"]],
  [
    "tb_mkt.eventos_feedbacks_periodos",
    "classes/Marketing.php:267",
    ["insert", "select", "update"],
  ],
  [
    "tb_mkt.redes_sociais",
    "marketing/pages/clientes/cliente.php:6",
    ["insert", "select", "update"],
  ],
  ["tb_mkt.senhas", "classes/Senhas.php:10", ["insert", "select", "update"]],
  ["tb_mkt.solicitacoes", "classes/Sininho.php:137", ["select"]],
  ["tb_pec.notas", "pec/pages/notas/cliente-nota.php:39", ["insert", "select", "update"]],
  ["tb_triagem.campos", "classes/Cliente.php:1275", ["insert", "select", "update"]],
  ["tb_triagem.justificativas", "classes/Cliente.php:1867", ["insert", "select", "update"]],
  ["tb_triagem.prioridade", "classes/Cliente.php:954", ["insert", "select", "update"]],
  ["tb_triagem.qtdnotas", "classes/Solicitacao.php:48", ["insert", "select", "update"]],
  ["tb_triagem.solicitacoes", "classes/Solicitacao.php:40", ["insert", "select", "update"]],
  ["tb_wiki.agenda", "classes/Wiki.php:242", ["insert", "select", "update"]],
  ["tb_wiki.destaques", "classes/Wiki.php:106", ["insert", "select", "update"]],
  ["tb_wiki.wikis", "classes/Wiki.php:51", ["insert", "select", "update"]],
  ["tb_wiki.wikis_categorias", "classes/Wiki.php:15", ["insert", "select", "update"]],
  ["tb_wiki.wikis_topicos", "classes/Wiki.php:197", ["insert", "select", "update"]],
  ["tb_workspace.alteracao_regimes", "classes/Regime.php:139", ["insert", "select", "update"]],
  [
    "tb_workspace.alteracao_regimes_tarefas",
    "classes/Painel.php:1192",
    ["insert", "select", "update"],
  ],
  [
    "tb_workspace.alteracao_regimes_tarefas_express",
    "classes/Regime.php:100",
    ["insert", "select", "update"],
  ],
  [
    "tb_workspace.alteracao_regimes_tipos",
    "classes/Regime.php:190",
    ["insert", "select", "update"],
  ],
  ["tb_workspace.mapas", "classes/Workspace.php:12", ["insert", "select", "update"]],
  ["tb_workspace.mapas_clientes", "classes/Workspace.php:21", ["insert", "select", "update"]],
  ["tb_workspace.natal", "classes/Workspace.php:38", ["insert", "select", "update"]],
  ["tb_workspace.solicitacoes", "classes/Solicitacao.php:451", ["insert", "select", "update"]],
  [
    "tb_workspace.solicitacoes_categorias",
    "classes/Solicitacao.php:595",
    ["insert", "select", "update"],
  ],
  [
    "tb_workspace.solicitacoes_mensagens",
    ["classes/Solicitacao.php:550", "classes/Solicitacao.php:569"],
    ["insert", "select", "update"],
  ],
];

const AUXILIARY_SOURCES = new Set([
  "tb_cbc.keep_tags",
  "tb_cbc.orcamentos_categorias",
  "tb_cbs.estoque_andares",
  "tb_cbs.estoque_categorias_itens",
  "tb_cbs.estoque_itens",
  "tb_triagem.justificativas",
  "tb_workspace.alteracao_regimes_tipos",
]);

const DECLARED_COLUMNS = {
  "tb.atendimento_documentos": [
    "id",
    "tipo",
    "departamento",
    "data_entrada",
    "data_saida",
    "documento",
    "observacao",
    "status",
    "cliente",
    "responsavel",
  ],
  "tb_cbc.atas": ["id", "cadastrante", "titulo", "assunto", "data", "envolvidos"],
  "tb_cbc.configs": ["id", "referente", "valor"],
  "tb_cbc.emails": [
    "id",
    "email",
    "responsavel",
    "cliente_novo_integracao",
    "tarefa_paralisada_integracao",
  ],
  "tb_cbc.keep_clientes": [
    "id",
    "cliente_id",
    "usuario_id",
    "departamento_id",
    "comp",
    "cadastro",
    "anotacao",
    "marcado",
    "marcado_data",
    "tag",
    "fixo",
  ],
  "tb_cbc.keep_tags": ["id", "nome", "departamento_id", "status"],
  "tb_cbc.notificacoes_popup": ["id", "user_id", "modulo_icon", "link", "titulo", "mensagem"],
  "tb_cbc.orcamentos": [
    "id",
    "data",
    "descricao",
    "categoria",
    "quantidade",
    "valor",
    "total",
    "frete",
    "destino",
    "objetivo",
    "solicitante",
    "departamento",
    "fornecedor",
    "cnpj",
    "contato",
    "obs",
    "pagamento",
    "pagamento_tipo",
    "parcelado",
    "status",
  ],
  "tb_cbc.orcamentos_categorias": ["id", "nome"],
  "tb_cbc.preferencias": ["id", "user_id", "updates", "darkmode", "dev"],
  "tb_cbc.sininhos": [
    "id",
    "modulo",
    "referente",
    "mensagem",
    "id_referente",
    "data_cadastro",
    "data_vencimento",
    "col_id",
  ],
  "tb_cbs.estoque": ["id", "departamento_id", "produto_id", "quantidade", "andar", "localizacao"],
  "tb_cbs.estoque_andares": ["id", "nome", "departamento_id"],
  "tb_cbs.estoque_categorias": ["id", "nome", "departamento_id"],
  "tb_cbs.estoque_categorias_itens": ["id", "categoria", "item"],
  "tb_cbs.estoque_entradas": [
    "id",
    "produto_id",
    "quantidade",
    "data_entrada",
    "repositor",
    "estoque",
  ],
  "tb_cbs.estoque_inventario": ["id", "tipo_item", "tag", "status"],
  "tb_cbs.estoque_itens": ["id", "nome", "descricao", "departamento_id", "status"],
  "tb_cbs.estoque_localizacoes": ["id", "nome", "andar", "departamento_id"],
  "tb_cbs.estoque_saidas": [
    "id",
    "produto_id",
    "quantidade",
    "data_saida",
    "destino",
    "solicitante",
    "autorizador",
    "operador",
    "estoque",
    "obs",
  ],
  "tb_cbs.ramais": ["id", "tipo", "numero", "usuario_id"],
  tb_historico: ["id", "data", "usuario_id", "id_item", "campo", "antes", "para", "obs"],
  "tb_mkt.controle_ia": [
    "id",
    "usuario_id",
    "competencia",
    "conhecimento",
    "integracao",
    "frequencia",
    "motivo",
    "agregacao",
  ],
  "tb_mkt.eventos": ["id", "nome", "logo", "status", "prioridade", "objetivo", "publico"],
  "tb_mkt.eventos_edicoes": [
    "id",
    "evento_id",
    "nome",
    "orcamentos",
    "data_local",
    "parcerias",
    "organizacao",
    "logistica",
    "mkt_comunicacao",
    "durante_evento",
    "pos_evento",
    "obs",
  ],
  "tb_mkt.eventos_feedbacks": ["id", "edicao_id", "data", "user_id", "nota", "obs", "valido"],
  "tb_mkt.eventos_feedbacks_periodos": ["edicao", "inicio", "fim"],
  "tb_mkt.redes_sociais": ["id", "cliente_id", "instagram"],
  "tb_mkt.senhas": ["id", "local", "user", "password", "obs"],
  "tb_mkt.solicitacoes": [
    "id",
    "nome",
    "responsavel_um",
    "responsavel_dois",
    "responsavel_tres",
    "solicitacao",
    "finalizacao",
    "solicitante",
    "status",
    "categoria",
    "urgencia",
    "obs",
  ],
  "tb_pec.notas": [
    "id",
    "usuario_id",
    "numero",
    "tarefa",
    "cadastro",
    "previsao",
    "conclusao",
    "status",
    "inicio_semana",
    "fim_semana",
    "cadastro_original",
    "multa",
    "urgente",
    "cliente_id",
  ],
  "tb_triagem.campos": [
    "id",
    "cliente_id",
    "nfce",
    "sped",
    "spedContribuicoes",
    "nfce_tomados",
    "modelo_21",
    "cte_emitente",
    "prestadas_mei",
    "faturamento",
    "envio",
  ],
  "tb_triagem.justificativas": ["id", "justificativa"],
  "tb_triagem.prioridade": ["id", "cliente", "status"],
  "tb_triagem.qtdnotas": [
    "id",
    "competencia",
    "cliente_id",
    "responsavel",
    "notasXML_entradas",
    "notasXML_saidas",
    "notasNFSE_prestadas",
    "notasNFSE_tomados",
  ],
  "tb_triagem.solicitacoes": [
    "id",
    "tipo",
    "requerente",
    "cliente",
    "data_conclusao",
    "status",
    "data_criacao",
    "solicitante",
    "solicitacao",
    "competencia",
  ],
  "tb_wiki.agenda": ["id", "data", "fim", "titulo", "descricao", "gerado_por", "alvos", "link"],
  "tb_wiki.destaques": [
    "id",
    "data_geracao",
    "gerado_por",
    "titulo",
    "imagem",
    "ordem",
    "link",
    "vencimento",
  ],
  "tb_wiki.wikis": ["id", "titulo", "descricao", "data", "departamento", "categoria", "capa"],
  "tb_wiki.wikis_categorias": ["id", "nome", "dep"],
  "tb_wiki.wikis_topicos": ["id", "wiki_id", "gerado_por", "data", "titulo", "text", "anexo"],
  "tb_workspace.alteracao_regimes": ["id", "cliente_id", "tipo", "data", "status"],
  "tb_workspace.alteracao_regimes_tarefas": [
    "id",
    "alteracao_id",
    "nome",
    "descricao",
    "obs",
    "status",
    "responsavel_id",
    "departamento_id",
    "ordem",
    "data_cadastro",
    "data_inicio",
    "data_conclusao",
  ],
  "tb_workspace.alteracao_regimes_tarefas_express": [
    "id",
    "tipo_alteracao",
    "nome",
    "descricao",
    "obs",
    "responsavel_id",
    "departamento_id",
    "ordem",
  ],
  "tb_workspace.alteracao_regimes_tipos": ["id", "nome", "status"],
  "tb_workspace.mapas": ["id", "user_id", "dep_id", "nome", "mapa"],
  "tb_workspace.mapas_clientes": ["id", "grupo_id", "nome", "mapa"],
  "tb_workspace.natal": ["id", "comp", "quantidade", "cliente", "logo", "data"],
  "tb_workspace.solicitacoes": [
    "id",
    "titulo",
    "descricao",
    "status",
    "requerente",
    "atribuido",
    "categoria",
    "urgencia",
    "data_cadastro",
    "data_atualizacao",
    "departamento",
  ],
  "tb_workspace.solicitacoes_categorias": ["id", "nome", "departamento_id", "status"],
  "tb_workspace.solicitacoes_mensagens": [
    "id",
    "solicitacao",
    "tipo",
    "remetente",
    "destinatario",
    "lida",
    "data_envio",
    "mensagem",
  ],
};

const STANDARD_HISTORY_COLUMNS = [
  "id",
  "tipo",
  "data",
  "antes",
  "depois",
  "campo",
  "obs",
  "user_id",
  "item_id",
];
const INTEGRATION_HISTORY_COLUMNS = [
  "id",
  "data",
  "usuario_id",
  "id_item",
  "campo",
  "antes",
  "para",
  "obs",
];
for (const [sourceTable] of LEGACY_USAGE) {
  if (!(sourceTable in DECLARED_COLUMNS) && sourceTable.startsWith("tb_historico.")) {
    DECLARED_COLUMNS[sourceTable] =
      sourceTable.startsWith("tb_historico.integracao_") ||
      sourceTable === "tb_historico.admin_departamentos" ||
      sourceTable === "tb_historico.admin_usuarios"
        ? INTEGRATION_HISTORY_COLUMNS
        : STANDARD_HISTORY_COLUMNS;
  }
}
DECLARED_COLUMNS["tb_historico.integracao"] = [
  "id",
  "tipo",
  "data",
  "antes",
  "depois",
  "obs",
  "user_id",
  "item_id",
];
DECLARED_COLUMNS["tb_historico.integracao_exclusoes"] = [
  "id",
  "data",
  "usuario_id",
  "tipo_item",
  "id_item",
  "id_cliente",
  "dados",
];

export const REMAINING_EVIDENCE = Object.freeze(
  LEGACY_USAGE.map(([sourceTable, reference, operations]) => {
    const pendingOverride = PENDING_OVERRIDES.get(sourceTable);
    if (pendingOverride !== undefined) {
      return decision({
        sourceTable,
        legacyModule: moduleFromSource(sourceTable),
        legacyReferences: Array.isArray(reference) ? reference : [reference],
        operations,
        legacyRelationships: pendingOverride.relationships,
        currentContractEvidence: pendingOverride.current,
        finalStatus: "pending",
        reasonCode: pendingOverride.reasonCode,
        reason: pendingOverride.reason,
        confidence: "high",
        ruleId: null,
      });
    }
    const confirmed = CONFIRMED.get(sourceTable);
    if (confirmed !== undefined) {
      return decision({
        sourceTable,
        legacyModule: moduleFromSource(sourceTable),
        legacyReferences: Array.isArray(reference) ? reference : [reference],
        operations,
        legacyRelationships: confirmed.relationships,
        currentContractEvidence: confirmed.current,
        finalStatus: "confirmed",
        reasonCode: "LEGACY_BEHAVIOR_CONFIRMED",
        reason: confirmed.reason,
        confidence: "high",
        ruleId: `remaining:${sourceTable}`,
      });
    }

    const historical = sourceTable.startsWith("tb_historico");
    const noRuntime = sourceTable === "tb_historico";
    const auxiliary = AUXILIARY_SOURCES.has(sourceTable);
    const reasonCode = noRuntime
      ? "NO_LEGACY_RUNTIME_REFERENCE"
      : historical
        ? "LEGACY_HISTORY_NO_REPLAY_CONTRACT"
        : auxiliary
          ? "LEGACY_AUXILIARY_NO_CURRENT_CONTRACT"
          : "NO_CURRENT_CONTRACT";
    return decision({
      sourceTable,
      legacyModule: moduleFromSource(sourceTable),
      legacyReferences: Array.isArray(reference) ? reference : [reference],
      operations,
      legacyRelationships: [relationshipForPending({ auxiliary, historical, noRuntime })],
      currentContractEvidence: [],
      finalStatus: "pending",
      reasonCode,
      reason: reasonForPending({ auxiliary, historical, noRuntime }),
      confidence: "low",
      ruleId: null,
    });
  }).sort(compareSourceTables),
);

export const REMAINING_SOURCE_TABLES = Object.freeze(
  REMAINING_EVIDENCE.map(({ sourceTable }) => sourceTable),
);

export const REMAINING_PENDING_COLUMN_DECISIONS = Object.freeze(
  Object.fromEntries(
    REMAINING_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending").map((evidence) => [
      evidence.sourceTable,
      Object.freeze(
        (DECLARED_COLUMNS[evidence.sourceTable] ?? []).map((sourceColumn) =>
          Object.freeze({
            sourceColumn,
            destinationColumn: null,
            status: "not_preserved",
            transformation: "not_emitted_pending_mapping",
            nullHandling: "A origem permanece pending e nenhuma linha é emitida.",
            referenceRole: "none",
            sensitivity: sensitiveColumn(sourceColumn),
            reason: `${evidence.reason} A coluna permanece integralmente no backup até decisão explícita.`,
          }),
        ),
      ),
    ]),
  ),
);

function compareSourceTables(left, right) {
  return left.sourceTable < right.sourceTable ? -1 : left.sourceTable > right.sourceTable ? 1 : 0;
}

function relationshipForPending({ auxiliary, historical, noRuntime }) {
  if (noRuntime) {
    return "A auditoria sem o diretório backend localizou somente o DDL, sem leitura ou escrita em runtime.";
  }
  if (historical) {
    return "item_id depende de tipo sem FK estável; antes/depois são snapshots livres e não comandos de replay.";
  }
  if (auxiliary) {
    return "A origem auxilia joins ou listas do legado, mas não representa uma entidade atual independente.";
  }
  return "O CRUD legado preserva campos ou cardinalidade sem correspondência integral no contrato atual.";
}

function reasonForPending({ auxiliary, historical, noRuntime }) {
  if (noRuntime) {
    return "Nenhuma referência de runtime foi localizada fora dos artefatos DDL do diretório backend; coincidência de nome não comprova migração segura.";
  }
  if (historical) {
    return "O histórico legado não possui contrato atual de replay que preserve tipo, vínculo, autoria e snapshots antes/depois sem fabricar eventos.";
  }
  if (auxiliary) {
    return "A tabela é auxiliar no legado, porém não possui contrato atual independente; seu conteúdo só pode apoiar resolução sem emitir uma entidade nova.";
  }
  return "Nenhum contrato atual fiel preserva integralmente os campos, relações e cardinalidade comprovados no CRUD legado.";
}

function moduleFromSource(sourceTable) {
  if (sourceTable === "tb.atendimento_documentos") return "atendimento";
  if (sourceTable.startsWith("tb_cbc.")) return "workspace compartilhado";
  if (sourceTable.startsWith("tb_cbs.")) return "estoque e tecnologia";
  if (sourceTable.startsWith("tb_historico")) return "histórico legado";
  if (sourceTable.startsWith("tb_mkt.")) return "marketing";
  if (sourceTable.startsWith("tb_pec.")) return "PEC";
  if (sourceTable.startsWith("tb_triagem.")) return "triagem";
  if (sourceTable.startsWith("tb_wiki.")) return "wiki";
  return "workspace";
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

function sensitiveColumn(sourceColumn) {
  if (/password|senha/i.test(sourceColumn)) return "secret";
  if (
    /cpf|cnpj|email|contato|mensagem|observacao|obs|anotacao|antes|depois|para|dados/i.test(
      sourceColumn,
    )
  ) {
    return "personal";
  }
  return "none";
}
