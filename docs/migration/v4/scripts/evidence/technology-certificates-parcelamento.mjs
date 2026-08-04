function confirmed({
  sourceTable,
  legacyModule,
  legacyReferences,
  operations,
  legacyRelationships,
  currentContractEvidence,
  reason,
  confidence = "high",
  rulePrefix,
}) {
  return decision({
    sourceTable,
    legacyModule,
    legacyReferences,
    operations,
    legacyRelationships,
    currentContractEvidence,
    finalStatus: "confirmed",
    reasonCode: "LEGACY_BEHAVIOR_CONFIRMED",
    reason,
    confidence,
    ruleId: `${rulePrefix}:${sourceTable}`,
  });
}

function pending({
  sourceTable,
  legacyModule,
  legacyReferences,
  operations,
  legacyRelationships,
  currentContractEvidence = [],
  reasonCode = "NO_CURRENT_CONTRACT",
  reason,
}) {
  return decision({
    sourceTable,
    legacyModule,
    legacyReferences,
    operations,
    legacyRelationships,
    currentContractEvidence,
    finalStatus: "pending",
    reasonCode,
    reason,
    confidence: "low",
    ruleId: null,
  });
}

function decision(value) {
  return Object.freeze({
    ...value,
    legacyReferences: Object.freeze(value.legacyReferences),
    operations: Object.freeze(value.operations),
    legacyRelationships: Object.freeze(value.legacyRelationships),
    currentContractEvidence: Object.freeze(value.currentContractEvidence),
  });
}

const STOCK_CONTRACT = [
  "infra/prisma/schema.prisma:970",
  "infra/prisma/schema.prisma:985",
  "infra/prisma/schema.prisma:998",
  "services/ti-service/src/services/tiStockService.ts:122",
];
const INVENTORY_CONTRACT = [
  "infra/prisma/schema.prisma:1922",
  "infra/prisma/schema.prisma:1934",
  "infra/prisma/schema.prisma:1945",
  "services/ti-service/src/services/tiInventoryService.ts:63",
];
const CERTIFICATE_FILE_CONTRACT = [
  "services/certificate-service/src/services/certificateFileValidation.ts:29",
  "services/certificate-service/src/services/certificateFileCrypto.ts:35",
  "services/certificate-service/src/services/certificatePfService.ts:350",
];
const PARCELAMENTO_IDENTITY_CONTRACT = [
  "infra/prisma/schema.prisma:1297",
  "infra/prisma/migrations/20260710120000_parcelamento_agreement_identity/migration.sql:1",
  "services/parcelamento-service/src/services/installmentService.ts:449",
];

const technologyEvidence = [
  pending({
    sourceTable: "tb_tecnologia.atualizacoes",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Tarefa.php:1606", "classes/Tarefa.php:1614"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "A tarefa possui até três responsáveis, solicitante e dois módulos, enquanto o chamado atual admite somente um assignee e não possui módulos equivalentes.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:1991"],
    reasonCode: "CURRENT_CONTRACT_NOT_FAITHFUL",
    reason:
      "O contrato de chamados TI não preserva os três responsáveis nem os dois módulos; escolher um responsável ou fabricar requester alteraria o comportamento legado.",
  }),
  pending({
    sourceTable: "tb_tecnologia.atualizacoes_previsao",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Tarefa.php:1657", "classes/Tarefa.php:1671"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "id_tarefa referencia tb_tecnologia.atualizacoes e o registro descreve previsão/status sem autor persistido.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:2028"],
    reasonCode: "CURRENT_CONTRACT_NOT_FAITHFUL",
    reason:
      "A mensagem atual exige sender, mas a previsão legada não registra autor; reutilizar requester como sender seria uma identidade fabricada.",
  }),
  confirmed({
    sourceTable: "tb_tecnologia.estoque",
    legacyModule: "tecnologia",
    legacyReferences: [
      "classes/Estoque.php:363",
      "classes/Estoque.php:373",
      "tecnologia/pages/estoque/item.php:6",
    ],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "categoria é o nome legado do produto; localizacao referencia tb_cbs.estoque_localizacoes e precisa ser resolvida antes de deduplicar o catálogo atual por organização/nome.",
    ],
    currentContractEvidence: STOCK_CONTRACT,
    reason:
      "Cada linha origina categoria e localização deduplicadas por organização/nome, além do item ligado aos dois catálogos atuais.",
    rulePrefix: "technology",
  }),
  confirmed({
    sourceTable: "tb_tecnologia.estoque_entradas",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Estoque.php:28", "classes/Estoque.php:31"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "produto_id referencia tb_tecnologia.estoque e repositor referencia tb_admin.usuarios; estoque é o saldo posterior derivado.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:1019", STOCK_CONTRACT[3]],
    reason: "A entrada possui entidade atual equivalente e resolve item e usuário explicitamente.",
    rulePrefix: "technology",
  }),
  confirmed({
    sourceTable: "tb_tecnologia.estoque_saidas",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Estoque.php:65", "classes/Estoque.php:68"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "produto_id referencia estoque; solicitante, autorizador e operador referenciam identidades de usuário com obrigatoriedade distinta.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:1033", STOCK_CONTRACT[3]],
    reason:
      "A saída possui contrato equivalente, com referências obrigatórias e opcionais explícitas.",
    rulePrefix: "technology",
  }),
  confirmed({
    sourceTable: "tb_tecnologia.inventario",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Usuario.php:311", "classes/Usuario.php:333"],
    operations: ["delete", "insert", "select", "update"],
    legacyRelationships: [
      "usuario_id e ti_responsavel referenciam usuários; tipo referencia semanticamente a categoria textual do inventário.",
    ],
    currentContractEvidence: INVENTORY_CONTRACT,
    reason: "O ativo atribuído possui contrato equivalente no inventário TI atual.",
    rulePrefix: "technology",
  }),
  pending({
    sourceTable: "tb_tecnologia.inventario_fotos",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Usuario.php:578"],
    operations: ["insert", "select"],
    legacyRelationships: [
      "id_inventario referencia tb_tecnologia.inventario e foto aponta para arquivo legado.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:1945"],
    reasonCode: "NO_CURRENT_CONTRACT",
    reason:
      "InventoryTecnologia não possui relação ou storage de fotos; copiar nome de arquivo para notes não preserva o conteúdo nem sua identidade.",
  }),
  confirmed({
    sourceTable: "tb_tecnologia.inventario_itens",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Usuario.php:408", "classes/Usuario.php:559"],
    operations: ["delete", "insert", "select", "update"],
    legacyRelationships: [
      "local_id referencia tb_tecnologia.inventario_loc, tipo resolve categoria e id_responsavel referencia usuário TI.",
    ],
    currentContractEvidence: INVENTORY_CONTRACT,
    reason: "O item em localização possui contrato equivalente no inventário TI atual.",
    rulePrefix: "technology",
  }),
  confirmed({
    sourceTable: "tb_tecnologia.inventario_loc",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Estoque.php:260", "classes/Estoque.php:298"],
    operations: ["insert", "select", "update"],
    legacyRelationships: ["id é referenciado por tb_tecnologia.inventario_itens.local_id."],
    currentContractEvidence: INVENTORY_CONTRACT,
    reason: "A localização do inventário possui catálogo atual equivalente.",
    rulePrefix: "technology",
  }),
  confirmed({
    sourceTable: "tb_tecnologia.opcoes",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Estoque.php:319", "classes/Estoque.php:334"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "tipo distingue as categorias usadas por inventario e inventario_itens; categoria é a identidade natural do catálogo.",
    ],
    currentContractEvidence: INVENTORY_CONTRACT,
    reason: "As opções de tipo formam categorias atuais deduplicadas por organização e nome.",
    rulePrefix: "technology",
  }),
  pending({
    sourceTable: "tb_tecnologia.reset",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Usuario.php:589", "classes/Usuario.php:598"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "usuario_id identifica o usuário alvo e gerador_id identifica quem abriu a permissão temporária de cinco minutos.",
    ],
    reasonCode: "NO_CURRENT_CONTRACT",
    reason:
      "Não existe contrato atual de permissão temporária de reset compatível; nenhum valor de reset pode ser emitido, relatado ou colocado em quarentena.",
  }),
  pending({
    sourceTable: "tb_tecnologia.robos",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Robo.php:5", "classes/Robo.php:13"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "departamento_id e responsavel_id são vínculos do robô; padrao governa a recorrência diária ou mensal dos controles.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:2044"],
    reasonCode: "CURRENT_CONTRACT_NOT_FAITHFUL",
    reason:
      "O contrato atual exige type sem equivalente legado e não preserva departamento/responsável; inferir type pelo nome seria heurística não comprovada.",
  }),
  pending({
    sourceTable: "tb_tecnologia.robos_controles",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Robo.php:42", "classes/Robo.php:99"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "robo_id referencia tb_tecnologia.robos e data representa a ocorrência planejada.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:2062"],
    reasonCode: "UNRESOLVED_PARENT_CONTRACT",
    reason:
      "Sem regra fiel para o robô pai, robot_runs não pode resolver robot_id; converter controles planejados em execuções também mudaria a semântica.",
  }),
  confirmed({
    sourceTable: "tb_tecnologia.senhas",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Senhas.php:54", "classes/Senhas.php:58"],
    operations: ["delete", "insert", "select", "update"],
    legacyRelationships: [
      "tipo 0 usa id_usuario como User; tipo 1 usa id_usuario como localização e não cabe no user_id obrigatório atual.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1888",
      "services/ti-service/src/services/tiPasswordService.ts:153",
    ],
    reason:
      "Credenciais de usuário tipo 0 possuem destino criptografado; tipo 1 e falhas de criptografia ou referência ficam em quarentena por emissão.",
    rulePrefix: "technology",
  }),
  confirmed({
    sourceTable: "tb_tecnologia.termos",
    legacyModule: "tecnologia",
    legacyReferences: ["classes/Termos.php:4", "classes/Termos.php:10"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "user_id referencia usuário e departamento é resolvido por nome; assinatura é arquivo legado, não timestamp.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1969",
      "services/ti-service/src/services/tiTermService.ts:57",
    ],
    reason:
      "Os dados estruturados do termo possuem contrato atual; arquivo de assinatura exige quarentena porque signed_at não armazena conteúdo.",
    rulePrefix: "technology",
  }),
];

const certificateEvidence = [
  pending({
    sourceTable: "tb_certificados.notificacoes.vencimento_certificados",
    legacyModule: "certificados",
    legacyReferences: ["classes/Certificado.php:282", "classes/Certificado.php:300"],
    operations: ["delete", "insert", "select", "update"],
    legacyRelationships: [
      "certificado e tipo identificam PF/PJ; a tabela é apagada e reconstruída a partir dos certificados ativos.",
    ],
    currentContractEvidence: [
      "services/certificate-service/src/services/certificateNotificationService.ts:96",
    ],
    reasonCode: "DERIVED_CURRENT_STATE",
    reason:
      "O serviço atual reconcilia notificações a partir dos certificados; carregar o snapshot derivado duplicaria estado e prazo não possui coluna equivalente.",
  }),
  confirmed({
    sourceTable: "tb_certificados.pf",
    legacyModule: "certificados",
    legacyReferences: ["classes/Certificado.php:77", "classes/Certificado.php:87"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "A identidade atual é organização/nome/CPF/modelo; arquivo legado exige asset, metadata e storage criptografado completos.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:1131", ...CERTIFICATE_FILE_CONTRACT],
    reason:
      "O certificado PF possui contrato atual, com datas e identidade validadas e arquivo somente quando o storage criptografado puder ser comprovado.",
    rulePrefix: "certificates",
  }),
  confirmed({
    sourceTable: "tb_certificados.pj",
    legacyModule: "certificados",
    legacyReferences: ["classes/Certificado.php:21", "classes/Certificado.php:31"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "A identidade atual é organização/nome/CNPJ/modelo; arquivo legado exige asset, metadata e storage criptografado completos.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:1093", ...CERTIFICATE_FILE_CONTRACT],
    reason:
      "O certificado PJ possui contrato atual, com datas e identidade validadas e arquivo somente quando o storage criptografado puder ser comprovado.",
    rulePrefix: "certificates",
  }),
];

const parcelamentoEvidence = [
  pending({
    sourceTable: "tb_cbc.panorama_clientes_parcelamento",
    legacyModule: "parcelamento",
    legacyReferences: ["parcelamento/pages/clientes/cliente.php:189"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "cliente_id e responsavel_id referenciam cliente e usuário, mas o snapshot não registra competência.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:1352"],
    reasonCode: "CURRENT_IDENTITY_NOT_RECONSTRUCTABLE",
    reason:
      "O contrato atual exige identidade organização/cliente/competência; o snapshot legado sem competência não permite reconstruir essa identidade sem fabricar período.",
  }),
  confirmed({
    sourceTable: "tb_cbc.panorama_parcelamentos",
    legacyModule: "parcelamento",
    legacyReferences: ["parcelamento/ajax/panorama.php:12", "parcelamento/ajax/panorama.php:110"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "cliente_id e responsavel_id referenciam cliente e usuário; comp completa a identidade natural do panorama por competência.",
      "O valor legado 3 em certidões significa não aplicável e não cabe nos Boolean atuais.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1352",
      "services/parcelamento-service/src/services/panoramaService.ts:160",
      "services/parcelamento-service/src/services/panoramaService.ts:352",
    ],
    reason:
      "O panorama por competência possui contrato atual fiel quando cliente, responsável, competência, estados booleanos e colisão de identidade são resolvidos explicitamente.",
    rulePrefix: "parcelamento",
  }),
  confirmed({
    sourceTable: "tb_parcelamento.clientes",
    legacyModule: "parcelamento",
    legacyReferences: ["classes/Parcelamento.php:48"],
    operations: ["insert", "select"],
    legacyRelationships: [
      "id é referenciado por parcelamentos com externo=1; o destino atual exige Client já existente e lookup único por documento/nome.",
    ],
    currentContractEvidence: ["infra/prisma/schema.prisma:536"],
    reason:
      "Clientes externos são resolvidos por lookup explícito no catálogo Client atual, sem fabricar cadastro incompleto.",
    rulePrefix: "parcelamento",
  }),
  confirmed({
    sourceTable: "tb_parcelamento.competencia",
    legacyModule: "parcelamento",
    legacyReferences: ["classes/Parcelamento.php:57", "classes/Parcelamento.php:86"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "id_parcelamento referencia o acordo e data compõe a identidade única da competência atual.",
    ],
    currentContractEvidence: [
      "infra/prisma/schema.prisma:1330",
      "services/parcelamento-service/src/services/installmentCompetencyService.ts:138",
    ],
    reason:
      "A competência possui contrato atual quando acordo, competência YYYY-MM e estados tri-state forem resolvidos sem ambiguidade.",
    rulePrefix: "parcelamento",
  }),
  confirmed({
    sourceTable: "tb_parcelamento.parcelamentos",
    legacyModule: "parcelamento",
    legacyReferences: ["classes/Parcelamento.php:5", "classes/Parcelamento.php:15"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "cliente_id aponta para cliente interno quando externo=0 e para tb_parcelamento.clientes quando externo=1.",
      "Sem agreement_number legado, a identidade atual usa o fallback cliente/tipo/natureza/jurisdição/data de adesão.",
    ],
    currentContractEvidence: PARCELAMENTO_IDENTITY_CONTRACT,
    reason:
      "O acordo possui contrato atual e identidade fallback explícita; cliente, estados e colisões são validados por emissão.",
    rulePrefix: "parcelamento",
  }),
  pending({
    sourceTable: "tb_parcelamento.simulacoes",
    legacyModule: "parcelamento",
    legacyReferences: ["classes/Parcelamento.php:173", "classes/Parcelamento.php:174"],
    operations: ["insert", "select"],
    legacyRelationships: [
      "cliente_id e externo selecionam o cliente da simulação; contador identifica versões sucessivas.",
    ],
    reason:
      "O schema atual de Parcelamento não possui entidade de simulação nem contrato que preserve suas versões.",
  }),
  pending({
    sourceTable: "tb_parcelamento.simulacoes_parcelamentos",
    legacyModule: "parcelamento",
    legacyReferences: ["classes/Parcelamento.php:187", "classes/Parcelamento.php:196"],
    operations: ["insert", "select", "update"],
    legacyRelationships: [
      "simulacao_id referencia tb_parcelamento.simulacoes e agrupa alternativas calculadas.",
    ],
    reason:
      "O schema atual não possui itens de simulação e Installment representa acordos efetivos, não alternativas calculadas.",
  }),
];

export const TECHNOLOGY_EVIDENCE = freezeSorted(technologyEvidence);
export const CERTIFICATE_EVIDENCE = freezeSorted(certificateEvidence);
export const PARCELAMENTO_EVIDENCE = freezeSorted(parcelamentoEvidence);
export const TECHNOLOGY_SOURCE_TABLES = freezeSources(TECHNOLOGY_EVIDENCE);
export const CERTIFICATE_SOURCE_TABLES = freezeSources(CERTIFICATE_EVIDENCE);
export const PARCELAMENTO_SOURCE_TABLES = freezeSources(PARCELAMENTO_EVIDENCE);
export const SPECIALIZED_EVIDENCE = freezeSorted([
  ...TECHNOLOGY_EVIDENCE,
  ...CERTIFICATE_EVIDENCE,
  ...PARCELAMENTO_EVIDENCE,
]);
export const SPECIALIZED_SOURCE_TABLES = freezeSources(SPECIALIZED_EVIDENCE);

const pendingColumns = {
  "tb_cbc.panorama_clientes_parcelamento": [
    "id",
    "cliente_id",
    "cnd_municipal",
    "cnd_estadual",
    "cnd_federal",
    "cnd_fgts",
    "cnd_trabalhista",
    "protestos",
    "situacao_fiscal_estadual",
    "situacao_fiscal_federal",
    "responsavel_id",
  ],
  "tb_certificados.notificacoes.vencimento_certificados": [
    "id",
    "data",
    "certificado",
    "tipo",
    "data_vencimento",
    "cliente",
    "prazo",
  ],
  "tb_parcelamento.simulacoes": ["id", "cliente_id", "externo", "contador"],
  "tb_parcelamento.simulacoes_parcelamentos": [
    "id",
    "simulacao_id",
    "estancia",
    "descricao",
    "cadin",
    "tipo",
    "principal",
    "consolidado",
    "quantidade",
    "entrada",
    "parcela",
  ],
  "tb_tecnologia.atualizacoes": [
    "id",
    "nome",
    "responsavel_um",
    "responsavel_dois",
    "responsavel_tres",
    "solicitacao",
    "finalizacao",
    "modulo_um",
    "modulo_dois",
    "solicitante",
    "status",
    "tipo",
    "obs",
    "urgencia",
  ],
  "tb_tecnologia.atualizacoes_previsao": [
    "id",
    "id_tarefa",
    "status",
    "data",
    "data_atualizacao",
    "registro",
  ],
  "tb_tecnologia.inventario_fotos": ["id", "id_inventario", "foto"],
  "tb_tecnologia.reset": ["id", "data", "usuario_id", "status", "gerador_id"],
  "tb_tecnologia.robos": [
    "id",
    "nome",
    "descricao",
    "departamento_id",
    "responsavel_id",
    "status",
    "padrao",
  ],
  "tb_tecnologia.robos_controles": ["id", "robo_id", "data", "status"],
};

export const SPECIALIZED_PENDING_COLUMN_DECISIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(pendingColumns).map(([sourceTable, columns]) => [
      sourceTable,
      Object.freeze(
        columns.map((sourceColumn) =>
          Object.freeze({
            sourceColumn,
            destinationColumn: null,
            status: "not_preserved",
            reason: `A coluna ${sourceColumn} não é emitida enquanto ${sourceTable} permanecer sem contrato atual fiel e confirmado.`,
          }),
        ),
      ),
    ]),
  ),
);

function freezeSorted(values) {
  return Object.freeze(
    [...values].sort((left, right) => compareText(left.sourceTable, right.sourceTable)),
  );
}

function freezeSources(decisions) {
  return Object.freeze(decisions.map(({ sourceTable }) => sourceTable));
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
