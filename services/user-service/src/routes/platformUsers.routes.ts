import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import {
  listPlatformUsersQuerySchema,
  platformOrganizationUserParamsSchema,
  platformOrganizationUsersParamsSchema,
  transferPlatformOwnershipBodySchema,
} from "../schemas/platformUsers.schemas.js";
import { createUserBodySchema } from "../schemas/user.schemas.js";
import {
  requirePlatformCsrf,
  requirePlatformGatewayAuth,
  requirePlatformSession,
} from "../security/platformAuth.js";
import { PlatformUsersService } from "../services/platformUsersService.js";

export function createPlatformUsersRoutes(): ReturnType<typeof Router> {
  const router = Router();
  const platformUsersService = new PlatformUsersService();

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
