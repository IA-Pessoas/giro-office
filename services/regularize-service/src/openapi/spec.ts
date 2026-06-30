type OpenApiDocument = Record<string, unknown> & {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, unknown>;
};

interface RegularizeServiceOpenApiEnv {
  port: number;
}

function schemaRef(name: string): Record<string, unknown> {
  return { $ref: `#/components/schemas/${name}` };
}

function arrayOf(items: Record<string, unknown>): Record<string, unknown> {
  return { type: "array", items };
}

function successEnvelopeContent(dataSchema: Record<string, unknown> = {}) {
  return {
    content: {
      "application/json": {
        schema: {
          allOf: [
            schemaRef("SuccessEnvelope"),
            {
              type: "object",
              properties: {
                data: dataSchema,
              },
            },
          ],
        },
      },
    },
  };
}

function errorEnvelopeContent() {
  return {
    content: {
      "application/json": {
        schema: schemaRef("ErrorEnvelope"),
      },
    },
  };
}

function errorResponse(description: string) {
  return {
    description,
    ...errorEnvelopeContent(),
  };
}

function credentialErrorResponses() {
  return {
    "400": errorResponse("Requisicao invalida"),
    "401": errorResponse("Nao autenticado"),
    "403": errorResponse("Acesso negado"),
    "404": errorResponse("Recurso nao encontrado"),
    "409": errorResponse("Conflito de credencial"),
  };
}

function jsonRequestBody(schemaName: string) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: schemaRef(schemaName),
      },
    },
  };
}

export function buildRegularizeServiceOpenApiSpec(
  env: RegularizeServiceOpenApiEnv,
): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "regularize-service",
      version: "1.0.0",
      description: "API do modulo regularize, com rotas autenticadas e endpoints internos.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "Passwords", description: "Senhas por cliente" },
      { name: "Sites", description: "Sites e credenciais base" },
      { name: "PF", description: "Clientes PF do regularize" },
      { name: "Partners", description: "Quadro societario" },
      { name: "MunicipalTaxes", description: "Tributos municipais" },
      { name: "Processes", description: "Processos de regularize" },
      { name: "Guidance", description: "Orientacoes procedurais" },
      { name: "Licenses", description: "Alvaras e licencas" },
      { name: "Internal", description: "Rotinas internas de reconciliacao" },
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
          required: ["success", "data"],
          properties: {
            success: { type: "boolean", enum: [true] },
            data: {},
          },
          additionalProperties: false,
        },
        ErrorEnvelope: {
          type: "object",
          description: "Resposta de erro padrao do workspace",
          required: ["success", "error", "code"],
          properties: {
            success: { type: "boolean", enum: [false] },
            error: { type: "string" },
            code: { type: "string" },
            requestId: { type: "string" },
          },
          additionalProperties: false,
        },
        Uuid: {
          type: "string",
          format: "uuid",
        },
        PasswordListItem: {
          type: "object",
          description: "Senha de cliente sem login ou senha em claro.",
          required: ["id", "site_id", "site"],
          properties: {
            id: schemaRef("Uuid"),
            site_id: schemaRef("Uuid"),
            notes: { type: "string", nullable: true },
            site: {
              type: "object",
              required: ["name", "link", "sphere"],
              properties: {
                name: { type: "string" },
                link: { type: "string", nullable: true },
                sphere: { type: "string" },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        PasswordDetail: {
          type: "object",
          description: "Detalhe autorizado de senha de cliente.",
          required: ["id", "client_id", "site_id", "login", "password"],
          properties: {
            id: schemaRef("Uuid"),
            client_id: schemaRef("Uuid"),
            site_id: schemaRef("Uuid"),
            login: { type: "string" },
            password: { type: "string" },
            notes: { type: "string", nullable: true },
          },
          additionalProperties: false,
        },
        CreatePasswordBody: {
          type: "object",
          required: ["client_id", "site_id", "login", "password"],
          properties: {
            client_id: schemaRef("Uuid"),
            site_id: schemaRef("Uuid"),
            login: { type: "string", minLength: 1 },
            password: { type: "string", minLength: 1 },
            notes: { type: "string", nullable: true },
          },
          additionalProperties: false,
        },
        UpdatePasswordBody: {
          type: "object",
          required: ["id", "client_id", "site_id", "login", "password"],
          properties: {
            id: schemaRef("Uuid"),
            client_id: schemaRef("Uuid"),
            site_id: schemaRef("Uuid"),
            login: { type: "string", minLength: 1 },
            password: { type: "string", minLength: 1 },
            notes: { type: "string", nullable: true },
          },
          additionalProperties: false,
        },
        SitePasswordListItem: {
          type: "object",
          description: "Site base sem senha em claro.",
          required: ["id", "name", "sphere", "user", "status"],
          properties: {
            id: schemaRef("Uuid"),
            name: { type: "string" },
            sphere: { type: "string" },
            link: { type: "string", nullable: true },
            user: { type: "string" },
            status: { type: "boolean" },
          },
          additionalProperties: false,
        },
        SitePasswordDetail: {
          type: "object",
          description: "Detalhe autorizado de site base com senha revelada.",
          required: ["id", "name", "sphere", "user", "password", "status"],
          properties: {
            id: schemaRef("Uuid"),
            name: { type: "string" },
            sphere: { type: "string" },
            link: { type: "string", nullable: true },
            user: { type: "string" },
            password: { type: "string" },
            status: { type: "boolean" },
          },
          additionalProperties: false,
        },
        CreateSitePasswordBody: {
          type: "object",
          required: ["name", "sphere", "user", "password"],
          properties: {
            name: { type: "string", minLength: 1 },
            sphere: { type: "string", minLength: 1 },
            link: { type: "string", format: "uri", nullable: true },
            user: { type: "string", minLength: 1 },
            password: { type: "string", minLength: 1 },
          },
          additionalProperties: false,
        },
        UpdateSitePasswordBody: {
          type: "object",
          required: ["id", "name", "sphere", "user", "password", "status"],
          properties: {
            id: schemaRef("Uuid"),
            name: { type: "string", minLength: 1 },
            sphere: { type: "string", minLength: 1 },
            link: { type: "string", format: "uri", nullable: true },
            user: { type: "string", minLength: 1 },
            password: { type: "string", minLength: 1 },
            status: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            "200": {
              description: "Servico disponivel",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/regularize/passwords": {
        get: {
          tags: ["Passwords"],
          summary: "Listar senhas por cliente",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "Lista de senhas",
              ...successEnvelopeContent(arrayOf(schemaRef("PasswordListItem"))),
            },
            ...credentialErrorResponses(),
          },
        },
        post: {
          tags: ["Passwords"],
          summary: "Criar senha",
          security: [{ bearerAuth: [] }],
          requestBody: jsonRequestBody("CreatePasswordBody"),
          responses: {
            "201": {
              description: "Senha criada",
              ...successEnvelopeContent(schemaRef("PasswordDetail")),
            },
            ...credentialErrorResponses(),
          },
        },
        put: {
          tags: ["Passwords"],
          summary: "Atualizar senha",
          security: [{ bearerAuth: [] }],
          requestBody: jsonRequestBody("UpdatePasswordBody"),
          responses: {
            "200": {
              description: "Senha atualizada",
              ...successEnvelopeContent(schemaRef("PasswordDetail")),
            },
            ...credentialErrorResponses(),
          },
        },
      },
      "/regularize/password": {
        get: {
          tags: ["Passwords"],
          summary: "Detalhar senha",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Detalhe da senha",
              ...successEnvelopeContent(schemaRef("PasswordDetail")),
            },
            ...credentialErrorResponses(),
          },
        },
      },
      "/regularize/sites-pass": {
        get: {
          tags: ["Sites"],
          summary: "Listar sites base",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "status", in: "query", required: true, schema: { type: "boolean" } },
          ],
          responses: {
            "200": {
              description: "Lista de sites",
              ...successEnvelopeContent(arrayOf(schemaRef("SitePasswordListItem"))),
            },
            ...credentialErrorResponses(),
          },
        },
        post: {
          tags: ["Sites"],
          summary: "Criar site base",
          security: [{ bearerAuth: [] }],
          requestBody: jsonRequestBody("CreateSitePasswordBody"),
          responses: {
            "201": {
              description: "Site criado",
              ...successEnvelopeContent(schemaRef("SitePasswordListItem")),
            },
            ...credentialErrorResponses(),
          },
        },
        put: {
          tags: ["Sites"],
          summary: "Atualizar site base",
          security: [{ bearerAuth: [] }],
          requestBody: jsonRequestBody("UpdateSitePasswordBody"),
          responses: {
            "200": {
              description: "Site atualizado",
              ...successEnvelopeContent(schemaRef("SitePasswordListItem")),
            },
            ...credentialErrorResponses(),
          },
        },
      },
      "/regularize/sites-pass-detail": {
        get: {
          tags: ["Sites"],
          summary: "Detalhar site base",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Detalhe do site",
              ...successEnvelopeContent(schemaRef("SitePasswordDetail")),
            },
            ...credentialErrorResponses(),
          },
        },
      },
      "/regularize/pf": {
        get: {
          tags: ["PF"],
          summary: "Detalhar cliente PF",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe do cliente PF", ...successEnvelopeContent() },
          },
        },
        post: {
          tags: ["PF"],
          summary: "Criar cliente PF",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Cliente PF criado", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["PF"],
          summary: "Atualizar cliente PF",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Cliente PF atualizado", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/pfs": {
        get: {
          tags: ["PF"],
          summary: "Listar clientes PF",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "status", in: "query", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Lista de clientes PF", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/partners": {
        get: {
          tags: ["Partners"],
          summary: "Listar socios",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "type",
              in: "query",
              required: true,
              schema: { type: "string", enum: ["pf", "pj"] },
            },
            {
              name: "client_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: { "200": { description: "Lista de socios", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["Partners"],
          summary: "Criar socio",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Socio criado", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Partners"],
          summary: "Atualizar socio",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Socio atualizado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/partner": {
        get: {
          tags: ["Partners"],
          summary: "Detalhar socio",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Detalhe do socio", ...successEnvelopeContent() } },
        },
      },
      "/regularize/municipal-taxes": {
        get: {
          tags: ["MunicipalTaxes"],
          summary: "Listar tributos municipais por ano",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "year", in: "query", required: true, schema: { type: "integer" } }],
          responses: {
            "200": { description: "Lista de tributos municipais", ...successEnvelopeContent() },
          },
        },
        post: {
          tags: ["MunicipalTaxes"],
          summary: "Criar tributo municipal",
          security: [{ bearerAuth: [] }],
          responses: {
            "201": { description: "Tributo municipal criado", ...successEnvelopeContent() },
          },
        },
        put: {
          tags: ["MunicipalTaxes"],
          summary: "Atualizar tributo municipal",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Tributo municipal atualizado", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/municipal-taxes-detail": {
        get: {
          tags: ["MunicipalTaxes"],
          summary: "Detalhar tributo municipal",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe do tributo municipal", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/process": {
        get: {
          tags: ["Processes"],
          summary: "Detalhar processo",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Detalhe do processo", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["Processes"],
          summary: "Criar processo",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Processo criado", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Processes"],
          summary: "Atualizar processo",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Processo atualizado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/processes": {
        get: {
          tags: ["Processes"],
          summary: "Listar processos",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "status", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Lista de processos", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance": {
        post: {
          tags: ["Guidance"],
          summary: "Criar orientacao procedural",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Orientacao criada", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Guidance"],
          summary: "Atualizar orientacao procedural",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Orientacao atualizada", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/guidance/detail": {
        get: {
          tags: ["Guidance"],
          summary: "Detalhar orientacao procedural",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": { description: "Detalhe da orientacao", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/guidance/list": {
        get: {
          tags: ["Guidance"],
          summary: "Listar orientacoes por processo",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "process_id",
              in: "query",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": { description: "Lista de orientacoes", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/guidance/activity/add": {
        post: {
          tags: ["Guidance"],
          summary: "Adicionar atividade economica",
          security: [{ bearerAuth: [] }],
          responses: {
            "200": { description: "Atividade adicionada", ...successEnvelopeContent() },
          },
        },
      },
      "/regularize/guidance/activity/remove": {
        post: {
          tags: ["Guidance"],
          summary: "Remover atividade economica",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Atividade removida", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/partner/add": {
        post: {
          tags: ["Guidance"],
          summary: "Adicionar socio na orientacao",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Socio adicionado", ...successEnvelopeContent() } },
        },
      },
      "/regularize/guidance/partner/remove": {
        post: {
          tags: ["Guidance"],
          summary: "Remover socio da orientacao",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Socio removido", ...successEnvelopeContent() } },
        },
      },
      "/regularize/license": {
        get: {
          tags: ["Licenses"],
          summary: "Detalhar licenca",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Detalhe da licenca", ...successEnvelopeContent() } },
        },
        post: {
          tags: ["Licenses"],
          summary: "Criar licenca",
          security: [{ bearerAuth: [] }],
          responses: { "201": { description: "Licenca criada", ...successEnvelopeContent() } },
        },
        put: {
          tags: ["Licenses"],
          summary: "Atualizar licenca",
          security: [{ bearerAuth: [] }],
          responses: { "200": { description: "Licenca atualizada", ...successEnvelopeContent() } },
        },
      },
      "/regularize/licenses": {
        get: {
          tags: ["Licenses"],
          summary: "Listar licencas",
          security: [{ bearerAuth: [] }],
          parameters: [{ name: "status", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Lista de licencas", ...successEnvelopeContent() } },
        },
      },
      "/internal/reconciliation/run": {
        post: {
          tags: ["Internal"],
          summary: "Executar reconciliacao interna do regularize",
          security: [{ internalToken: [] }],
          responses: {
            "200": {
              description: "Reconciliacao executada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/internal/reconciliation/license-notifications/run": {
        post: {
          tags: ["Internal"],
          summary: "Executar reconciliacao de notificacoes de licencas",
          security: [{ internalToken: [] }],
          responses: {
            "200": {
              description: "Reconciliacao de licencas executada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/internal/reconciliation/client-pf-status/run": {
        post: {
          tags: ["Internal"],
          summary: "Executar reconciliacao de status de cliente PF",
          security: [{ internalToken: [] }],
          responses: {
            "200": {
              description: "Reconciliacao de status executada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
      "/internal/reconciliation/client-pf-documents/run": {
        post: {
          tags: ["Internal"],
          summary: "Executar reconciliacao de documentos vencidos de cliente PF",
          security: [{ internalToken: [] }],
          responses: {
            "200": {
              description: "Reconciliacao de documentos executada",
              ...successEnvelopeContent(),
            },
          },
        },
      },
    },
  };
}
