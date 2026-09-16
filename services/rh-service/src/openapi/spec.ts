import { reportingQueryOpenApiSchema } from "@workspace/shared";
import type { OpenApiDocument } from "@workspace/shared/http";

import type { RhEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

const bearer: Array<Record<string, string[]>> = [{ bearerAuth: [] }];
const internalToken: Array<Record<string, string[]>> = [{ internalToken: [] }];
const internalReportingParameters = [
  {
    name: "x-internal-service-token",
    in: "header",
    required: true,
    schema: { type: "string" },
  },
  { name: "x-request-id", in: "header", required: true, schema: { type: "string" } },
  { name: "x-reports-grant", in: "header", required: true, schema: { type: "string" } },
  {
    name: "x-reports-grant-signature",
    in: "header",
    required: true,
    schema: { type: "string" },
  },
] as const;

const internalReportingExtractRequestBody = createObjectRequestBody({
  example: { source: "rh.holidays", fields: ["name", "date"], limit: 100 },
  required: ["source", "fields", "limit"],
  properties: {
    source: { type: "string", enum: ["rh.requests", "rh.attendance", "rh.holidays"] },
    fields: { type: "array", minItems: 1, maxItems: 25, items: { type: "string" } },
    limit: { type: "integer", minimum: 1, maximum: 101 },
    query: reportingQueryOpenApiSchema,
  },
});

function createObjectRequestBody(options: {
  example: Record<string, unknown>;
  properties: Record<string, unknown>;
  required?: string[];
}) {
  const { example, properties, required } = options;

  return {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties,
            ...(required ? { required } : {}),
            additionalProperties: false,
            example,
          },
        },
      },
    },
  } as const;
}

const pointConfigRequestBody = createObjectRequestBody({
  example: {
    target_user_id: "user-uuid",
    start_time: "08:00",
    lunch_break: "12:00",
    lunch_return: "13:00",
    end_time: "17:30",
    work_days: "1,2,3,4,5",
  },
  properties: {
    target_user_id: { type: "string" },
    start_time: { type: "string" },
    lunch_break: { type: "string" },
    lunch_return: { type: "string" },
    end_time: { type: "string" },
    work_days: { type: "string" },
  },
});

const timeClockAdjustmentRequestBody = createObjectRequestBody({
  example: {
    point_id: "point-uuid",
    date: "2026-04-02",
    clock_in: "2026-04-02T08:00:00.000Z",
    lunch_out: "2026-04-02T12:00:00.000Z",
    lunch_in: "2026-04-02T13:00:00.000Z",
    clock_out: "2026-04-02T17:30:00.000Z",
    justification: "Esqueci de bater o retorno do almoço.",
  },
  required: ["clock_in", "lunch_out", "lunch_in", "clock_out", "justification"],
  properties: {
    point_id: { type: "string", format: "uuid" },
    date: { type: "string", format: "date" },
    clock_in: { type: "string", format: "date-time" },
    lunch_out: { type: "string", format: "date-time" },
    lunch_in: { type: "string", format: "date-time" },
    clock_out: { type: "string", format: "date-time" },
    justification: { type: "string" },
  },
});

const bulkApproveTimeClockAdjustmentRequestBody = createObjectRequestBody({
  example: {
    request_ids: ["request-uuid-1", "request-uuid-2"],
    obs_approver: "Conferido pelo RH.",
  },
  required: ["request_ids"],
  properties: {
    request_ids: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: { type: "string", format: "uuid" },
    },
    obs_approver: { type: ["string", "null"] },
  },
});

const retroactiveTimeClockAdjustmentRequestBody = createObjectRequestBody({
  example: {
    target_user_id: "user-uuid",
    date: "2026-04-02",
    clock_in: "2026-04-02T08:00:00.000Z",
    lunch_out: "2026-04-02T12:00:00.000Z",
    lunch_in: "2026-04-02T13:00:00.000Z",
    clock_out: "2026-04-02T17:30:00.000Z",
    justification: "Entrada retroativa autorizada pelo RH.",
  },
  required: [
    "target_user_id",
    "date",
    "clock_in",
    "lunch_out",
    "lunch_in",
    "clock_out",
    "justification",
  ],
  properties: {
    target_user_id: { type: "string", format: "uuid" },
    date: { type: "string", format: "date" },
    clock_in: { type: "string", format: "date-time" },
    lunch_out: { type: "string", format: "date-time" },
    lunch_in: { type: "string", format: "date-time" },
    clock_out: { type: "string", format: "date-time" },
    justification: { type: "string" },
  },
});

const recalculatePointsRequestBody = createObjectRequestBody({
  example: {
    target_user_id: "user-uuid",
    date_from: "2026-04-01T00:00:00.000Z",
    date_to: "2026-04-30T00:00:00.000Z",
  },
  required: ["target_user_id", "date_from", "date_to"],
  properties: {
    target_user_id: { type: "string", format: "uuid" },
    date_from: { type: "string", format: "date-time" },
    date_to: { type: "string", format: "date-time" },
  },
});

const reopenTimeSheetRequestBody = createObjectRequestBody({
  example: { id: "timesheet-uuid", reason: "Correção autorizada antes do fechamento." },
  required: ["id", "reason"],
  properties: {
    id: { type: "string", format: "uuid" },
    reason: { type: "string" },
  },
});

const approveTimeClockAdjustmentRequestBody = createObjectRequestBody({
  example: {
    request_id: "request-uuid",
    obs_approver: "Ajuste validado pelo RH.",
  },
  required: ["request_id"],
  properties: {
    request_id: { type: "string" },
    obs_approver: { type: ["string", "null"] },
  },
});

const rejectTimeClockAdjustmentRequestBody = approveTimeClockAdjustmentRequestBody;

const categoryCreateRequestBody = createObjectRequestBody({
  example: {
    name: "Benefícios",
    active: true,
  },
  required: ["name"],
  properties: {
    name: { type: "string" },
    active: { type: "boolean" },
  },
});

const categoryUpdateRequestBody = createObjectRequestBody({
  example: {
    id: "category-uuid",
    name: "Folha de Pagamento",
    active: true,
  },
  required: ["id"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    active: { type: "boolean" },
  },
});

const categoryDeleteRequestBody = createObjectRequestBody({
  example: {
    id: "category-uuid",
  },
  required: ["id"],
  properties: {
    id: { type: "string" },
  },
});

const rhRequestCreateRequestBody = createObjectRequestBody({
  example: {
    title: "Solicitação de férias",
    description: "Quero solicitar férias para maio.",
    category_id: "category-uuid",
    urgency: "Medium",
  },
  required: ["title", "description", "category_id", "urgency"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category_id: { type: "string", format: "uuid" },
    assigned_to_user_id: { type: "string", format: "uuid" },
    urgency: { type: "string", enum: ["Low", "Medium", "High"] },
  },
});

const rhRequestUpdateRequestBody = createObjectRequestBody({
  example: {
    id: "request-uuid",
    title: "Solicitação de férias atualizada",
    description: "Alteração do período solicitado.",
    category_id: "category-uuid",
    assigned_to_user_id: "user-uuid",
    urgency: "High",
    status: "In_Progress",
  },
  required: ["id"],
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    category_id: { type: "string" },
    assigned_to_user_id: { type: "string" },
    urgency: { type: "string", enum: ["Low", "Medium", "High"] },
    status: { type: "string", enum: ["New", "In_Progress", "Resolved", "Closed"] },
  },
});

const rhRequestDeleteRequestBody = createObjectRequestBody({
  example: {
    id: "request-uuid",
  },
  required: ["id"],
  properties: {
    id: { type: "string" },
  },
});

const scoreQuestionCreateRequestBody = createObjectRequestBody({
  example: {
    question: "Demonstra colaboração com o time?",
    type: "behavioral",
  },
  required: ["question", "type"],
  properties: {
    question: { type: "string" },
    type: { type: "string", enum: ["behavioral", "technical", "tech", "leadership"] },
  },
});

const scoreQuestionUpdateRequestBody = createObjectRequestBody({
  example: {
    id: "question-uuid",
    question: "Comunica riscos com antecedência?",
    type: "leadership",
    active: true,
  },
  required: ["id"],
  properties: {
    id: { type: "string", format: "uuid" },
    question: { type: "string" },
    type: { type: "string", enum: ["behavioral", "technical", "tech", "leadership"] },
    active: { type: "boolean" },
  },
});

const scoreQuestionDeleteRequestBody = createObjectRequestBody({
  example: {
    id: "question-uuid",
  },
  required: ["id"],
  properties: {
    id: { type: "string", format: "uuid" },
  },
});

const scoreQuarterGenerateRequestBody = createObjectRequestBody({
  example: {
    target_user_id: "user-uuid",
    quarter: "2026-Q2",
  },
  required: ["target_user_id", "quarter"],
  properties: {
    target_user_id: { type: "string" },
    quarter: { type: "string" },
  },
});

const scoreQuarterNitroRequestBody = createObjectRequestBody({
  example: {
    score_id: "score-uuid",
    type: "projects",
    value: 9,
  },
  required: ["score_id", "type", "value"],
  properties: {
    score_id: { type: "string" },
    type: { type: "string", enum: ["projects", "hours", "errors", "folders"] },
    value: { type: "number" },
  },
});

const scoreEvaluationSubmitRequestBody = createObjectRequestBody({
  example: {
    evaluation_id: "evaluation-uuid",
    answers: [
      {
        question_id: "question-uuid",
        answer: 4,
        obs: "Boa comunicação durante o trimestre.",
      },
    ],
  },
  required: ["evaluation_id", "answers"],
  properties: {
    evaluation_id: { type: "string", format: "uuid" },
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_id: { type: "string" },
          answer: { type: "number" },
          obs: { type: "string" },
        },
        required: ["question_id", "answer"],
        additionalProperties: false,
      },
    },
  },
});

const holidayCreateRequestBody = createObjectRequestBody({
  example: {
    name: "Corpus Christi",
    date: "2026-06-04T00:00:00.000Z",
  },
  required: ["name", "date"],
  properties: {
    name: { type: "string" },
    date: { type: "string", format: "date-time" },
  },
});

const holidayUpdateRequestBody = createObjectRequestBody({
  example: {
    id: "holiday-uuid",
    name: "Corpus Christi",
    date: "2026-06-04T00:00:00.000Z",
  },
  required: ["id", "name", "date"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    date: { type: "string", format: "date-time" },
  },
});

const holidayDeleteRequestBody = createObjectRequestBody({
  example: {
    id: "holiday-uuid",
  },
  required: ["id"],
  properties: {
    id: { type: "string" },
  },
});

const timeBankReleaseCreateRequestBody = createObjectRequestBody({
  example: {
    user_id: "user-uuid",
    date: "2026-04-03T00:00:00.000Z",
    minutes: 120,
    reason: "Compensação de horas extras em sábado.",
  },
  required: ["user_id", "date", "minutes", "reason"],
  properties: {
    user_id: { type: "string", format: "uuid" },
    date: { type: "string", format: "date-time" },
    minutes: { type: "integer" },
    reason: { type: "string" },
  },
});

const timeBankReleaseApproveRequestBody = createObjectRequestBody({
  example: {
    id: "release-uuid",
  },
  required: ["id"],
  properties: {
    id: { type: "string", format: "uuid" },
  },
});

const messageCreateRequestBody = createObjectRequestBody({
  example: {
    request_id: "request-uuid",
    message: "Seu pedido foi encaminhado para aprovação.",
    type: "Message",
    attachment: "https://cdn.castelo.com/rh/attachment.pdf",
  },
  required: ["request_id", "message", "type"],
  properties: {
    request_id: { type: "string" },
    message: { type: "string" },
    type: { type: "string", enum: ["Message", "Solution", "Rejection", "Acceptance"] },
    attachment: { type: "string" },
  },
});

const timeSheetCreateRequestBody = createObjectRequestBody({
  example: {
    user_id: "user-uuid",
    start_time: "2026-04-22T00:00:00.000Z",
    end_time: "2026-05-22T23:59:59.999Z",
  },
  required: ["user_id"],
  properties: {
    user_id: { type: "string", format: "uuid" },
    start_time: { type: "string", format: "date-time" },
    end_time: { type: "string", format: "date-time" },
  },
});

const timeSheetRebuildRequestBody = createObjectRequestBody({
  example: { id: "timesheet-uuid" },
  required: ["id"],
  properties: {
    id: { type: "string", format: "uuid" },
  },
});

const timeSheetSignRequestBody = createObjectRequestBody({
  example: {
    id: "timesheet-uuid",
    signature: "Joao Silva",
  },
  required: ["id"],
  properties: {
    id: { type: "string", format: "uuid" },
    signature: { type: "string" },
  },
});

const scoreNitroUpdateRequestBody = createObjectRequestBody({
  example: {
    score_id: "score-uuid",
    type: "hours",
    value: 7,
  },
  required: ["score_id", "type", "value"],
  properties: {
    score_id: { type: "string", format: "uuid" },
    type: { type: "string", enum: ["projects", "hours", "errors", "folders"] },
    value: { type: "number" },
  },
});

const dossierUpdateRequestBody = createObjectRequestBody({
  example: {
    address: "Rua das Flores, 100",
    email: "ana.silva@example.com",
    phone: "+55 11 99999-9999",
  },
  properties: {
    target_user_id: { type: "string", format: "uuid" },
    full_name: { type: ["string", "null"] },
    gender: { type: ["string", "null"] },
    birth_date: { type: ["string", "null"], format: "date-time" },
    cpf: { type: ["string", "null"] },
    rg: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
    job_title: { type: ["string", "null"] },
    email: { type: ["string", "null"], format: "email" },
    phone: { type: ["string", "null"] },
    hire_date: { type: ["string", "null"], format: "date-time" },
    dominio_hire_date: { type: ["string", "null"], format: "date-time" },
    termination_date: { type: ["string", "null"], format: "date-time" },
    photo_url: { type: ["string", "null"], format: "uri" },
    status: { type: "string" },
    department_id: { type: "string", format: "uuid" },
  },
});

const contactCreateRequestBody = createObjectRequestBody({
  example: { name: "Carlos Silva", phone: "+55 11 98888-8888", reference: "Irmão" },
  required: ["name", "phone"],
  properties: {
    target_user_id: { type: "string", format: "uuid" },
    name: { type: "string", minLength: 1 },
    phone: { type: "string", minLength: 1 },
    reference: { type: "string" },
  },
});

const contactUpdateRequestBody = createObjectRequestBody({
  example: { id: "contact-uuid", phone: "+55 11 97777-7777" },
  required: ["id"],
  properties: {
    target_user_id: { type: "string", format: "uuid" },
    id: { type: "string", format: "uuid" },
    name: { type: "string", minLength: 1 },
    phone: { type: "string", minLength: 1 },
    reference: { type: ["string", "null"] },
  },
});

const contactDeleteRequestBody = createObjectRequestBody({
  example: { id: "contact-uuid" },
  required: ["id"],
  properties: {
    target_user_id: { type: "string", format: "uuid" },
    id: { type: "string", format: "uuid" },
  },
});

const allergyReplaceRequestBody = createObjectRequestBody({
  example: {
    allergies: [{ name: "Poeira", fonts: "Ambiental", action: "Evitar exposição" }],
  },
  required: ["allergies"],
  properties: {
    target_user_id: { type: "string", format: "uuid" },
    allergies: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "fonts", "action"],
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1 },
          fonts: { type: "string", minLength: 1 },
          action: { type: "string", minLength: 1 },
        },
      },
    },
  },
});

const dossierErrorResponses = {
  "400": { description: "Payload ou parâmetros inválidos" },
  "401": { description: "Autenticação ausente ou inválida" },
  "403": { description: "Permissão insuficiente" },
  "404": { description: "Colaborador ou contato não encontrado na organização" },
  "409": { description: "Cadastro alterado por outra operação" },
};

export function buildRhServiceOpenApiSpec(env: RhEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "rh-service",
      version: "1.0.0",
      description: "RH. Endpoints autenticados usam JWT e ficam sob o prefixo /rh.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "Ponto", description: "Configuracao, registro e ajuste de ponto" },
      { name: "Categorias", description: "Categorias de chamados RH" },
      { name: "OperacaoRH", description: "Dados auxiliares para operacao RH" },
      { name: "DossieRH", description: "Dossie cadastral, alergias e contatos de emergencia" },
      { name: "Solicitacoes", description: "Chamados e solicitacoes RH" },
      { name: "Mensagens", description: "Mensagens vinculadas aos chamados RH" },
      { name: "ScoreQuestions", description: "Perguntas de score" },
      { name: "ScoreQuarters", description: "Scores trimestrais e nitro" },
      { name: "ScoreEvaluations", description: "Avaliacoes de score" },
      { name: "Feriados", description: "Calendario de feriados" },
      { name: "BancoDeHoras", description: "Lancamentos de banco de horas" },
      { name: "TimeSheets", description: "Folhas de ponto" },
      { name: "ScoreNitro", description: "Atualizacao de metricas Nitro" },
      { name: "ReportingInternal", description: "Publicacao interna governada para relatórios" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        internalToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          description: "Resposta de sucesso padrao do workspace",
          additionalProperties: true,
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            "200": { description: "Servico disponivel", ...successJson },
          },
        },
      },
      "/internal/reporting/catalog": {
        get: {
          tags: ["ReportingInternal"],
          summary: "Obter catálogo interno de relatórios RH",
          security: internalToken,
          parameters: internalReportingParameters,
          responses: {
            "200": { description: "Catálogo seguro", ...successJson },
            "403": { description: "Credenciais ou grant inválido" },
          },
        },
      },
      "/internal/reporting/extract": {
        post: {
          tags: ["ReportingInternal"],
          summary: "Extrair dados seguros de fontes RH",
          security: internalToken,
          parameters: internalReportingParameters,
          ...internalReportingExtractRequestBody,
          responses: {
            "422": { description: "Capacidade de consulta excedida; nenhum resultado parcial" },
            "200": { description: "Dados extraídos", ...successJson },
            "400": { description: "Payload inválido" },
            "403": { description: "Credenciais, grant ou campo inválido" },
          },
        },
      },
      "/rh/point-config": {
        put: {
          tags: ["Ponto"],
          summary: "Criar ou atualizar configuracao de ponto",
          security: bearer,
          ...pointConfigRequestBody,
          responses: {
            "200": { description: "Configuracao salva", ...successJson },
          },
        },
        get: {
          tags: ["Ponto"],
          summary: "Obter configuracao de ponto do usuario autenticado",
          security: bearer,
          responses: {
            "200": { description: "Configuracao", ...successJson },
          },
        },
      },
      "/rh/point-config/{userId}": {
        get: {
          tags: ["Ponto"],
          summary: "Obter configuracao de ponto por usuario",
          security: bearer,
          parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Configuracao", ...successJson },
          },
        },
      },
      "/rh/point/register": {
        post: {
          tags: ["Ponto"],
          summary: "Registrar batida de ponto",
          security: bearer,
          responses: {
            "200": { description: "Ponto registrado", ...successJson },
          },
        },
      },
      "/rh/point/{pointId}/calculate": {
        post: {
          tags: ["Ponto"],
          summary: "Calcular horas diarias de um ponto",
          security: bearer,
          parameters: [{ name: "pointId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Horas calculadas", ...successJson },
          },
        },
      },
      "/rh/point/recalculate": {
        post: {
          tags: ["Ponto"],
          summary: "Recalcular pontos de um colaborador em um periodo",
          security: bearer,
          ...recalculatePointsRequestBody,
          responses: {
            "200": { description: "Pontos recalculados", ...successJson },
          },
        },
      },
      "/rh/point": {
        get: {
          tags: ["Ponto"],
          summary: "Listar registros de ponto",
          security: bearer,
          parameters: [
            { name: "date_from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "date_to", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "user_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Lista de registros", ...successJson },
          },
        },
      },
      "/rh/point/me/today": {
        get: {
          tags: ["Ponto"],
          summary: "Buscar ponto do dia do usuario autenticado",
          security: bearer,
          responses: {
            "200": { description: "Ponto do dia", ...successJson },
          },
        },
      },
      "/rh/point/summary": {
        get: {
          tags: ["Ponto"],
          summary: "Gerar resumo mensal de ponto",
          security: bearer,
          parameters: [
            {
              name: "month",
              in: "query",
              required: true,
              schema: { type: "string", example: "2026-05" },
            },
            { name: "user_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Resumo mensal", ...successJson },
          },
        },
      },
      "/rh/point/adjustment/request": {
        post: {
          tags: ["Ponto"],
          summary: "Solicitar ajuste de ponto",
          security: bearer,
          ...timeClockAdjustmentRequestBody,
          responses: {
            "201": { description: "Solicitacao criada", ...successJson },
          },
        },
      },
      "/rh/point/adjustment/approve-bulk": {
        put: {
          tags: ["Ponto"],
          summary: "Aprovar lote de ajustes de ponto",
          security: bearer,
          ...bulkApproveTimeClockAdjustmentRequestBody,
          responses: {
            "200": { description: "Lote aprovado", ...successJson },
          },
        },
      },
      "/rh/point/adjustment/retroactive": {
        post: {
          tags: ["Ponto"],
          summary: "Criar entrada retroativa de ponto",
          security: bearer,
          ...retroactiveTimeClockAdjustmentRequestBody,
          responses: {
            "201": { description: "Entrada retroativa criada", ...successJson },
          },
        },
      },
      "/rh/point/adjustment/{requestId}/attachment": {
        post: {
          tags: ["Ponto"],
          summary: "Enviar comprovante privado de ajuste",
          security: bearer,
          parameters: [
            {
              name: "requestId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: { type: "string", format: "binary" },
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            "200": { description: "Comprovante anexado", ...successJson },
          },
        },
      },
      "/rh/point/adjustment/approve": {
        put: {
          tags: ["Ponto"],
          summary: "Aprovar ajuste de ponto",
          security: bearer,
          ...approveTimeClockAdjustmentRequestBody,
          responses: {
            "200": { description: "Ajuste aprovado", ...successJson },
          },
        },
      },
      "/rh/point/adjustment/reject": {
        put: {
          tags: ["Ponto"],
          summary: "Rejeitar ajuste de ponto",
          security: bearer,
          ...rejectTimeClockAdjustmentRequestBody,
          responses: {
            "200": { description: "Ajuste rejeitado", ...successJson },
          },
        },
      },
      "/rh/point/adjustment/requests": {
        get: {
          tags: ["Ponto"],
          summary: "Listar solicitacoes de ajuste de ponto",
          security: bearer,
          parameters: [
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["Pendente", "Aprovado", "Rejeitado"] },
            },
            { name: "user_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Lista de solicitacoes", ...successJson },
          },
        },
      },
      "/rh/categories": {
        post: {
          tags: ["Categorias"],
          summary: "Criar categoria RH",
          security: bearer,
          ...categoryCreateRequestBody,
          responses: {
            "200": { description: "Categoria criada", ...successJson },
          },
        },
        put: {
          tags: ["Categorias"],
          summary: "Atualizar categoria RH",
          security: bearer,
          ...categoryUpdateRequestBody,
          responses: {
            "200": { description: "Categoria atualizada", ...successJson },
          },
        },
        get: {
          tags: ["Categorias"],
          summary: "Listar categorias RH",
          security: bearer,
          parameters: [{ name: "activeOnly", in: "query", schema: { type: "boolean" } }],
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
        delete: {
          tags: ["Categorias"],
          summary: "Excluir categoria RH",
          security: bearer,
          ...categoryDeleteRequestBody,
          responses: {
            "200": { description: "Categoria excluida", ...successJson },
          },
        },
      },
      "/rh/operational-users": {
        get: {
          tags: ["OperacaoRH"],
          summary: "Listar colaboradores ativos elegiveis para operacao RH",
          security: bearer,
          responses: {
            "200": { description: "Lista de colaboradores ativos", ...successJson },
          },
        },
      },
      "/rh/profile/colaborator": {
        get: {
          tags: ["DossieRH"],
          summary: "Obter dossie autorizado de colaborador",
          description:
            "O dossie completo inclui dados cadastrais e de vinculo apenas para o proprio colaborador ou RH administrativo.",
          security: bearer,
          parameters: [
            { name: "user_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Dossie autorizado", ...successJson },
            ...dossierErrorResponses,
          },
        },
        put: {
          tags: ["DossieRH"],
          summary: "Atualizar dossie autorizado",
          description:
            "Colaborador pode atualizar endereco, email e telefone; RH administrativo pode atualizar o cadastro completo.",
          security: bearer,
          ...dossierUpdateRequestBody,
          responses: {
            "200": { description: "Dossie atualizado", ...successJson },
            ...dossierErrorResponses,
          },
        },
      },
      "/rh/profile/colaborator/list": {
        get: {
          tags: ["DossieRH"],
          summary: "Listar projecao nao sensivel de colaboradores",
          description:
            "A lista nunca retorna CPF, RG, endereco, datas de vinculo, alergias ou contatos.",
          security: bearer,
          parameters: [
            { name: "department_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Projecao nao sensivel", ...successJson },
            ...dossierErrorResponses,
          },
        },
      },
      "/rh/profile/contact": {
        get: {
          tags: ["DossieRH"],
          summary: "Listar contatos de emergencia",
          security: bearer,
          parameters: [
            { name: "user_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Contatos autorizados", ...successJson },
            ...dossierErrorResponses,
          },
        },
        post: {
          tags: ["DossieRH"],
          summary: "Criar contato de emergencia",
          security: bearer,
          ...contactCreateRequestBody,
          responses: {
            "200": { description: "Contato criado", ...successJson },
            ...dossierErrorResponses,
          },
        },
        put: {
          tags: ["DossieRH"],
          summary: "Atualizar contato de emergencia",
          security: bearer,
          ...contactUpdateRequestBody,
          responses: {
            "200": { description: "Contato atualizado", ...successJson },
            ...dossierErrorResponses,
          },
        },
        delete: {
          tags: ["DossieRH"],
          summary: "Excluir contato de emergencia",
          security: bearer,
          ...contactDeleteRequestBody,
          responses: {
            "200": { description: "Contato excluido", ...successJson },
            ...dossierErrorResponses,
          },
        },
      },
      "/rh/profile/allergy": {
        get: {
          tags: ["DossieRH"],
          summary: "Listar alergias autorizadas",
          security: bearer,
          parameters: [
            { name: "user_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Alergias autorizadas", ...successJson },
            ...dossierErrorResponses,
          },
        },
        put: {
          tags: ["DossieRH"],
          summary: "Substituir alergias",
          security: bearer,
          ...allergyReplaceRequestBody,
          responses: {
            "200": { description: "Alergias atualizadas", ...successJson },
            ...dossierErrorResponses,
          },
        },
      },
      "/rh/requests": {
        post: {
          tags: ["Solicitacoes"],
          summary: "Criar solicitacao RH",
          security: bearer,
          ...rhRequestCreateRequestBody,
          responses: {
            "200": { description: "Solicitacao criada", ...successJson },
          },
        },
        get: {
          tags: ["Solicitacoes"],
          summary: "Listar solicitacoes RH",
          security: bearer,
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", minimum: 1, default: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["New", "In_Progress", "Resolved", "Closed"] },
            },
            { name: "category_id", in: "query", schema: { type: "string", format: "uuid" } },
            {
              name: "requester_user_id",
              in: "query",
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "assigned_to_user_id",
              in: "query",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Lista paginada de solicitacoes RH",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["success", "data"],
                    properties: {
                      success: { type: "boolean", enum: [true] },
                      data: {
                        type: "object",
                        required: ["items", "total", "page", "pageSize", "hasMore"],
                        properties: {
                          items: { type: "array", items: { type: "object" } },
                          total: { type: "integer", minimum: 0 },
                          page: { type: "integer", minimum: 1 },
                          pageSize: { type: "integer", minimum: 1, maximum: 100 },
                          hasMore: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        put: {
          tags: ["Solicitacoes"],
          summary: "Atualizar solicitacao RH",
          security: bearer,
          ...rhRequestUpdateRequestBody,
          responses: {
            "200": { description: "Solicitacao atualizada", ...successJson },
          },
        },
        delete: {
          tags: ["Solicitacoes"],
          summary: "Excluir solicitacao RH",
          security: bearer,
          ...rhRequestDeleteRequestBody,
          responses: {
            "200": { description: "Solicitacao excluida", ...successJson },
          },
        },
      },
      "/rh/requests/{id}": {
        get: {
          tags: ["Solicitacoes"],
          summary: "Buscar solicitacao RH por ID",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Solicitacao", ...successJson },
          },
        },
      },
      "/rh/score/questions": {
        post: {
          tags: ["ScoreQuestions"],
          summary: "Criar pergunta de score",
          security: bearer,
          ...scoreQuestionCreateRequestBody,
          responses: {
            "200": { description: "Pergunta criada", ...successJson },
          },
        },
        put: {
          tags: ["ScoreQuestions"],
          summary: "Atualizar pergunta de score",
          security: bearer,
          ...scoreQuestionUpdateRequestBody,
          responses: {
            "200": { description: "Pergunta atualizada", ...successJson },
          },
        },
        get: {
          tags: ["ScoreQuestions"],
          summary: "Listar perguntas de score",
          security: bearer,
          parameters: [
            {
              name: "type",
              in: "query",
              schema: { type: "string", enum: ["behavioral", "technical", "tech", "leadership"] },
            },
            { name: "all", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
        delete: {
          tags: ["ScoreQuestions"],
          summary: "Inativar pergunta de score",
          security: bearer,
          ...scoreQuestionDeleteRequestBody,
          responses: {
            "200": { description: "Pergunta inativada", ...successJson },
          },
        },
      },
      "/rh/score/quarters/generate": {
        post: {
          tags: ["ScoreQuarters"],
          summary: "Gerar score trimestral",
          security: bearer,
          ...scoreQuarterGenerateRequestBody,
          responses: {
            "200": { description: "Score gerado", ...successJson },
          },
        },
      },
      "/rh/score/quarters/nitro": {
        patch: {
          tags: ["ScoreQuarters"],
          summary: "Atualizar Nitro de um score trimestral",
          security: bearer,
          ...scoreQuarterNitroRequestBody,
          responses: {
            "200": { description: "Nitro atualizado", ...successJson },
          },
        },
      },
      "/rh/score/quarters/me": {
        get: {
          tags: ["ScoreQuarters"],
          summary: "Listar scores trimestrais do usuario autenticado",
          security: bearer,
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
      },
      "/rh/score/quarters/{id}": {
        get: {
          tags: ["ScoreQuarters"],
          summary: "Obter detalhe de score trimestral",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Detalhe", ...successJson },
          },
        },
      },
      "/rh/score/evaluations/pending": {
        get: {
          tags: ["ScoreEvaluations"],
          summary: "Listar avaliacoes pendentes de score",
          security: bearer,
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
      },
      "/rh/score/evaluations/submit": {
        post: {
          tags: ["ScoreEvaluations"],
          summary: "Submeter avaliacao de score",
          security: bearer,
          ...scoreEvaluationSubmitRequestBody,
          responses: {
            "200": { description: "Avaliacao enviada", ...successJson },
          },
        },
      },
      "/rh/holidays": {
        post: {
          tags: ["Feriados"],
          summary: "Criar feriado",
          security: bearer,
          ...holidayCreateRequestBody,
          responses: {
            "200": { description: "Feriado criado", ...successJson },
          },
        },
        put: {
          tags: ["Feriados"],
          summary: "Atualizar feriado",
          security: bearer,
          ...holidayUpdateRequestBody,
          responses: {
            "200": { description: "Feriado atualizado", ...successJson },
          },
        },
        get: {
          tags: ["Feriados"],
          summary: "Listar feriados",
          security: bearer,
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
        delete: {
          tags: ["Feriados"],
          summary: "Excluir feriado",
          security: bearer,
          ...holidayDeleteRequestBody,
          responses: {
            "200": { description: "Feriado excluido", ...successJson },
          },
        },
      },
      "/rh/time-bank/summary": {
        get: {
          tags: ["BancoDeHoras"],
          summary: "Obter resumo do banco de horas do usuario autenticado",
          security: bearer,
          responses: {
            "200": { description: "Resumo", ...successJson },
          },
        },
      },
      "/rh/time-bank/summary/{userId}": {
        get: {
          tags: ["BancoDeHoras"],
          summary: "Obter resumo do banco de horas por colaborador",
          security: bearer,
          parameters: [
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": { description: "Resumo", ...successJson },
          },
        },
      },
      "/rh/time-bank/overview": {
        get: {
          tags: ["BancoDeHoras"],
          summary: "Obter visao agregada do banco de horas",
          security: bearer,
          responses: {
            "200": { description: "Visao agregada", ...successJson },
          },
        },
      },
      "/rh/time-bank-releases/list": {
        get: {
          tags: ["BancoDeHoras"],
          summary: "Listar lancamentos de banco de horas",
          security: bearer,
          parameters: [
            { name: "user_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "is_approved", in: "query", schema: { type: "boolean" } },
            { name: "date_from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "date_to", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
      },
      "/rh/time-bank-releases": {
        post: {
          tags: ["BancoDeHoras"],
          summary: "Criar lancamento de banco de horas",
          security: bearer,
          ...timeBankReleaseCreateRequestBody,
          responses: {
            "200": { description: "Lancamento criado", ...successJson },
          },
        },
      },
      "/rh/time-bank-releases/approve": {
        put: {
          tags: ["BancoDeHoras"],
          summary: "Aprovar lancamento de banco de horas",
          security: bearer,
          ...timeBankReleaseApproveRequestBody,
          responses: {
            "200": { description: "Lancamento aprovado", ...successJson },
          },
        },
      },
      "/rh/messages": {
        post: {
          tags: ["Mensagens"],
          summary: "Criar mensagem de um chamado RH",
          security: bearer,
          ...messageCreateRequestBody,
          responses: {
            "200": { description: "Mensagem criada", ...successJson },
          },
        },
        get: {
          tags: ["Mensagens"],
          summary: "Listar mensagens de um chamado RH",
          security: bearer,
          parameters: [
            { name: "requestId", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
      },
      "/rh/timesheets": {
        post: {
          tags: ["TimeSheets"],
          summary: "Criar folha de ponto",
          security: bearer,
          ...timeSheetCreateRequestBody,
          responses: {
            "200": { description: "Folha criada", ...successJson },
          },
        },
        get: {
          tags: ["TimeSheets"],
          summary: "Listar folhas de ponto",
          security: bearer,
          parameters: [
            { name: "target_user_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
      },
      "/rh/timesheets/{id}": {
        get: {
          tags: ["TimeSheets"],
          summary: "Obter detalhe completo de folha de ponto",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe", ...successJson },
          },
        },
      },
      "/rh/timesheets/{id}/pdf": {
        get: {
          tags: ["TimeSheets"],
          summary: "Baixar PDF privado da folha de ponto",
          security: bearer,
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "PDF da folha",
              content: { "application/pdf": { schema: { type: "string", format: "binary" } } },
            },
          },
        },
      },
      "/rh/timesheets/sign": {
        put: {
          tags: ["TimeSheets"],
          summary: "Assinar folha de ponto",
          security: bearer,
          ...timeSheetSignRequestBody,
          responses: {
            "200": { description: "Folha assinada", ...successJson },
          },
        },
      },
      "/rh/timesheets/reopen": {
        put: {
          tags: ["TimeSheets"],
          summary: "Reabrir folha de ponto assinada",
          security: bearer,
          ...reopenTimeSheetRequestBody,
          responses: {
            "200": { description: "Folha reaberta", ...successJson },
          },
        },
      },
      "/rh/timesheets/rebuild": {
        put: {
          tags: ["TimeSheets"],
          summary: "Reconstruir uma folha de ponto aberta",
          security: bearer,
          ...timeSheetRebuildRequestBody,
          responses: {
            "200": { description: "Folha reconstruida", ...successJson },
          },
        },
      },
      "/rh/score/nitro/update": {
        put: {
          tags: ["ScoreNitro"],
          summary: "Atualizar metrica Nitro",
          security: bearer,
          ...scoreNitroUpdateRequestBody,
          responses: {
            "200": { description: "Metrica atualizada", ...successJson },
          },
        },
      },
    },
  };
}
