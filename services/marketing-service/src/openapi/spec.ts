import type { MarketingServiceEnv } from "../config/env.js";
import {
  MARKETING_EVENT_PRIORITIES,
  MARKETING_EVENT_STATUSES,
} from "../schemas/marketingEvent.schemas.js";

const marketingEventSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", maxLength: 50 },
    logo: { type: "string", maxLength: 100 },
    status: { type: "string", enum: MARKETING_EVENT_STATUSES },
    priority: { type: "string", enum: MARKETING_EVENT_PRIORITIES },
    objective: { type: "string" },
    audience: { type: "string" },
  },
  required: ["id", "name", "logo", "status", "priority", "objective", "audience"],
} as const;

const marketingEventInputSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 50 },
    logo: { type: "string", maxLength: 100, default: "" },
    priority: { type: "string", enum: MARKETING_EVENT_PRIORITIES },
    objective: { type: "string", default: "" },
    audience: { type: "string", default: "" },
  },
  required: ["name", "priority"],
  additionalProperties: false,
} as const;

const marketingEventUpdateSchema = {
  type: "object",
  properties: {
    ...marketingEventInputSchema.properties,
    status: {
      type: "string",
      enum: MARKETING_EVENT_STATUSES,
    },
  },
  required: [],
  minProperties: 1,
  additionalProperties: false,
} as const;

const editionListSchema = { type: "array", items: { type: "string", maxLength: 200 } } as const;
const editionPlanningSchema = (keys: readonly string[]) => ({
  type: "object",
  properties: Object.fromEntries(keys.map((key) => [key, editionListSchema])),
  required: [...keys],
  additionalProperties: false,
});
const marketingEventEditionInputSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 100 },
    date: { type: "string", format: "date" },
    place: { type: "string", minLength: 1, maxLength: 255 },
    budgetItems: {
      type: "array",
      maxItems: 500,
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          amount: { type: "string", pattern: "^(0|[1-9][0-9]{0,9})(\\.[0-9]{1,2})?$" },
        },
        required: ["name", "amount"],
        additionalProperties: false,
      },
    },
    partnerships: editionListSchema,
    organizingTeam: editionListSchema,
    logistics: editionPlanningSchema([
      "fornecedores",
      "cronograma",
      "registro",
      "transporte",
      "acomodacoes",
    ]),
    marketingCommunication: editionPlanningSchema(["abertura", "divulgacao", "acessoria", "site"]),
    duringEvent: editionPlanningSchema(["recepcao", "staff", "programacao", "feedback"]),
    afterEvent: editionPlanningSchema(["avaliacao", "agradecimento", "relatorio", "followup"]),
    notes: { type: "string", maxLength: 10000 },
    feedbackPeriodStart: {
      type: "string",
      format: "date-time",
      nullable: true,
      description: "Use junto com feedbackPeriodEnd; ambos devem estar preenchidos ou nulos.",
    },
    feedbackPeriodEnd: {
      type: "string",
      format: "date-time",
      nullable: true,
      description: "Use junto com feedbackPeriodStart; não pode ser anterior ao início.",
    },
  },
  required: [
    "name",
    "date",
    "place",
    "budgetItems",
    "partnerships",
    "organizingTeam",
    "logistics",
    "marketingCommunication",
    "duringEvent",
    "afterEvent",
    "notes",
  ],
  additionalProperties: false,
} as const;
const marketingEventEditionSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    eventId: { type: "string", format: "uuid" },
    name: { type: "string" },
    date: { type: "string", format: "date" },
    place: { type: "string" },
    budgetItems: { type: "array", items: { type: "object" } },
    budgetTotal: { type: "string", pattern: "^[0-9]+\\.[0-9]{2}$" },
    partnerships: editionListSchema,
    organizingTeam: editionListSchema,
    logistics: { type: "object" },
    marketingCommunication: { type: "object" },
    duringEvent: { type: "object" },
    afterEvent: { type: "object" },
    notes: { type: "string" },
    feedbackPeriodStart: { type: "string", format: "date-time", nullable: true },
    feedbackPeriodEnd: { type: "string", format: "date-time", nullable: true },
    feedback: {
      oneOf: [{ $ref: "#/components/schemas/MarketingEventEditionFeedback" }, { type: "null" }],
    },
  },
  required: [
    "id",
    "eventId",
    "name",
    "date",
    "place",
    "budgetItems",
    "budgetTotal",
    "partnerships",
    "organizingTeam",
    "logistics",
    "marketingCommunication",
    "duringEvent",
    "afterEvent",
    "notes",
    "feedbackPeriodStart",
    "feedbackPeriodEnd",
    "feedback",
  ],
} as const;

const marketingEventEditionFeedbackInputSchema = {
  type: "object",
  properties: {
    rating: { type: "integer", minimum: 1, maximum: 5 },
    observation: { type: "string", maxLength: 10000 },
  },
  required: ["rating"],
  additionalProperties: false,
} as const;
const marketingEventEditionFeedbackSchema = {
  type: "object",
  properties: {
    rating: { type: "integer", minimum: 1, maximum: 5 },
    observation: { type: "string", nullable: true },
    evaluatedAt: { type: "string", format: "date-time" },
  },
  required: ["rating", "observation", "evaluatedAt"],
} as const;
const marketingEventEditionReportSchema = {
  type: "object",
  properties: {
    event: { $ref: "#/components/schemas/MarketingEvent" },
    edition: { $ref: "#/components/schemas/MarketingEventEdition" },
  },
  required: ["event", "edition"],
} as const;

const marketingEventResponse = {
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    data: { $ref: "#/components/schemas/MarketingEvent" },
  },
  required: ["success", "data"],
} as const;
const marketingEventEditionResponse = {
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    data: { $ref: "#/components/schemas/MarketingEventEdition" },
  },
  required: ["success", "data"],
} as const;
const marketingEventEditionFeedbackResponse = {
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    data: { $ref: "#/components/schemas/MarketingEventEditionFeedback" },
  },
  required: ["success", "data"],
} as const;

export function buildMarketingServiceOpenApiSpec(env: MarketingServiceEnv) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Marketing Service API",
      version: "1.0.0",
      description:
        "Dashboard, pesquisas mensais de IA, credenciais seguras e eventos/edições de Marketing.",
    },
    servers: [{ url: `http://localhost:${env.port}` }],
    paths: {
      "/marketing/dashboard": {
        get: {
          summary: "Consultar dashboard inicial de Marketing",
          description:
            "Retorna contagens de solicitações existentes e aniversários da organização autenticada.",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Resumo do dashboard.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: { type: "object" },
                    },
                    required: ["success", "data"],
                  },
                },
              },
            },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão Marketing insuficiente." },
          },
        },
      },
      "/marketing/birthdays": {
        get: protectedOperation(
          "Listar aniversariantes do mês (query `month` 1-12): colaboradores ativos e clientes PF vinculados a empresas ativas.",
        ),
      },
      "/marketing/stock": {
        get: protectedOperation(
          "Consultar o estoque do departamento Marketing (cadastro Office) com quantidade e últimas entrada/saída.",
        ),
      },
      "/marketing/ai-usage-controls/users": {
        get: protectedOperation("Listar usuários ativos da organização elegíveis para pesquisa."),
      },
      "/marketing/ai-usage-controls": {
        post: protectedOperation("Criar pesquisa mensal para um usuário ativo."),
      },
      "/marketing/ai-usage-controls/batch": {
        post: protectedOperation("Criar pesquisas mensais para todos os usuários ativos."),
      },
      "/marketing/ai-usage-controls/list": {
        get: protectedOperation("Consultar respostas da competência selecionada."),
      },
      "/marketing/ai-usage-controls/report": {
        get: protectedOperation(
          "Consultar, na competência, controles pendentes (qualquer resposta ausente), sem resposta de conhecimento e com integração respondida como Não.",
        ),
      },
      "/marketing/ai-usage-controls/{id}": {
        patch: protectedOperation("Salvar respostas da pesquisa mensal."),
      },
      "/marketing/ai-usage-controls/import": {
        post: protectedOperation("Importar registros legados seguros e enfileirar casos ambíguos."),
      },
      "/marketing/ai-usage-controls/reconciliation": {
        get: protectedOperation("Listar registros legados pendentes de reconciliação."),
      },
      "/marketing/passwords/list": {
        get: protectedOperation("Listar metadados de credenciais sem revelar os segredos."),
      },
      "/marketing/passwords": {
        post: protectedOperation("Criar credencial criptografada para a organização autenticada."),
      },
      "/marketing/passwords/{id}": {
        get: protectedOperation("Consultar metadados de uma credencial."),
        patch: protectedOperation("Editar metadados e, opcionalmente, substituir o segredo."),
      },
      "/marketing/passwords/{id}/reveal": {
        post: protectedOperation("Revelar uma credencial após confirmação explícita."),
      },
      "/marketing/passwords/{id}/export": {
        post: protectedOperation("Exportar uma credencial após confirmação explícita."),
      },
      "/marketing/passwords/import": {
        post: protectedOperation(
          "Importar segredos legados verificáveis e colocar casos inseguros em quarentena.",
        ),
      },
      "/marketing/passwords/import/reconciliation": {
        get: protectedOperation(
          "Listar metadados de registros em quarentena, sem o conteúdo secreto.",
        ),
      },
      "/marketing/events/list": {
        get: {
          summary: "Listar eventos da organização",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "Eventos da organização autenticada.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean", example: true },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/MarketingEvent" },
                      },
                    },
                    required: ["success", "data"],
                  },
                },
              },
            },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão Marketing insuficiente." },
          },
        },
      },
      "/marketing/events": {
        post: {
          summary: "Cadastrar evento",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MarketingEventInput" } },
            },
          },
          responses: {
            "201": {
              description: "Evento cadastrado.",
              content: { "application/json": { schema: marketingEventResponse } },
            },
            "400": { description: "Dados do evento inválidos." },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão de edição do Marketing necessária." },
            "409": { description: "Já existe um evento com esse nome na organização." },
          },
        },
      },
      "/marketing/events/{id}": {
        put: {
          summary: "Editar evento",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/MarketingEventUpdate" } },
            },
          },
          responses: {
            "200": {
              description: "Evento atualizado.",
              content: { "application/json": { schema: marketingEventResponse } },
            },
            "400": { description: "Dados do evento inválidos." },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão de edição do Marketing necessária." },
            "404": { description: "Evento não encontrado na organização." },
            "409": { description: "Já existe um evento com esse nome na organização." },
          },
        },
      },
      "/marketing/events/{eventId}/editions": {
        get: {
          summary: "Listar edições do evento",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "eventId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Edições da organização autenticada.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/MarketingEventEdition" },
                      },
                    },
                    required: ["success", "data"],
                  },
                },
              },
            },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão Marketing insuficiente." },
          },
        },
        post: {
          summary: "Criar edição de evento",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "eventId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MarketingEventEditionInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Edição criada.",
              content: { "application/json": { schema: marketingEventEditionResponse } },
            },
            "400": { description: "Dados inválidos." },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão de edição do Marketing necessária." },
            "404": { description: "Evento não encontrado na organização." },
          },
        },
      },
      "/marketing/events/{eventId}/editions/{editionId}": {
        put: {
          summary: "Atualizar edição de evento",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "eventId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "editionId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MarketingEventEditionInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Edição atualizada.",
              content: { "application/json": { schema: marketingEventEditionResponse } },
            },
            "400": { description: "Dados inválidos." },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão de edição do Marketing necessária." },
            "404": { description: "Edição não encontrada na organização." },
          },
        },
      },
      "/marketing/events/{eventId}/editions/{editionId}/feedback": {
        post: {
          summary: "Registrar a avaliação única da edição",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "eventId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "editionId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MarketingEventEditionFeedbackInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Avaliação registrada.",
              content: { "application/json": { schema: marketingEventEditionFeedbackResponse } },
            },
            "400": { description: "Nota inválida; informe um valor inteiro entre 1 e 5." },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão de edição do Marketing necessária." },
            "404": { description: "Edição não encontrada na organização." },
            "409": { description: "Esta edição já possui uma avaliação." },
          },
        },
      },
      "/marketing/events/{eventId}/editions/{editionId}/report": {
        get: {
          summary: "Consultar relatório da edição",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "eventId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "editionId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Relatório da edição na organização autenticada.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { $ref: "#/components/schemas/MarketingEventEditionReport" },
                    },
                    required: ["success", "data"],
                  },
                },
              },
            },
            "401": { description: "Autenticação obrigatória." },
            "403": { description: "Permissão Marketing insuficiente." },
            "404": { description: "Edição não encontrada na organização." },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        MarketingEvent: marketingEventSchema,
        MarketingEventInput: marketingEventInputSchema,
        MarketingEventUpdate: marketingEventUpdateSchema,
        MarketingEventEditionInput: marketingEventEditionInputSchema,
        MarketingEventEdition: marketingEventEditionSchema,
        MarketingEventEditionFeedbackInput: marketingEventEditionFeedbackInputSchema,
        MarketingEventEditionFeedback: marketingEventEditionFeedbackSchema,
        MarketingEventEditionReport: marketingEventEditionReportSchema,
      },
    },
  };
}

function protectedOperation(summary: string) {
  return {
    summary,
    security: [{ bearerAuth: [] }],
    responses: {
      "200": { description: "Operação concluída." },
      "400": { description: "Dados inválidos." },
      "401": { description: "Autenticação obrigatória." },
      "403": { description: "Permissão Marketing insuficiente." },
    },
  };
}
