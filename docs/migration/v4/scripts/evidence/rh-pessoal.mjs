function confirmed({
  sourceTable,
  legacyModule,
  legacyReferences,
  operations,
  legacyRelationships,
  currentContractEvidence,
  reason,
  confidence = "high",
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
    ruleId: `rh-pessoal:${sourceTable}`,
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

const PASSWORD_CONTRACT = [
  "infra/prisma/schema.prisma:1391",
  "services/pessoal-service/src/services/passwordService.ts:292",
  "services/pessoal-service/src/services/pessoalPasswordCrypto.ts:30",
];
const USER_CONTRACT = ["infra/prisma/schema.prisma:247"];

export const RH_PESSOAL_EVIDENCE = Object.freeze(
  [
    pending({
      sourceTable: "tb_pessoal.atividades",
      legacyModule: "departamento pessoal",
      legacyReferences: [
        "pessoal/pages/clientes/listar.php:19",
        "pessoal/pages/configuracoes/responsaveis.php:67",
      ],
      operations: ["select"],
      legacyRelationships: [
        "empresa referencia o cliente legado; sindicato, grupo e responsavel são catálogos auxiliares da configuração antiga.",
      ],
      reason:
        "A configuração de atividades combina pagamento, décimo, grupo e responsáveis sem entidade equivalente integral no contrato atual.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.bem",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:7", "classes/Pessoal.php:70"],
      operations: ["insert", "update"],
      legacyRelationships: [
        "empresa referencia tb_integracao.clientes.id e responsavel referencia tb_admin.usuarios.id.",
      ],
      currentContractEvidence: PASSWORD_CONTRACT,
      reason:
        "As credenciais BEM formam um PasswordPessoal por cliente, sempre com campos secretos criptografados.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.bsf",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:9", "classes/Pessoal.php:61"],
      operations: ["insert", "update"],
      legacyRelationships: [
        "empresa referencia tb_integracao.clientes.id e responsavel referencia tb_admin.usuarios.id.",
      ],
      currentContractEvidence: PASSWORD_CONTRACT,
      reason:
        "As credenciais BSF formam um PasswordPessoal por cliente, sempre com campos secretos criptografados.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.clientes_situacoes",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:276", "classes/Pessoal.php:290"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "cliente_id referencia tb_integracao.clientes.id; cadastrado_por e finalizado_por referenciam usuários administrativos.",
      ],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1474",
        "services/pessoal-service/src/services/situationService.ts:51",
      ],
      reason: "O histórico de situações possui contrato atual equivalente em pessoal.situations.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.codigos_acesso",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:27", "classes/Pessoal.php:79"],
      operations: ["insert", "update"],
      legacyRelationships: ["empresa referencia tb_integracao.clientes.id."],
      currentContractEvidence: PASSWORD_CONTRACT,
      reason:
        "Os códigos de acesso formam um PasswordPessoal por cliente, sem preservar certificado ou segredo em claro.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.contri_assis",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:47", "classes/Pessoal.php:97"],
      operations: ["insert", "update"],
      legacyRelationships: ["cliente_id referencia tb_integracao.clientes.id."],
      currentContractEvidence: PASSWORD_CONTRACT,
      reason:
        "As credenciais de contribuição assistencial formam um PasswordPessoal criptografado por cliente.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.empregador_web",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:37", "classes/Pessoal.php:88"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["empresa referencia tb_integracao.clientes.id."],
      currentContractEvidence: PASSWORD_CONTRACT,
      reason:
        "Login e email do Empregador Web são credenciais e formam um PasswordPessoal criptografado por cliente.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.folhas",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:163", "classes/Pessoal.php:216"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "cliente_id referencia tb_integracao.clientes.id; responsavel_id referencia User; sindicato referencia tb_pessoal.sindicato.id.",
      ],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1421",
        "services/pessoal-service/src/services/payrollService.ts:71",
      ],
      reason:
        "A configuração de folha possui contrato atual equivalente e identidade única pelo cliente.",
    }),
    pending({
      sourceTable: "tb_pessoal.grupos",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:383", "classes/Pessoal.php:395"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["id é usado como grupo de configuração de empresas no módulo legado."],
      reason:
        "Não existe catálogo atual de grupos de Departamento Pessoal; o texto de grupo em Payroll não preserva esta entidade e seus vínculos.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.ldd",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:113", "classes/Pessoal.php:132"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["cliente referencia tb_integracao.clientes.id."],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1375",
        "services/pessoal-service/src/services/lddService.ts:44",
      ],
      reason: "O controle LDD possui contrato atual equivalente em pessoal.ldd.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.obrigacoes",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:213", "classes/Pessoal.php:239"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "cliente_id referencia tb_integracao.clientes.id e responsavel_id referencia tb_admin.usuarios.id.",
      ],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1451",
        "infra/prisma/schema.prisma:1469",
        "services/pessoal-service/src/services/obligationService.ts:106",
      ],
      reason:
        "A obrigação possui contrato equivalente e unicidade atual por organização, cliente e competência.",
    }),
    confirmed({
      sourceTable: "tb_pessoal.sindicato",
      legacyModule: "departamento pessoal",
      legacyReferences: ["classes/Pessoal.php:317", "classes/Pessoal.php:364"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["id é referenciado por tb_pessoal.folhas.sindicato."],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1409",
        "services/pessoal-service/src/services/unionService.ts:135",
      ],
      reason:
        "O sindicato possui contrato atual equivalente e a aplicação evita duplicidade por organização, nome, CNPJ e data-base.",
    }),
    confirmed({
      sourceTable: "tb_rh.alergias",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Colaborador.php:103", "classes/Colaborador.php:113"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "colaborador_id referencia tb_rh.colaboradores.id e as linhas são agregadas no JSON User.allergies.",
      ],
      currentContractEvidence: USER_CONTRACT,
      reason: "Alergias complementam por merge a identidade User ligada ao colaborador.",
    }),
    pending({
      sourceTable: "tb_rh.andares",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:161", "classes/RH.php:172"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["colaborador referencia tb_rh.colaboradores.id."],
      reason: "O contrato atual não possui alocação histórica de colaborador por andar.",
    }),
    pending({
      sourceTable: "tb_rh.cargos",
      legacyModule: "recursos humanos",
      legacyReferences: [
        "classes/RH.php:856",
        "rh/pages/colaboradores/colaborador.php:485",
        "rh/pages/colaboradores/colaborador.php:611",
      ],
      operations: ["select"],
      legacyRelationships: [
        "id é catálogo referenciado por tb_rh.colaboradores.cargo; o nome resolvido alimenta User.job_title na regra V2.",
      ],
      currentContractEvidence: ["infra/prisma/schema.prisma:269"],
      reasonCode: "NO_INDEPENDENT_DESTINATION",
      reason:
        "O catálogo é dependência de lookup da regra V2 de colaboradores, mas não possui entidade independente no contrato atual.",
    }),
    pending({
      sourceTable: "tb_rh.cce",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:4", "classes/RH.php:53"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["colaborador e monitores semanais referenciam identidades do legado."],
      reason: "O contrato atual não possui acompanhamento CCE semanal equivalente.",
    }),
    pending({
      sourceTable: "tb_rh.cce_avaliacoes",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:69", "classes/RH.php:122"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["colaborador, andar e monitor referenciam o fluxo CCE legado."],
      reason: "O contrato atual não possui avaliações CCE equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.colaboradores_atas",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Colaborador.php:145", "classes/Colaborador.php:162"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "col_id referencia colaborador e user_id referencia usuário administrativo.",
      ],
      reason: "O contrato atual não possui atas individuais de colaborador equivalentes.",
    }),
    confirmed({
      sourceTable: "tb_rh.contatos_emergencia",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Colaborador.php:91", "classes/Colaborador.php:95"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "colaborador_id referencia tb_rh.colaboradores.id e as linhas são agregadas no JSON User.emergency_contacts.",
      ],
      currentContractEvidence: USER_CONTRACT,
      reason: "Contatos de emergência complementam por merge a identidade User do colaborador.",
    }),
    pending({
      sourceTable: "tb_rh.feedbacks",
      legacyModule: "recursos humanos",
      legacyReferences: [
        "rh/pages/relatorios/padrao.php:111",
        "rh/pages/relatorios/padrao.php:148",
      ],
      operations: ["select"],
      legacyRelationships: [
        "user_id e col_id identificam autor administrativo e colaborador avaliado.",
      ],
      reason: "O contrato atual não possui histórico de feedback textual equivalente.",
    }),
    confirmed({
      sourceTable: "tb_rh.feriados",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:869", "classes/RH.php:886"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["Feriados são globais ao tenant legado e não possuem FK de linha."],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1762",
        "services/rh-service/src/services/holidayService.ts:40",
      ],
      reason: "O cadastro de feriados possui contrato atual equivalente em rh.holidays.",
    }),
    pending({
      sourceTable: "tb_rh.ferias_datas",
      legacyModule: "recursos humanos",
      legacyReferences: ["rh/pages/relatorios/relatorio-ferias-col.php:35"],
      operations: ["select"],
      legacyRelationships: ["periodo_id referencia tb_rh.ferias_periodos.id."],
      reason: "O contrato atual não possui datas e anexos de férias equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.ferias_periodos",
      legacyModule: "recursos humanos",
      legacyReferences: ["rh/pages/relatorios/relatorio-ferias-col.php:5"],
      operations: ["select"],
      legacyRelationships: ["col_id referencia tb_rh.colaboradores.id."],
      reason: "O contrato atual não possui períodos aquisitivos de férias equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.intercorrencias",
      legacyModule: "recursos humanos",
      legacyReferences: ["rh/pages/dashboard/home.php:395"],
      operations: ["select"],
      legacyRelationships: [
        "tipo referencia tb_rh.intercorrencias_tipos; solicitante_id e col_id referenciam pessoas legadas.",
      ],
      reason: "O contrato atual não possui intercorrências de RH equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.intercorrencias_tipos",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Intercorrencia.php:4", "classes/Intercorrencia.php:16"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["id é referenciado por tb_rh.intercorrencias.tipo."],
      reason: "O contrato atual não possui catálogo de tipos de intercorrência.",
    }),
    confirmed({
      sourceTable: "tb_rh.pontos",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:348", "classes/RH.php:389"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["colaborador referencia tb_rh.colaboradores.id."],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1670",
        "services/rh-service/src/services/pointConfigService.ts:33",
      ],
      reason: "A jornada configurada do colaborador possui contrato atual em rh.pointConfig.",
    }),
    confirmed({
      sourceTable: "tb_rh.pontos_adicionais_folhas",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:827", "classes/RH.php:836", "classes/RH.php:844"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "colaborador e adicionado_por recebem IDs de tb_rh.colaboradores; ambos resolvem o User vinculado.",
      ],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1704",
        "services/rh-service/src/services/timeBankReleaseService.ts:61",
      ],
      reason: "Ajustes adicionais de folha possuem contrato atual em rh.timeBankReleases.",
    }),
    confirmed({
      sourceTable: "tb_rh.pontos_folhas",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:737", "classes/RH.php:775"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["colaborador referencia tb_rh.colaboradores.id."],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1687",
        "services/rh-service/src/services/timeSheetService.ts:151",
      ],
      reason: "Folhas de ponto por período possuem contrato atual em rh.timeSheets.",
    }),
    confirmed({
      sourceTable: "tb_rh.pontos_registros",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:401", "classes/RH.php:475"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["colaborador referencia tb_rh.colaboradores.id."],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1720",
        "services/rh-service/src/services/pointService.ts:123",
      ],
      reason: "Registros diários de ponto possuem contrato atual em rh.points.",
    }),
    confirmed({
      sourceTable: "tb_rh.pontos_solicitacoes",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:664", "classes/RH.php:697", "classes/RH.php:710"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "colaborador e aprovador recebem IDs de tb_rh.colaboradores; ponto referencia tb_rh.pontos_registros.id.",
      ],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1739",
        "services/rh-service/src/services/timeClockRequestService.ts:59",
      ],
      reason: "Solicitações de ajuste de ponto possuem contrato atual em rh.timeClockRequest.",
    }),
    pending({
      sourceTable: "tb_rh.provas",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:693", "classes/Score.php:737"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["gerador_id e avaliador_id referenciam colaboradores legados."],
      reason: "O contrato atual não possui provas de RH equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.provas_inscritos",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:794", "classes/Score.php:860"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "prova referencia tb_rh.provas.id e colaborador referencia colaborador legado.",
      ],
      reason: "O contrato atual não possui inscrições e notas de provas equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.provas_questoes",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:745", "classes/Score.php:780"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["prova referencia tb_rh.provas.id."],
      reason: "O contrato atual não possui questões de provas equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.provas_respostas",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:820", "classes/Score.php:900"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "prova e questao_id referenciam o fluxo de provas; col_id e avaliador_id referenciam colaboradores.",
      ],
      reason: "O contrato atual não possui respostas, notas e feedback de provas equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.pv",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:183", "classes/RH.php:200"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["col_id referencia tb_rh.colaboradores.id."],
      reason: "O contrato atual não possui plano de vida e carreira equivalente.",
    }),
    pending({
      sourceTable: "tb_rh.pv_objetivos",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:222", "classes/RH.php:239"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "pv_id referencia tb_rh.pv.id e responsáveis referenciam pessoas legadas.",
      ],
      reason: "O contrato atual não possui objetivos do plano de vida equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.pv_tarefas",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:264", "classes/RH.php:282"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["obj_id referencia tb_rh.pv_objetivos.id."],
      reason: "O contrato atual não possui tarefas do plano de vida equivalentes.",
    }),
    pending({
      sourceTable: "tb_rh.pv_tarefas_express",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/RH.php:308", "classes/RH.php:325"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["id identifica modelo de tarefa expressa usado no plano de vida."],
      reason: "O contrato atual não possui catálogo de tarefas expressas do plano de vida.",
    }),
    confirmed({
      sourceTable: "tb_rh.score",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:5", "classes/Score.php:229"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "col_id referencia tb_rh.colaboradores.id; colaborador e trimestre são únicos no destino.",
      ],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1773",
        "services/rh-service/src/services/scoreQuarterService.ts:52",
      ],
      reason: "O score trimestral consolidado possui contrato atual em rh.score.",
    }),
    confirmed({
      sourceTable: "tb_rh.score_avaliacoes",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:17", "classes/Score.php:523", "classes/Score.php:651"],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "col_id e trimestre resolvem tb_rh.score; user_id referencia tb_admin.usuarios.id; avaliador codifica 0=SELF, 1=LEADER, 2=RH, 3=DIRECTOR, 4=TI e 5=SUBORDINATE; p/n/obs formam o JSON answers.",
      ],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1822",
        "services/rh-service/src/services/scoreEvaluationService.ts:38",
      ],
      reason: "Avaliações de score são agregadas no JSON answers de rh.score_evaluations.",
    }),
    pending({
      sourceTable: "tb_rh.score_nitro.avaliacoes",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:375", "classes/Score.php:380"],
      operations: ["insert", "select"],
      legacyRelationships: ["col_id e trimestre ligam a avaliação ao score Nitro consolidado."],
      reason: "O contrato atual preserva apenas totais Nitro, não avaliações individuais.",
    }),
    pending({
      sourceTable: "tb_rh.score_nitro.avaliacoes_periodos",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:354", "classes/Score.php:368"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["col_id e trimestre ligam o período ao score Nitro consolidado."],
      reason: "O contrato atual não possui períodos individuais de avaliação Nitro.",
    }),
    pending({
      sourceTable: "tb_rh.score_nitro.ch",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:398", "classes/Score.php:407"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["col_id e trimestre ligam a carga horária ao score Nitro consolidado."],
      reason:
        "O contrato atual preserva o total de horas, mas não certificados e validações individuais.",
    }),
    pending({
      sourceTable: "tb_rh.score_nitro.erros",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:419", "classes/Score.php:428"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["col_id e trimestre ligam o erro ao score Nitro consolidado."],
      reason: "O contrato atual preserva o total de erros, mas não o detalhe textual individual.",
    }),
    confirmed({
      sourceTable: "tb_rh.score_nitro",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:244", "classes/Score.php:337"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["col_id e trimestre resolvem a identidade única de tb_rh.score."],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1794",
        "services/rh-service/src/services/scoreNitroService.ts:25",
      ],
      reason: "O score Nitro consolidado possui contrato atual em rh.score_nitro.",
    }),
    confirmed({
      sourceTable: "tb_rh.score_perguntas",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Score.php:443", "classes/Score.php:497"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["id legado permanece como question_id externo do catálogo atual."],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1810",
        "services/rh-service/src/services/scoreQuestionService.ts:46",
      ],
      reason: "Perguntas de score possuem contrato atual em rh.score_questions.",
    }),
    confirmed({
      sourceTable: "tb_rh.solicitacoes",
      legacyModule: "recursos humanos",
      legacyReferences: [
        "classes/Solicitacao.php:161",
        "classes/Solicitacao.php:244",
        "classes/Solicitacao.php:246",
        "rh/pages/solicitacoes/solicitacao.php:4",
      ],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "requerente e atribuido recebem IDs de tb_rh.colaboradores; categoria referencia tb_rh.solicitacoes_categorias.id.",
      ],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1839",
        "services/rh-service/src/services/requestService.ts:86",
        "services/rh-service/src/services/requestService.ts:129",
      ],
      reason:
        "Solicitações possuem contrato atual; requester usa o vínculo de colaborador e assignee obrigatório exige resolução única explícita.",
    }),
    confirmed({
      sourceTable: "tb_rh.solicitacoes_categorias",
      legacyModule: "recursos humanos",
      legacyReferences: ["classes/Solicitacao.php:313", "classes/Solicitacao.php:341"],
      operations: ["insert", "select", "update"],
      legacyRelationships: ["id é referenciado por tb_rh.solicitacoes.categoria."],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1860",
        "services/rh-service/src/services/categoryService.ts:39",
      ],
      reason: "Categorias de solicitação possuem contrato atual em rh.request_categories.",
    }),
    confirmed({
      sourceTable: "tb_rh.solicitacoes_mensagens",
      legacyModule: "recursos humanos",
      legacyReferences: [
        "classes/Solicitacao.php:265",
        "classes/Solicitacao.php:266",
        "classes/Solicitacao.php:292",
        "rh/ajax/solicitacoes.php:37",
      ],
      operations: ["insert", "select", "update"],
      legacyRelationships: [
        "solicitacao referencia tb_rh.solicitacoes.id e remetente recebe ID de tb_rh.colaboradores para resolver o User vinculado.",
      ],
      currentContractEvidence: [
        "infra/prisma/schema.prisma:1871",
        "services/rh-service/src/services/messageService.ts:61",
      ],
      reason: "Mensagens de solicitação possuem contrato atual em rh.request_messages.",
    }),
  ].sort((left, right) => left.sourceTable.localeCompare(right.sourceTable)),
);

export const RH_PESSOAL_SOURCE_TABLES = Object.freeze(
  RH_PESSOAL_EVIDENCE.map(({ sourceTable }) => sourceTable),
);

const PENDING_SOURCE_COLUMNS = {
  "tb_pessoal.atividades": [
    "id",
    "empresa",
    "pagamento",
    "adiantamento",
    "decimo",
    "sindicato",
    "grupo",
    "responsavel",
  ],
  "tb_pessoal.grupos": ["id", "tipo"],
  "tb_rh.andares": ["id", "colaborador", "andar"],
  "tb_rh.cargos": ["id", "nome"],
  "tb_rh.cce": [
    "id",
    "comp",
    "colaborador",
    "andar",
    "semana_um",
    "semana_dois",
    "semana_tres",
    "semana_quatro",
    "semana_um_data",
    "semana_dois_data",
    "semana_tres_data",
    "semana_quatro_data",
    "semana_um_monitor",
    "semana_dois_monitor",
    "semana_tres_monitor",
    "semana_quatro_monitor",
  ],
  "tb_rh.cce_avaliacoes": [
    "id",
    "comp",
    "semana",
    "colaborador",
    "andar",
    "data",
    "monitor",
    "organizacao",
    "limpeza",
    "atrasos",
    "celular",
    "conversas",
    "demandas",
    "vestimenta",
    "status",
  ],
  "tb_rh.colaboradores_atas": ["id", "data", "col_id", "pauta", "participantes", "ata", "user_id"],
  "tb_rh.feedbacks": ["id", "data", "user_id", "col_id", "titulo", "feedback"],
  "tb_rh.ferias_datas": ["id", "periodo_id", "data_inicio", "data_fim", "obs", "anexo"],
  "tb_rh.ferias_periodos": [
    "id",
    "periodo_inicio",
    "periodo_fim",
    "col_id",
    "aquisitivo_inicio",
    "aquisitivo_fim",
  ],
  "tb_rh.intercorrencias": [
    "id",
    "tipo",
    "solicitante_id",
    "col_id",
    "departamento_id",
    "data_inicio_planejado",
    "data_fim_planejado",
    "data_inicio",
    "data_fim",
    "descricao",
    "doc",
    "status",
  ],
  "tb_rh.intercorrencias_tipos": ["id", "nome"],
  "tb_rh.provas": [
    "id",
    "gerador_id",
    "avaliador_id",
    "data_geração",
    "periodo_inicio",
    "periodo_fim",
    "titulo",
    "obs",
    "status",
  ],
  "tb_rh.provas_inscritos": ["id", "prova", "colaborador", "status", "nota"],
  "tb_rh.provas_questoes": ["id", "prova", "questao", "valor", "resposta"],
  "tb_rh.provas_respostas": [
    "id",
    "prova",
    "questao_id",
    "questao",
    "valor",
    "resposta",
    "nota",
    "feedback",
    "col_id",
    "avaliador_id",
  ],
  "tb_rh.pv": ["id", "col_id", "ano", "historia_vida", "historia_empresa"],
  "tb_rh.pv_objetivos": [
    "id",
    "pv_id",
    "nome",
    "status",
    "responsavel_rh",
    "responsavel_auto",
    "previsao",
    "conclusao",
  ],
  "tb_rh.pv_tarefas": [
    "id",
    "obj_id",
    "nome",
    "status",
    "responsavel_col",
    "responsavel_rh",
    "obs",
  ],
  "tb_rh.pv_tarefas_express": ["id", "nome", "responsavel", "obs"],
  "tb_rh.score_nitro.avaliacoes": ["id", "col_id", "user_id", "nota", "trimestre"],
  "tb_rh.score_nitro.avaliacoes_periodos": ["id", "col_id", "trimestre", "inicio", "fim"],
  "tb_rh.score_nitro.ch": ["id", "col_id", "trimestre", "ch", "certificado", "validacao"],
  "tb_rh.score_nitro.erros": ["id", "col_id", "trimestre", "titulo", "nivel"],
};

export const RH_PESSOAL_PENDING_COLUMN_DECISIONS = Object.freeze(
  Object.fromEntries(
    RH_PESSOAL_EVIDENCE.filter(({ finalStatus }) => finalStatus === "pending").map(
      (evidenceDecision) => [
        evidenceDecision.sourceTable,
        Object.freeze(
          PENDING_SOURCE_COLUMNS[evidenceDecision.sourceTable].map((sourceColumn) =>
            Object.freeze({
              sourceTable: evidenceDecision.sourceTable,
              sourceColumn,
              destinationColumn: null,
              status: "not_preserved",
              reason: `Sem destino atual confirmado: ${evidenceDecision.reason}`,
            }),
          ),
        ),
      ],
    ),
  ),
);
