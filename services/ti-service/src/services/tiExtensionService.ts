import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import { getPaginationParams } from "../schemas/pagination.schemas.js";
import type {
  CreateTiExtensionBody,
  ListTiExtensionsQuery,
  UpdateTiExtensionBody,
} from "../schemas/tiExtension.schemas.js";
import type { TiAuthContext } from "./tiRequestService.js";

type ExtensionRecord = Record<string, unknown>;

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

function withoutNestedUserPassword(record: unknown): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return record;
  }

  const typedRecord = record as ExtensionRecord;
  const user = typedRecord.user;

  if (!user || typeof user !== "object" || Array.isArray(user)) {
    return record;
  }

  const { password: _password, ...safeUser } = user as Record<string, unknown>;

  return {
    ...typedRecord,
    user: safeUser,
  };
}

export class TiExtensionService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(context: TiAuthContext, query: ListTiExtensionsQuery): Promise<unknown[]> {
    const { skip, take } = getPaginationParams(query);
    const extensions = await this.prisma.extensionsTecnologia.findMany({
      where: {
        organization_id: context.organizationId,
        ...(query.user_id ? { user_id: query.user_id } : {}),
      },
      include: SAFE_USER_INCLUDE,
      orderBy: { number: "asc" },
      skip,
      take,
    });

    return extensions.map((extension) => withoutNestedUserPassword(extension));
  }

  async getById(context: TiAuthContext, id: string): Promise<unknown> {
    const extension = await this.prisma.extensionsTecnologia.findFirst({
      where: { id, organization_id: context.organizationId },
      include: SAFE_USER_INCLUDE,
    });

    if (!extension) {
      throw new ServiceError(404, "Ramal de TI não encontrado.");
    }

    return withoutNestedUserPassword(extension);
  }

  async create(context: TiAuthContext, body: CreateTiExtensionBody): Promise<unknown> {
    try {
      const duplicated = await this.prisma.extensionsTecnologia.findFirst({
        where: { organization_id: context.organizationId, number: body.number },
      });

      if (duplicated) {
        throw new ServiceError(409, "Já existe um ramal de TI com este número.");
      }

      await this.ensureUser(context.organizationId, body.user_id);

      return this.prisma.extensionsTecnologia.create({
        data: {
          user_id: body.user_id,
          number: body.number,
          organization_id: context.organizationId,
        },
      });
    } catch (err: unknown) {
      logError("Erro ao criar ramal de TI", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(409, "Já existe um ramal de TI com este número.", err);
      }
      throw new ServiceError(500, "Erro ao criar ramal de TI.", err);
    }
  }

  async update(context: TiAuthContext, id: string, body: UpdateTiExtensionBody): Promise<unknown> {
    try {
      await this.getById(context, id);

      if (body.user_id) {
        await this.ensureUser(context.organizationId, body.user_id);
      }

      if (body.number) {
        const duplicated = await this.prisma.extensionsTecnologia.findFirst({
          where: {
            organization_id: context.organizationId,
            number: body.number,
            NOT: { id },
          },
        });

        if (duplicated) {
          throw new ServiceError(409, "Já existe um ramal de TI com este número.");
        }
      }

      return this.prisma.extensionsTecnologia.update({
        where: { id },
        data: body,
      });
    } catch (err: unknown) {
      logError("Erro ao atualizar ramal de TI", { err });
      if (err instanceof ServiceError) throw err;
      if (isUniqueConstraintError(err)) {
        throw new ServiceError(409, "Já existe um ramal de TI com este número.", err);
      }
      throw new ServiceError(500, "Erro ao atualizar ramal de TI.", err);
    }
  }

  private async ensureUser(organizationId: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organization_id: organizationId },
    });

    if (!user) {
      throw new ServiceError(404, "Usuário não encontrado.");
    }
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}
