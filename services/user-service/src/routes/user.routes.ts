import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { createPhotoUploadMiddleware } from "@workspace/shared/upload";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createUserBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  userIdParamsSchema,
} from "../schemas/user.schemas.js";
import { StorageService } from "../services/storageService.js";
import { UserService } from "../services/userService.js";

const router: ReturnType<typeof Router> = Router();
const upload = createPhotoUploadMiddleware();
const userService = new UserService();
const storageService = new StorageService();

function requireUserAuth(request: Request) {
  return requireAuthenticatedRequestContext(request, {
    userIdMessage: "Não autenticado.",
    organizationIdMessage: "Não autenticado.",
  });
}

router.get(
  "/",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requireUserAuth(request);
      const { skip, take } = parseWithZod(listUsersQuerySchema, request.query);
      const result = await userService.list({ skip, take });

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
      requireUserAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);
      const user = await userService.getById(id);
      const publicPhotoUrl = storageService.readUserPhoto(user.photo_url);

      if (!publicPhotoUrl) {
        throw new ServiceError(404, "Foto nao encontrada.");
      }

      response.redirect(302, publicPhotoUrl);
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
      requireUserAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);
      const user = await userService.getById(id);

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
      requireUserAuth(request);
      const body = parseWithZod(createUserBodySchema, request.body);

      const user = await userService.create({
        ...body,
        first_owner_flag: body.first_owner_flag ?? false,
      });

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
      requireUserAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);
      const body = parseWithZod(updateUserBodySchema, request.body);

      const user = await userService.update(id, body);

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
  upload.single("file"),
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requireUserAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);

      if (!request.file) {
        throw new ServiceError(400, "Arquivo de imagem e obrigatorio.");
      }

      const photoUrl = await storageService.uploadUserPhoto(request.file, id);
      const user = await userService.update(id, { photo_url: photoUrl });

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
      requireUserAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);

      await storageService.deleteUserPhoto(id);
      const user = await userService.update(id, { photo_url: null });

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
      requireUserAuth(request);
      const { id } = parseWithZod(userIdParamsSchema, request.params);

      await userService.delete(id);

      response.json(createSuccessResponse({ message: "Usuario desativado com sucesso." }));
    } catch (err) {
      logError("Erro ao desativar usuario", { err });
      next(err);
    }
  },
);

export { router as userRoutes };
