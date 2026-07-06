import { type EncryptionService, error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  CreateTiPasswordBody,
  ListTiPasswordsQuery,
  UpdateTiPasswordBody,
} from "../schemas/tiPassword.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

type PasswordRecord = Record<string, unknown>;

const SAFE_USER_INCLUDE = {
  user: {
    select: {
      id: true,
      name: true,
      full_name: true,
      department_id: true,
      organization_id: true,
    },
  },
} as const;

function withoutNestedUserPassword(record: PasswordRecord): PasswordRecord {
  const user = record.user;

  if (!user || typeof user !== "object" || Array.isArray(user)) {
    return record;
  }

  const { password: _userPassword, ...safeUser } = user as Record<string, unknown>;

  return {
    ...record,
    user: safeUser,
  };
}

function withoutPassword(record: unknown): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return record;
  }

  const { password: _password, ...safeRecord } = record as PasswordRecord;

  return withoutNestedUserPassword(safeRecord);
}

export class TiPasswordService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService,
  ) {}

  async list(context: TiAuthContext, query: ListTiPasswordsQuery): Promise<unknown[]> {
    const { skip, take } = getPaginationParams(query);
    const passwords = await this.prisma.passwordTecnologia.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.user_id ? { user_id: query.user_id } : {}),
      },
      include: SAFE_USER_INCLUDE,
      orderBy: { local: "asc" },
      skip,
      take,
    });

    return passwords.map((password) => withoutPassword(password));
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    const password = await this.prisma.passwordTecnologia.findFirst({
      where: { id, organization_id: context.organizationId },
      include: SAFE_USER_INCLUDE,
    });

    if (!password) {
      throw new ServiceError(404, "Senha de TI nao encontrada.");
    }

    if (context.permission < 3) {
      return withoutPassword(password);
    }

    return this.withDecryptedPassword(withoutNestedUserPassword(password as PasswordRecord));
  }

  async create(context: TiAuthContext, body: CreateTiPasswordBody): Promise<unknown> {
    try {
      await this.ensureUser(context.organizationId, body.user_id);

      const password = await this.prisma.passwordTecnologia.create({
        data: {
          local: body.local,
          user_id: body.user_id,
          password: this.encryption.encrypt(body.password),
          notes: body.notes,
          organization_id: context.organizationId,
        },
      });

      return withoutPassword(password);
    } catch (err: unknown) {
      logError("Erro ao criar senha de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar senha de TI.", err);
    }
  }

  async update(context: TiAuthContext, id: string, body: UpdateTiPasswordBody): Promise<unknown> {
    try {
      await this.getById(context, id);

      if (body.user_id) {
        await this.ensureUser(context.organizationId, body.user_id);
      }

      const data = {
        ...body,
        ...(body.password ? { password: this.encryption.encrypt(body.password) } : {}),
      };
      const password = await this.prisma.passwordTecnologia.update({
        where: { id },
        data,
      });

      return withoutPassword(password);
    } catch (err: unknown) {
      logError("Erro ao atualizar senha de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar senha de TI.", err);
    }
  }

  private async ensureUser(organizationId: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organization_id: organizationId },
    });

    if (!user) {
      throw new ServiceError(404, "Usuario nao encontrado.");
    }
  }

  private withDecryptedPassword(record: PasswordRecord): PasswordRecord {
    const password = record.password;

    if (typeof password !== "string") {
      return record;
    }

    try {
      return {
        ...record,
        password: this.encryption.decrypt(password),
      };
    } catch (err: unknown) {
      throw new ServiceError(500, "Erro ao descriptografar senha de TI.", err);
    }
  }
}
