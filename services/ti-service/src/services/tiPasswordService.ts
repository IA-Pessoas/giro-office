import { type EncryptionService, error as logError, ServiceError } from "@workspace/shared";

import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  CreateTiPasswordBody,
  DeactivateTiPasswordBody,
  ListTiPasswordsQuery,
  TiPasswordStatusFilter,
  UpdateTiPasswordBody,
} from "../schemas/tiPassword.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

type PasswordRecord = Record<string, unknown>;

interface TiPasswordListResult {
  items: unknown[];
  total: number;
  page: number;
  page_size: number;
  hasMore: boolean;
}

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

function getSearchTerm(query: ListTiPasswordsQuery): string | undefined {
  const term = (query.search ?? query.local)?.trim();

  return term || undefined;
}

function getActivePredicate(
  status: TiPasswordStatusFilter | undefined,
): Prisma.PasswordTecnologiaWhereInput {
  if (status === "all") {
    return {};
  }

  return { active: status !== "inactive" };
}

function buildPasswordWhere(
  context: TiAuthContext,
  query: ListTiPasswordsQuery,
): Prisma.PasswordTecnologiaWhereInput {
  const search = getSearchTerm(query);

  return {
    organization_id: context.organizationId,
    ...getActivePredicate(query.status),
    ...(query.user_id ? { user_id: query.user_id } : {}),
    ...(search
      ? {
          OR: [
            { local: { contains: search, mode: "insensitive" } },
            { notes: { contains: search, mode: "insensitive" } },
            {
              user: {
                is: {
                  OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { full_name: { contains: search, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };
}

export class TiPasswordService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService,
  ) {}

  async list(context: TiAuthContext, query: ListTiPasswordsQuery): Promise<TiPasswordListResult> {
    const { skip, take } = getPaginationParams(query);
    const page = query.page ?? 1;
    const where = buildPasswordWhere(context, query);
    const [total, passwords] = await Promise.all([
      this.prisma.passwordTecnologia.count({ where }),
      this.prisma.passwordTecnologia.findMany({
        where,
        include: SAFE_USER_INCLUDE,
        orderBy: { local: "asc" },
        skip,
        take,
      }),
    ]);

    return {
      items: passwords.map((password) => withoutPassword(password)),
      total,
      page,
      page_size: take,
      hasMore: skip + passwords.length < total,
    };
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    const password = await this.findPasswordOrThrow(context, id);
    this.assertActive(password);

    return this.withDecryptedPassword(password);
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
      const current = await this.findPasswordOrThrow(context, id);
      this.assertActive(current);

      if (body.user_id) {
        await this.ensureUser(context.organizationId, body.user_id);
      }

      const data = {
        ...body,
        ...(body.password ? { password: this.encryption.encrypt(body.password) } : {}),
      };
      const updateResult = await this.prisma.passwordTecnologia.updateMany({
        where: { id, organization_id: context.organizationId, active: true },
        data,
      });

      if (updateResult.count === 0) {
        throw new ServiceError(409, "Senha de TI inativa.");
      }

      return withoutPassword(await this.findPasswordOrThrow(context, id));
    } catch (err: unknown) {
      logError("Erro ao atualizar senha de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar senha de TI.", err);
    }
  }

  async deactivate(
    context: TiAuthContext,
    id: string,
    body: DeactivateTiPasswordBody,
  ): Promise<unknown> {
    try {
      const current = await this.findPasswordOrThrow(context, id);
      this.assertActive(current);
      const deactivatedAt = new Date();

      const updateResult = await this.prisma.passwordTecnologia.updateMany({
        where: { id, organization_id: context.organizationId, active: true },
        data: {
          active: false,
          deactivated_at: deactivatedAt,
          deactivated_by_user_id: context.userId,
          deactivation_reason: body.reason,
        },
      });

      if (updateResult.count === 0) {
        throw new ServiceError(409, "Senha de TI ja esta inativa.");
      }

      return withoutPassword(await this.findPasswordOrThrow(context, id));
    } catch (err: unknown) {
      logError("Erro ao inativar senha de TI", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao inativar senha de TI.", err);
    }
  }

  private async findPasswordOrThrow(context: TiAuthContext, id: string): Promise<PasswordRecord> {
    const password = await this.prisma.passwordTecnologia.findFirst({
      where: { id, organization_id: context.organizationId },
      include: SAFE_USER_INCLUDE,
    });

    if (!password) {
      throw new ServiceError(404, "Senha de TI nao encontrada.");
    }

    return withoutNestedUserPassword(password as PasswordRecord);
  }

  private assertActive(password: PasswordRecord): void {
    if (password.active === false) {
      throw new ServiceError(409, "Senha de TI inativa.");
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
    } catch {
      logError("Erro ao descriptografar senha de TI");
      throw new ServiceError(
        500,
        "Não foi possível revelar esta senha. Solicite à equipe de TI a revisão do cadastro.",
        undefined,
        undefined,
        { expose: true },
      );
    }
  }
}
