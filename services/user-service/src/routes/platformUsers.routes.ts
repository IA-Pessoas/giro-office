import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import {
  listPlatformUsersQuerySchema,
  platformOrganizationUserParamsSchema,
  platformOrganizationUsersParamsSchema,
} from "../schemas/platformUsers.schemas.js";
import { createUserBodySchema } from "../schemas/user.schemas.js";
import { updatePermissionBodySchema } from "../schemas/permission.schemas.js";
import {
  requirePlatformCsrf,
  requirePlatformGatewayAuth,
  requirePlatformSession,
} from "../security/platformAuth.js";
import { PlatformUsersService } from "../services/platformUsersService.js";
import type { UserAuditRecorder } from "../integrations/audit.js";

export function createPlatformUsersRoutes(
  options: { audit?: UserAuditRecorder } = {},
): ReturnType<typeof Router> {
  const router = Router();
  const platformUsersService = new PlatformUsersService(options.audit);

  function parsePlatformPermissionUpdate(body: unknown): Record<string, number> {
    const result = updatePermissionBodySchema.safeParse(body);
    if (!result.success) {
      throw new ServiceError(422, result.error.issues[0]?.message ?? "Permissões inválidas.");
    }
    return result.data;
  }

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
