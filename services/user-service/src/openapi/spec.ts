import { ACTIVE_MODULE_KEYS } from "@workspace/shared/auth";
import type { OpenApiDocument } from "@workspace/shared/http";

import type { UserServiceEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;
const bearer = [{ bearerAuth: [] }] as const;
const browserSession = [{ cookieAuth: [] }, { bearerAuth: [] }] as const;
const platformBrowserSession = [{ cookieAuth: [], gatewayInternalToken: [] }] as const;
const platformGateway = [{ gatewayInternalToken: [] }] as const;
const csrfHeader = {
  name: "x-csrf-token",
  in: "header",
  required: true,
  description: "Prova CSRF vinculada à sessão, exigida em mutações autenticadas por cookie.",
  schema: { type: "string" },
} as const;
const modularPermissionsSchema = {
  type: "object",
  description: "Níveis modulares do editor compartilhado: 0 a 3, apenas módulos ativos.",
  properties: Object.fromEntries(
    ACTIVE_MODULE_KEYS.map((moduleKey) => [moduleKey, { type: "integer", minimum: 0, maximum: 3 }]),
  ),
  additionalProperties: false,
  minProperties: 1,
} as const;

export function buildUserServiceOpenApiSpec(env: UserServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "user-service",
      version: "1.0.0",
      description:
        "Autenticação, usuários e permissões. O navegador usa a sessão `cw.session` HttpOnly emitida por este serviço e validada pelo gateway. Chamadas diretas internas ainda aceitam Bearer JWT ou contexto confiável protegido por token de serviço. O contexto de relatórios usa REPORTS_INTERNAL_TOKEN e não é exposto pelo gateway.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "Auth", description: "Sessão e configuração inicial" },
      { name: "Platform auth", description: "Sessão HTTP-only do administrador da plataforma" },
      { name: "Users", description: "Usuários" },
      { name: "Permission", description: "Permissões por usuário" },
      { name: "Internal reporting", description: "Contexto autoritativo para relatórios" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "cw.session",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        reportsInternalToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
          description: "Valor igual a REPORTS_INTERNAL_TOKEN.",
        },
        gatewayInternalToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
          description: "Valor igual a USER_SERVICE_INTERNAL_TOKEN; uso exclusivo do gateway.",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          description: "Resposta de sucesso padrão do workspace",
          additionalProperties: true,
        },
      },
    },
    paths: {
      "/internal/reporting/access-context": {
        post: {
          tags: ["Internal reporting"],
          summary: "Consultar contexto atual de acesso a relatórios (interno)",
          security: [{ reportsInternalToken: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["userId", "organizationId"],
                  properties: {
                    userId: { type: "string", format: "uuid" },
                    organizationId: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Contexto atual", ...successJson },
            "400": { description: "Payload inválido" },
            "403": { description: "Token interno inválido" },
            "404": { description: "Usuário, departamento ou organização incompatível" },
          },
        },
      },
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            "200": { description: "Serviço disponível", ...successJson },
          },
        },
      },
      "/platform/session": {
        post: {
          tags: ["Platform auth"],
          summary: "Login do administrador da plataforma",
          description: "Contrato interno: o navegador deve chamar esta rota pelo gateway.",
          security: platformGateway,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", format: "password" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Identidade do administrador sem credenciais no JSON; emite cw.session HttpOnly e cw.csrf.",
              ...successJson,
            },
            "400": { description: "Payload inválido" },
            "401": { description: "Credenciais inválidas" },
            "403": { description: "Token interno do gateway inválido" },
            "429": { description: "Limite local de tentativas excedido" },
          },
        },
        delete: {
          tags: ["Platform auth"],
          summary: "Revogar a sessão atual do administrador da plataforma",
          security: platformBrowserSession,
          parameters: [csrfHeader],
          responses: {
            "200": { description: "Sessão revogada e cookies expirados", ...successJson },
            "401": { description: "Sessão ausente, inválida ou revogada" },
            "403": { description: "Identidade ou prova CSRF inválida" },
          },
        },
      },
      "/platform/session/refresh": {
        post: {
          tags: ["Platform auth"],
          summary: "Rotacionar a sessão e a prova CSRF da plataforma",
          security: platformBrowserSession,
          parameters: [csrfHeader],
          responses: {
            "200": { description: "Novos cookies, sem token no JSON", ...successJson },
            "401": { description: "Sessão ausente, inválida ou revogada" },
            "403": { description: "Identidade ou prova CSRF inválida" },
            "409": { description: "Sessão já rotacionada concorrentemente" },
          },
        },
      },
      "/platform/impersonation/exit": {
        post: {
          tags: ["Platform auth"],
          summary: "Encerrar a personificação e retornar à plataforma",
          description:
            "Revoga a sessão de personificação, registra motivo e duração na organização-alvo e emite uma nova sessão da plataforma quando o operador continua ativo.",
          security: browserSession,
          parameters: [csrfHeader],
          responses: {
            "200": { description: "Cookies de plataforma emitidos ou expirados", ...successJson },
            "401": { description: "Sessão de personificação ausente, inválida ou revogada" },
            "403": { description: "CSRF inválido ou a sessão não é de personificação" },
            "503": { description: "Auditoria durável indisponível antes de encerrar" },
          },
        },
      },
      "/platform/me": {
        get: {
          tags: ["Platform auth"],
          summary: "Identidade autenticada da plataforma",
          security: platformBrowserSession,
          responses: {
            "200": { description: "Identidade server-side", ...successJson },
            "401": { description: "Sessão ausente, inválida ou revogada" },
            "403": { description: "Identidade organizacional não permitida" },
          },
        },
      },
      "/platform/super-admins": {
        get: {
          tags: ["Platform auth"],
          summary: "Listar super admins da plataforma",
          description:
            "Consulta somente leitura de nome, email, status e permissão de personificar. Não retorna credenciais.",
          security: platformBrowserSession,
          responses: {
            "200": { description: "Lista de super admins", ...successJson },
            "401": { description: "Sessão ausente, inválida ou revogada" },
            "403": { description: "Identidade organizacional não permitida" },
          },
        },
      },
      "/platform/super-admins/{superAdminId}/impersonation-permission": {
        patch: {
          tags: ["Platform auth"],
          summary: "Alterar permissão de personificação de um super admin",
          description:
            "Somente um operador autorizado pode alterar outro super admin. A operação é auditada e não permite autoalteração.",
          security: platformBrowserSession,
          parameters: [
            {
              name: "superAdminId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            csrfHeader,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["can_impersonate"],
                  properties: { can_impersonate: { type: "boolean" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Permissão atualizada", ...successJson },
            "400": { description: "Path ou payload inválido" },
            "401": { description: "Sessão de plataforma ausente ou inválida" },
            "403": { description: "CSRF ou operador sem permissão" },
            "404": { description: "Super admin não encontrado" },
            "409": { description: "Autoalteração ou conflito de concorrência" },
            "503": { description: "Auditoria durável indisponível" },
          },
        },
      },
      "/platform/organizations/{organizationId}/users": {
        get: {
          tags: ["Platform auth"],
          summary: "Listar usuários de uma organização pela plataforma",
          description:
            "Consulta somente leitura, restrita à sessão HTTP-only de um super administrador da plataforma. Não retorna credenciais ou dados pessoais sensíveis.",
          security: platformBrowserSession,
          parameters: [
            {
              name: "organizationId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            {
              name: "skip",
              in: "query",
              schema: { type: "integer", minimum: 0, maximum: 10_000, default: 0 },
            },
            {
              name: "take",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            },
            { name: "search", in: "query", schema: { type: "string", maxLength: 100 } },
          ],
          responses: {
            "200": { description: "Página de usuários da organização", ...successJson },
            "400": { description: "Parâmetros inválidos" },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Identidade não é um super administrador da plataforma" },
          },
        },
        post: {
          tags: ["Platform auth"],
          summary: "Criar usuário de uma organização pela plataforma",
          security: platformBrowserSession,
          parameters: [csrfHeader],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "login", "password", "department_id", "permission"],
                  properties: {
                    name: { type: "string" },
                    login: { type: "string" },
                    password: { type: "string", format: "password" },
                    department_id: { type: "string" },
                    permission: { type: "integer" },
                    type: { type: "string", enum: ["owner", "admin", "user"] },
                    status: { type: "string" },
                    modules: {
                      type: "object",
                      additionalProperties: { type: "integer", minimum: 0, maximum: 3 },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Usuário criado sem credenciais", ...successJson },
            "400": { description: "Payload inválido" },
            "401": { description: "Sessão ausente" },
            "403": { description: "CSRF ou identidade inválida" },
            "404": { description: "Departamento fora do tenant" },
            "409": { description: "Login duplicado" },
            "503": { description: "Auditoria indisponível" },
          },
        },
      },
      "/platform/organizations/{organizationId}/ownership-transfer": {
        post: {
          tags: ["Platform auth"],
          summary: "Transferir ownership de uma organização",
          description:
            "Ação excepcional e atômica. Promove um sucessor ativo do tenant, rebaixa ou desativa o owner anterior e invalida as sessões dos dois usuários.",
          security: platformBrowserSession,
          parameters: [
            {
              name: "organizationId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            csrfHeader,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "currentOwnerId",
                    "successorUserId",
                    "previousOwnerAction",
                    "justification",
                  ],
                  properties: {
                    currentOwnerId: { type: "string", minLength: 1 },
                    successorUserId: { type: "string", minLength: 1 },
                    previousOwnerAction: { type: "string", enum: ["demote", "deactivate"] },
                    justification: { type: "string", minLength: 1, maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Ownership transferido", ...successJson },
            "400": { description: "Payload inválido" },
            "401": { description: "Sessão de plataforma ausente ou inválida" },
            "403": { description: "CSRF ou identidade inválida" },
            "404": { description: "Owner atual ou sucessor fora do tenant" },
            "409": { description: "Conflito de concorrência ou sucessor inelegível" },
            "503": { description: "Auditoria durável indisponível antes da mutação" },
          },
        },
      },
      "/platform/organizations/{organizationId}/users/{userId}": {
        get: {
          tags: ["Platform auth"],
          summary: "Consultar usuário de uma organização pela plataforma",
          description:
            "Consulta somente leitura por sessão HTTP-only; o usuário deve pertencer à organização do path.",
          security: platformBrowserSession,
          parameters: [
            {
              name: "organizationId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
          ],
          responses: {
            "200": { description: "Detalhe de usuário sem campos sensíveis", ...successJson },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Identidade não é um super administrador da plataforma" },
            "404": { description: "Usuário não pertence à organização do contexto" },
          },
        },
        patch: {
          tags: ["Platform auth"],
          summary: "Editar usuário de uma organização pela plataforma",
          security: platformBrowserSession,
          parameters: [
            { name: "organizationId", in: "path", required: true, schema: { type: "string" } },
            { name: "userId", in: "path", required: true, schema: { type: "string" } },
            csrfHeader,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["expected_version"],
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    login: { type: "string" },
                    password: { type: "string", writeOnly: true },
                    department_id: { type: "string" },
                    permission: { type: "integer", minimum: 0, maximum: 3 },
                    status: { type: "string", enum: ["active", "inactive"] },
                    expected_version: { type: "integer", minimum: 1 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Usuário atualizado sem credenciais", ...successJson },
            "400": { description: "Payload inválido" },
            "401": { description: "Sessão ausente" },
            "403": { description: "CSRF ou identidade inválida" },
            "404": { description: "Usuário ou departamento fora do tenant" },
            "409": { description: "Login duplicado ou versão desatualizada" },
            "503": { description: "Auditoria indisponível" },
          },
        },
        delete: {
          tags: ["Platform auth"],
          summary: "Desativar usuário sem exclusão física",
          description:
            "Desativa o usuário da organização do path, revoga suas sessões e preserva o histórico. O último owner ativo deve usar a transferência de ownership.",
          security: platformBrowserSession,
          parameters: [
            {
              name: "organizationId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            csrfHeader,
          ],
          responses: {
            "200": { description: "Usuário desativado", ...successJson },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Identidade não é um super administrador ou CSRF inválido" },
            "404": { description: "Usuário não pertence à organização do contexto" },
            "409": {
              description: "Último owner ativo, versão desatualizada ou conflito de estado",
            },
            "503": { description: "Auditoria durável indisponível antes da mutação" },
          },
        },
      },
      "/platform/organizations/{organizationId}/users/{userId}/impersonate": {
        post: {
          tags: ["Platform auth"],
          summary: "Iniciar personificação de usuário da organização",
          description:
            "Emite a sessão de organização do alvo por 60 minutos, revoga a sessão atual da plataforma e registra o evento de auditoria.",
          security: platformBrowserSession,
          parameters: [
            { name: "organizationId", in: "path", required: true, schema: { type: "string" } },
            { name: "userId", in: "path", required: true, schema: { type: "string" } },
            csrfHeader,
          ],
          responses: {
            "200": {
              description: "Sessão do alvo em cookies HttpOnly; nenhum token no JSON",
              ...successJson,
            },
            "401": { description: "Sessão da plataforma ausente, inválida ou revogada" },
            "403": {
              description: "Operador sem permissão, usuário inativo ou organização inativa",
            },
            "404": { description: "Usuário não pertence à organização do path" },
            "503": { description: "Auditoria indisponível antes de iniciar a sessão" },
          },
        },
      },
      "/platform/organizations/{organizationId}/users/{userId}/reactivate": {
        post: {
          tags: ["Platform auth"],
          summary: "Reativar usuário para sessões futuras",
          description:
            "Permite novos logins sem restaurar qualquer sessão revogada durante a desativação.",
          security: platformBrowserSession,
          parameters: [
            {
              name: "organizationId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            csrfHeader,
          ],
          responses: {
            "200": { description: "Usuário reativado para sessões futuras", ...successJson },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Identidade não é um super administrador ou CSRF inválido" },
            "404": { description: "Usuário não pertence à organização do contexto" },
            "409": { description: "Versão desatualizada ou conflito de estado" },
            "503": { description: "Auditoria durável indisponível antes da mutação" },
          },
        },
      },
      "/platform/organizations/{organizationId}/users/{userId}/permissions": {
        get: {
          tags: ["Platform auth"],
          summary: "Ler permissões modulares pelo editor compartilhado",
          description:
            "Consulta as permissões do usuário exclusivamente dentro da organização selecionada.",
          security: platformBrowserSession,
          parameters: [
            {
              name: "organizationId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
          ],
          responses: {
            "200": { description: "Permissões modulares atuais", ...successJson },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Identidade não é um super administrador da plataforma" },
            "404": { description: "Usuário não pertence à organização do contexto" },
          },
        },
        put: {
          tags: ["Platform auth"],
          summary: "Salvar permissões modulares pelo editor compartilhado",
          description:
            "Atualização atômica no tenant do path; invalida sessões do usuário e é bloqueada se a auditoria durável estiver indisponível.",
          security: platformBrowserSession,
          parameters: [
            {
              name: "organizationId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
            csrfHeader,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: modularPermissionsSchema } },
          },
          responses: {
            "200": { description: "Permissões modulares atualizadas", ...successJson },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Identidade não é um super administrador ou CSRF inválido" },
            "404": { description: "Usuário não pertence à organização do contexto" },
            "409": { description: "Conflito de estado ou último owner ativo" },
            "422": { description: "Módulo ou nível de permissão incompatível" },
            "503": { description: "Auditoria durável indisponível antes da mutação" },
          },
        },
      },
      "/platform/organizations/{organizationId}/departments": {
        get: {
          tags: ["Platform auth"],
          summary: "Listar departamentos de uma organização pela plataforma",
          description:
            "Consulta somente leitura por sessão HTTP-only; retorna exclusivamente id e name.",
          security: platformBrowserSession,
          parameters: [
            {
              name: "organizationId",
              in: "path",
              required: true,
              schema: { type: "string", minLength: 1 },
            },
          ],
          responses: {
            "200": { description: "Departamentos da organização", ...successJson },
            "401": { description: "Sessão de plataforma ausente, inválida ou revogada" },
            "403": { description: "Identidade não é um super administrador da plataforma" },
          },
        },
      },
      "/platform/session/validate": {
        post: {
          tags: ["Platform auth"],
          summary: "Validar internamente uma sessão da plataforma",
          security: [{ gatewayInternalToken: [], bearerAuth: [] }],
          responses: {
            "200": { description: "Sessão válida", ...successJson },
            "401": { description: "Sessão ausente, inválida ou revogada" },
            "403": { description: "Token de serviço ou identidade não permitidos" },
          },
        },
      },
      "/user/session": {
        post: {
          tags: ["Auth"],
          summary: "Login (criar sessão)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["login", "password"],
                  properties: {
                    login: { type: "string" },
                    password: { type: "string" },
                  },
                  example: {
                    login: "admin@castelo.com",
                    password: "strong-password",
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "Usuário autenticado sem token no JSON; emite cw.session HttpOnly e cw.csrf por um dia.",
              ...successJson,
            },
            "401": { description: "Credenciais ou contexto da conta inválidos" },
          },
        },
        delete: {
          tags: ["Auth"],
          summary: "Encerrar e revogar a sessão atual",
          security: browserSession,
          parameters: [csrfHeader],
          responses: {
            "200": {
              description: "Sessão atual revogada e ambos os cookies expirados",
              ...successJson,
            },
            "401": { description: "Sessão inválida, ausente ou já revogada" },
          },
        },
      },
      "/user/session/refresh": {
        post: {
          tags: ["Auth"],
          summary: "Rotacionar a sessão e a prova CSRF",
          security: browserSession,
          parameters: [csrfHeader],
          responses: {
            "200": {
              description: "Novos cookies de sessão e CSRF, sem token no JSON",
              ...successJson,
            },
            "401": { description: "Sessão inválida, obsoleta ou revogada" },
          },
        },
      },
      "/user/session/validate": {
        get: {
          tags: ["Auth"],
          summary: "Validar a sessão atual",
          description:
            "Valida o JWT contra o usuário ativo e a versão de sessão persistida; usado pelo gateway para revogação imediata.",
          security: bearer,
          responses: {
            "200": { description: "Sessão válida", ...successJson },
            "401": { description: "Sessão inválida ou revogada" },
          },
        },
      },
      "/user/start-config": {
        post: {
          tags: ["Auth"],
          summary: "Primeira configuração (bootstrap)",
          responses: {
            "200": { description: "Usuário inicial", ...successJson },
          },
        },
      },
      "/user/me": {
        get: {
          tags: ["Auth"],
          summary: "Usuário autenticado (JWT ou contexto encaminhado pelo gateway)",
          description:
            "Retorna o usuário e o mapa de permissões modulares da organização autenticada. O mapa contém somente módulos ativos e níveis 0 a 3. Em sessões de personificação ativas, acrescenta `impersonation` com operador, organização e expiração; o campo é omitido nas sessões comuns.",
          security: bearer,
          responses: {
            "200": { description: "Dados do usuário", ...successJson },
          },
        },
      },
      "/user": {
        get: {
          tags: ["Users"],
          summary: "Listar usuários",
          security: bearer,
          parameters: [
            { name: "skip", in: "query", schema: { type: "integer" } },
            { name: "take", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            "200": { description: "Lista", ...successJson },
          },
        },
        post: {
          tags: ["Users"],
          summary: "Criar usuário",
          security: bearer,
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    login: { type: "string" },
                    password: { type: "string" },
                    department_id: { type: "string" },
                    permission: { type: "integer" },
                    status: { type: "string" },
                    photo_url: { type: "string" },
                    invited_by: { type: "string" },
                    organization_id: { type: "string" },
                    type: { type: "string" },
                    first_owner_flag: { type: "boolean" },
                    modules: {
                      type: "object",
                      additionalProperties: { type: "integer", minimum: 0, maximum: 3 },
                    },
                  },
                  required: ["name", "login", "password", "department_id", "permission"],
                  additionalProperties: true,
                  example: {
                    name: "Joao Silva",
                    login: "joao.silva@castelo.com",
                    password: "temporary-password",
                    department_id: "department-uuid",
                    permission: 2,
                    status: "active",
                    photo_url: "https://cdn.castelo.com/users/joao.png",
                    invited_by: "admin-user-uuid",
                    organization_id: "organization-uuid",
                    type: "owner",
                    first_owner_flag: true,
                    modules: {
                      integracao: 3,
                      rh: 1,
                      ti: 3,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Criado", ...successJson },
          },
        },
      },
      "/user/{id}": {
        get: {
          tags: ["Users"],
          summary: "Buscar usuário por ID",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Usuário", ...successJson },
          },
        },
        put: {
          tags: ["Users"],
          summary: "Atualizar usuário",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    login: { type: "string" },
                    password: { type: "string" },
                    department_id: { type: "string" },
                    permission: { type: "integer" },
                    status: { type: "string" },
                    photo_url: { type: "string" },
                    organization_id: { type: "string" },
                    type: { type: "string" },
                    first_owner_flag: { type: "boolean" },
                    modules: {
                      type: "object",
                      additionalProperties: { type: "integer", minimum: 0, maximum: 3 },
                    },
                  },
                  additionalProperties: true,
                  example: {
                    name: "Joao Silva Atualizado",
                    login: "joao.silva@castelo.com",
                    password: "new-password",
                    department_id: "department-uuid",
                    permission: 3,
                    status: "inactive",
                    photo_url: "https://cdn.castelo.com/users/joao-atualizado.png",
                    organization_id: "organization-uuid",
                    type: "user",
                    first_owner_flag: false,
                    modules: {
                      integracao: 2,
                      rh: 1,
                      ti: 3,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Atualizado", ...successJson },
          },
        },
        delete: {
          tags: ["Users"],
          summary: "Desativar usuário",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Desativado", ...successJson },
          },
        },
      },
      "/user/{id}/photo": {
        get: {
          tags: ["Users"],
          summary: "Obter URL pública da foto do usuário",
          description:
            "Retorna no envelope de sucesso `data.url` com a URL pública armazenada em `photo_url` (ex.: Supabase Storage). Se não houver URL pública, responde 404.",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "URL pública da foto",
              ...successJson,
            },
            "404": { description: "Usuário ou foto não encontrados" },
          },
        },
        post: {
          tags: ["Users"],
          summary: "Upload de foto do usuário",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                  },
                  required: ["file"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Foto atualizada", ...successJson },
          },
        },
        delete: {
          tags: ["Users"],
          summary: "Remover foto do usuário",
          security: bearer,
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Foto removida", ...successJson },
          },
        },
      },
      "/user/permission/{userId}": {
        get: {
          tags: ["Permission"],
          summary: "Buscar permissões do usuário",
          security: bearer,
          parameters: [
            { name: "userId", in: "path", required: true, schema: { type: "string" } },
            { name: "modulo", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Permissões", ...successJson },
          },
        },
        put: {
          tags: ["Permission"],
          summary: "Atualizar módulos de permissão",
          security: bearer,
          parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    certificado: { type: "integer", minimum: 0, maximum: 3 },
                    comercial: { type: "integer", minimum: 0, maximum: 3 },
                    contabil: { type: "integer", minimum: 0, maximum: 3 },
                    financeiro: { type: "integer", minimum: 0, maximum: 3 },
                    fiscal: { type: "integer", minimum: 0, maximum: 3 },
                    integracao: { type: "integer", minimum: 0, maximum: 3 },
                    marketing: { type: "integer", minimum: 0, maximum: 3 },
                    parcelamento: { type: "integer", minimum: 0, maximum: 3 },
                    pessoal: { type: "integer", minimum: 0, maximum: 3 },
                    regularize: { type: "integer", minimum: 0, maximum: 3 },
                    rh: { type: "integer", minimum: 0, maximum: 3 },
                    ti: { type: "integer", minimum: 0, maximum: 3 },
                    triagem: { type: "integer", minimum: 0, maximum: 3 },
                  },
                  additionalProperties: false,
                  example: {
                    integracao: 3,
                    rh: 1,
                    ti: 3,
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Atualizado", ...successJson },
          },
        },
      },
    },
  };
}
