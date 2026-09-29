import type { MarketingServiceEnv } from "../config/env.js";

export function buildMarketingServiceOpenApiSpec(env: MarketingServiceEnv) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Marketing Service API",
      version: "1.0.0",
      description:
        "Dashboard, pesquisas mensais de IA e reconciliação de dados legados de Marketing.",
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
        get: protectedOperation("Consultar respostas pendentes e usuários sem integração."),
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
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
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
