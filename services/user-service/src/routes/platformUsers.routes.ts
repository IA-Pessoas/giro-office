import {
  createExpiredSessionCookieHeaders,
  createSessionCookieHeaders,
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { recordImpersonationEndEvent, type UserAuditRecorder } from "../integrations/audit.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { updatePermissionBodySchema } from "../schemas/permission.schemas.js";
import {
  listPlatformUsersQuerySchema,
  platformOrganizationUserParamsSchema,
  platformOrganizationUsersParamsSchema,
  platformSuperAdminParamsSchema,
  transferPlatformOwnershipBodySchema,
  updatePlatformSuperAdminImpersonationPermissionSchema,
  updatePlatformUserBodySchema,
} from "../schemas/platformUsers.schemas.js";
import { createUserBodySchema } from "../schemas/user.schemas.js";
import {
  requireImpersonationCsrf,
  requirePlatformCsrf,
  requirePlatformGatewayAuth,
  requirePlatformSession,
} from "../security/platformAuth.js";
import { AuthService, IMPERSONATION_SESSION_MAX_AGE_SECONDS } from "../services/authService.js";
import { PlatformUsersService } from "../services/platformUsersService.js";

export function createPlatformUsersRoutes(options: {
  audit?: UserAuditRecorder;
  authCookieSecure: boolean;
}): ReturnType<typeof Router> {
  const router = Router();
  const platformUsersService = new PlatformUsersService(options.audit);
  const authService = new AuthService();

  function parsePlatformPermissionUpdate(body: unknown): Record<string, number> {
    const result = updatePermissionBodySchema.safeParse(body);
    if (!result.success) {
      throw new ServiceError(422, result.error.issues[0]?.message ?? "Permissões inválidas.");
    }
    return result.data;
  }

  router.post(
    "/impersonation/exit",
    isAuthenticated,
    requireImpersonationCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const audit = options.audit;
        if (!audit) {
          throw new ServiceError(503, "Auditoria indisponível para encerrar personificação.");
        }

        const exited = await authService.exitImpersonation(
          {
            user_id: request.user_id,
            organization_id: request.organization_id,
            session_id: request.session_id,
            csrf_hash: request.csrf_hash,
          },
          (event) => recordImpersonationEndEvent(audit, event),
        );

        const session = exited.platformSession;
        response.append(
          "Set-Cookie",
          session
            ? createSessionCookieHeaders(session.token, session.csrfToken, {
                secure: options.authCookieSecure,
              })
            : createExpiredSessionCookieHeaders({ secure: options.authCookieSecure }),
        );
        response.json(createSuccessResponse({ identity: session?.identity ?? null }));
      } catch (err) {
        logError("Erro ao encerrar personificação", { err });
        next(err);
      }
    },
  );

  router.get(
    "/super-admins",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    async (_request: Request, response: Response, next: NextFunction) => {
      try {
        response.json(createSuccessResponse(await platformUsersService.listSuperAdmins()));
      } catch (err) {
        logError("Erro ao listar super admins da plataforma", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/super-admins/:superAdminId/impersonation-permission",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const operator = request.platform_identity;
        if (!operator) throw new ServiceError(401, "Não autenticado.");
        if (!operator.can_impersonate) {
          throw new ServiceError(403, "Você não tem permissão para alterar essa permissão.");
        }

        const { superAdminId } = parseWithZod(platformSuperAdminParamsSchema, request.params);
        const { can_impersonate } = parseWithZod(
          updatePlatformSuperAdminImpersonationPermissionSchema,
          request.body,
        );
        response.json(
          createSuccessResponse(
            await platformUsersService.updateSuperAdminImpersonationPermission(
              operator.id,
              superAdminId,
              can_impersonate,
            ),
          ),
        );
      } catch (err) {
        logError("Erro ao atualizar permissão de personificação do super admin", { err });
        next(err);
      }
    },
  );

  router.post(
    "/organizations/:organizationId/ownership-transfer",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId } = parseWithZod(
          platformOrganizationUsersParamsSchema,
          request.params,
        );
        const input = parseWithZod(transferPlatformOwnershipBodySchema, request.body);
        response.json(
          createSuccessResponse(
            await platformUsersService.transferOwnership(organizationId, input),
          ),
        );
      } catch (err) {
        logError("Erro ao transferir ownership pela plataforma", { err });
        next(err);
      }
    },
  );

  router.post(
    "/organizations/:organizationId/users",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId } = parseWithZod(
          platformOrganizationUsersParamsSchema,
          request.params,
        );
        const input = parseWithZod(createUserBodySchema, request.body);
        const user = await platformUsersService.create(
          organizationId,
          input,
          request.platform_identity?.id ?? "",
        );
        response.status(201).json(createSuccessResponse(user));
      } catch (err) {
        logError("Erro ao criar usuario da organizacao pela plataforma", { err });
        next(err);
      }
    },
  );

  router.get(
    "/organizations/:organizationId/users/:userId",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = parseWithZod(
          platformOrganizationUserParamsSchema,
          request.params,
        );
        response.json(
          createSuccessResponse(await platformUsersService.getById(organizationId, userId)),
        );
      } catch (err) {
        logError("Erro ao consultar usuario da organizacao pela plataforma", { err });
        next(err);
      }
    },
  );

  router.post(
    "/organizations/:organizationId/users/:userId/impersonate",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = parseWithZod(
          platformOrganizationUserParamsSchema,
          request.params,
        );
        const operator = request.platform_identity;
        const platformSession = request.platform_session;
        if (!operator || !platformSession) {
          throw new ServiceError(401, "Não autenticado.");
        }
        const audit = options.audit;
        if (!audit) {
          throw new ServiceError(503, "Auditoria indisponível para iniciar personificação.");
        }

        const issued = await authService.startImpersonation(
          {
            organizationId,
            targetUserId: userId,
            platformUserId: operator.id,
            platformSessionId: platformSession.session_id,
            platformSessionCsrfHash: platformSession.csrf_hash,
          },
          (event) =>
            audit({
              actorUserId: event.targetUserId,
              platformActorUserId: event.platformUserId,
              organizationId: event.organizationId,
              action: "platform.impersonation.started",
              referring: "user",
              referringId: event.targetUserId,
              changes: {
                operatorPlatformUserId: event.platformUserId,
                target: { id: event.targetUserId, name: event.targetName },
                startedAt: event.startedAt.toISOString(),
              },
              outcome: "success",
              required: true,
            }),
        );
        const {
          token,
          csrfToken,
          impersonationStartedAt: _impersonationStartedAt,
          ...target
        } = issued;
        response.append(
          "Set-Cookie",
          createSessionCookieHeaders(token, csrfToken, {
            secure: options.authCookieSecure,
            maxAgeSeconds: IMPERSONATION_SESSION_MAX_AGE_SECONDS,
          }),
        );
        response.json(createSuccessResponse(target));
      } catch (err) {
        logError("Erro ao iniciar personificação de usuário", { err });
        next(err);
      }
    },
  );

  router.get(
    "/organizations/:organizationId/users/:userId/permissions",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = parseWithZod(
          platformOrganizationUserParamsSchema,
          request.params,
        );
        response.json(
          createSuccessResponse(
            await platformUsersService.getPermissions(
              organizationId,
              userId,
              request.platform_identity?.id ?? "",
            ),
          ),
        );
      } catch (err) {
        logError("Erro ao consultar permissões do usuário pela plataforma", { err });
        next(err);
      }
    },
  );

  router.put(
    "/organizations/:organizationId/users/:userId/permissions",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = parseWithZod(
          platformOrganizationUserParamsSchema,
          request.params,
        );
        const modules = parsePlatformPermissionUpdate(request.body);
        response.json(
          createSuccessResponse(
            await platformUsersService.updatePermissions(
              organizationId,
              userId,
              modules,
              request.platform_identity?.id ?? "",
            ),
          ),
        );
      } catch (err) {
        logError("Erro ao atualizar permissões do usuário pela plataforma", { err });
        next(err);
      }
    },
  );

  router.get(
    "/organizations/:organizationId/departments",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId } = parseWithZod(
          platformOrganizationUsersParamsSchema,
          request.params,
        );
        response.json(
          createSuccessResponse(await platformUsersService.listDepartments(organizationId)),
        );
      } catch (err) {
        logError("Erro ao listar departamentos da organizacao pela plataforma", { err });
        next(err);
      }
    },
  );

  router.get(
    "/organizations/:organizationId/users",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId } = parseWithZod(
          platformOrganizationUsersParamsSchema,
          request.params,
        );
        const { skip, take, search } = parseWithZod(listPlatformUsersQuerySchema, request.query);
        const result = await platformUsersService.list({ organizationId, skip, take, search });

        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar usuarios da organizacao pela plataforma", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/organizations/:organizationId/users/:userId",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = parseWithZod(
          platformOrganizationUserParamsSchema,
          request.params,
        );
        response.json(
          createSuccessResponse(await platformUsersService.deactivate(organizationId, userId)),
        );
      } catch (err) {
        logError("Erro ao desativar usuario da organizacao pela plataforma", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/organizations/:organizationId/users/:userId",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = parseWithZod(
          platformOrganizationUserParamsSchema,
          request.params,
        );
        const input = parseWithZod(updatePlatformUserBodySchema, request.body);
        response.json(
          createSuccessResponse(await platformUsersService.update(organizationId, userId, input)),
        );
      } catch (err) {
        logError("Erro ao atualizar usuario da organizacao pela plataforma", { err });
        next(err);
      }
    },
  );

  router.post(
    "/organizations/:organizationId/users/:userId/reactivate",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId, userId } = parseWithZod(
          platformOrganizationUserParamsSchema,
          request.params,
        );
        response.json(
          createSuccessResponse(await platformUsersService.reactivate(organizationId, userId)),
        );
      } catch (err) {
        logError("Erro ao reativar usuario da organizacao pela plataforma", { err });
        next(err);
      }
    },
  );

  return router;
}
