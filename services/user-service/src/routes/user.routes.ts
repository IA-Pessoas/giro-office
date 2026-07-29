import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { createPhotoUploadMiddleware, validateUploadFileSignature } from "@workspace/shared/upload";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createUserBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  userIdParamsSchema,
} from "../schemas/user.schemas.js";
import {
  isOwnerMutationPayload,
  requireManageUsersAuth,
  requireOwnerUserAuth,
} from "../security/userManagementAuth.js";
import { StorageService } from "../services/storageService.js";
import { UserService } from "../services/userService.js";

const router: ReturnType<typeof Router> = Router();
const upload = createPhotoUploadMiddleware();
const userService = new UserService();
const storageService = new StorageService();

function requireManageUsersAuthMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  try {
    requireManageUsersAuth(request);
    next();
  } catch (err) {
    next(err);
  }
}

function isSelfPasswordUpdate(request: Request, id: string, body: object): boolean {
  const keys = Object.keys(body);

  return request.user_id === id && keys.length === 1 && keys[0] === "password";
}

router.get(
  "/",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requireManageUsersAuth(request);
      const { skip, take } = parseWithZod(listUsersQuerySchema, request.query);
      const result = await userService.list({ skip, take, organizationId: auth.organization_id });

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar usuarios", { err });
      next(err);
    }
  },
);

router.get(
  "/:id/photo",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requireManageUsersAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);
      const user = await userService.getById(id, auth.organization_id);
      const publicPhotoUrl = storageService.readUserPhoto(user.photo_url);

      if (!publicPhotoUrl) {
        throw new ServiceError(404, "Foto nao encontrada.");
      }

      response.json(createSuccessResponse({ url: publicPhotoUrl }));
    } catch (err) {
      logError("Erro ao obter foto do usuario", { err });
      next(err);
    }
  },
);

router.get(
  "/:id",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requireManageUsersAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);
      const user = await userService.getById(id, auth.organization_id);

      response.json(createSuccessResponse(user));
    } catch (err) {
      logError("Erro ao buscar usuario por ID", { err });
      next(err);
    }
  },
);

router.post(
  "/",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requireManageUsersAuth(request);
      const body = parseWithZod(createUserBodySchema, request.body);
      if (body.organization_id !== undefined && body.organization_id !== auth.organization_id) {
        throw new ServiceError(403, "Organizacao da requisicao nao confere.");
      }
      if (isOwnerMutationPayload(body)) {
        requireOwnerUserAuth(request);
      }

      const user = await userService.create(
        {
          ...body,
          organization_id: auth.organization_id,
          first_owner_flag: body.first_owner_flag ?? false,
        },
        auth.user_id,
      );

      response.status(201).json(createSuccessResponse(user));
    } catch (err) {
      logError("Erro ao criar usuario", { err });
      next(err);
    }
  },
);

router.patch(
  "/:id",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { id } = parseWithZod(userIdParamsSchema, request.params);
      const body = parseWithZod(updateUserBodySchema, request.body);
      const selfPasswordUpdate = isSelfPasswordUpdate(request, id, body);
      const auth = selfPasswordUpdate
        ? requireAuthenticatedRequestContext(request, {
            userIdMessage: "Não autenticado.",
            organizationIdMessage: "Não autenticado.",
          })
        : requireManageUsersAuth(request);

      if (!selfPasswordUpdate && isOwnerMutationPayload(body)) {
        requireOwnerUserAuth(request);
      }

      const user = await userService.update(id, body, auth.organization_id, auth.user_id);

      response.json(createSuccessResponse(user));
    } catch (err) {
      logError("Erro ao atualizar usuario", { err });
      next(err);
    }
  },
);

router.post(
  "/:id/photo",
  isAuthenticated,
  requireManageUsersAuthMiddleware,
  upload.single("file"),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requireManageUsersAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);

      if (!request.file) {
        throw new ServiceError(400, "Arquivo de imagem e obrigatorio.");
      }

      validateUploadFileSignature(request.file);
      const photoUrl = await storageService.uploadUserPhoto(request.file, id);
      const user = await userService.update(id, { photo_url: photoUrl }, auth.organization_id);

      response.json(createSuccessResponse(user));
    } catch (err) {
      logError("Erro ao fazer upload de foto", { err });
      next(err);
    }
  },
);

router.delete(
  "/:id/photo",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requireManageUsersAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);

      await storageService.deleteUserPhoto(id);
      const user = await userService.update(id, { photo_url: null }, auth.organization_id);

      response.json(createSuccessResponse(user));
    } catch (err) {
      logError("Erro ao excluir foto", { err });
      next(err);
    }
  },
);

router.delete(
  "/:id",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = requireManageUsersAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);

      await userService.delete(id, auth.organization_id);

      response.json(createSuccessResponse({ message: "Usuario desativado com sucesso." }));
    } catch (err) {
      logError("Erro ao desativar usuario", { err });
      next(err);
    }
  },
);

export { router as userRoutes };
