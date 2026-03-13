import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { UserService } from "../services/UserService.js";

const router: ReturnType<typeof Router> = Router();
const userService = new UserService();

router.get("/", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const skip = Number(request.query.skip) || 0;
    const take = Number(request.query.take) || 20;

    const result = await userService.list({ skip, take });

    response.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar usuários", { err });
    next(err);
  }
});

router.get("/:id", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const user = await userService.getById(request.params.id);

    response.json(createSuccessResponse(user));
  } catch (err) {
    logError("Erro ao buscar usuário por ID", { err });
    next(err);
  }
});

router.post("/", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const {
      name,
      login,
      password,
      department_id,
      permission,
      status,
      photo_url,
      invited_by,
      organization_id,
      type,
      first_owner_flag,
      modules,
    } = request.body;

    if (!name || !login || !password || !department_id || permission === undefined) {
      throw new ServiceError(400, "Campos obrigatórios: name, login, password, department_id, permission.");
    }

    if ((type || modules) && !organization_id) {
      throw new ServiceError(400, "organization_id é obrigatório quando type ou modules forem enviados.");
    }

    const validTypes = ["admin", "owner", "user"] as const;
    if (type && !validTypes.includes(type)) {
      throw new ServiceError(400, "type deve ser admin, owner ou user.");
    }

    if (first_owner_flag === true && type !== "owner") {
      throw new ServiceError(
        400,
        "first_owner_flag só pode ser true quando type for owner.",
      );
    }

    const user = await userService.create({
      name,
      login,
      password,
      department_id,
      permission,
      status,
      photo_url,
      invited_by,
      organization_id,
      type,
      first_owner_flag: first_owner_flag ?? false,
      modules,
    });

    response.status(201).json(createSuccessResponse(user));
  } catch (err) {
    logError("Erro ao criar usuário", { err });
    next(err);
  }
});

router.patch("/:id", async (request: Request, response: Response, next: NextFunction) => {
  try {
    const {
      name,
      login,
      password,
      department_id,
      permission,
      status,
      photo_url,
      organization_id,
      type,
      first_owner_flag,
      modules,
    } = request.body;

    const validTypes = ["admin", "owner", "user"] as const;
    if (type !== undefined && type !== null && !validTypes.includes(type)) {
      throw new ServiceError(400, "type deve ser admin, owner ou user.");
    }

    if (first_owner_flag === true && type !== "owner") {
      throw new ServiceError(
        400,
        "first_owner_flag só pode ser true quando type for owner.",
      );
    }

    const user = await userService.update(request.params.id, {
      name,
      login,
      password,
      department_id,
      permission,
      status,
      photo_url,
      organization_id,
      type,
      first_owner_flag,
      modules,
    });

    response.json(createSuccessResponse(user));
  } catch (err) {
    logError("Erro ao atualizar usuário", { err });
    next(err);
  }
});

router.delete("/:id", async (request: Request, response: Response, next: NextFunction) => {
  try {
    await userService.delete(request.params.id);

    response.json(
      createSuccessResponse({ message: "Usuário desativado com sucesso." }),
    );
  } catch (err) {
    logError("Erro ao desativar usuário", { err });
    next(err);
  }
});

export { router as userRoutes };
