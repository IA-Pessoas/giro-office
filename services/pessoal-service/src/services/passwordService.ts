import { error as logError, ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreatePasswordBody,
  ListPasswordsQuery,
  UpdatePasswordBody,
} from "../schemas/password.schemas.js";
import type { PessoalAuditService } from "./pessoalAuditService.js";
import type { PessoalPasswordCrypto } from "./pessoalPasswordCrypto.js";
import { omitUndefined, type PessoalAuthContext, requireUserId } from "./pessoalServiceTypes.js";

const passwordListSelect = {
  id: true,
  client_id: true,
  service_name: true,
  responsavel_id: true,
  responsavel: {
    select: {
      id: true,
      name: true,
      full_name: true,
    },
  },
} as const;

const passwordDetailSelect = {
  ...passwordListSelect,
  login_main: true,
  senha_main: true,
  login_secondary: true,
  senha_secondary: true,
  notes: true,
  organization_id: true,
} as const;

type ResponsibleDisplay = {
  id: string;
  name: string;
  full_name: string | null;
} | null;

export interface PasswordListRecord {
  id: string;
  client_id: string;
  service_name: string;
  responsavel_id: string | null;
  responsavel: ResponsibleDisplay;
}

export interface PasswordDetailRecord extends PasswordListRecord {
  login_main: string | null;
  senha_main: string | null;
  login_secondary: string | null;
  senha_secondary: string | null;
  notes: string | null;
  organization_id: string;
}

type PasswordSecretFields = Pick<
  PasswordDetailRecord,
  "login_main" | "senha_main" | "login_secondary" | "senha_secondary"
>;

type PasswordCreateData = {
  client_id: string;
  service_name: string;
  login_main: string | null;
  senha_main: string | null;
  login_secondary: string | null;
  senha_secondary: string | null;
  responsavel_id: string | null;
  notes: string | null;
  organization_id: string;
};

type PasswordUpdateData = Partial<
  Pick<
    PasswordCreateData,
    | "service_name"
    | "login_main"
    | "senha_main"
    | "login_secondary"
    | "senha_secondary"
    | "responsavel_id"
    | "notes"
  >
>;

const SECRET_FIELD_NAMES = [
  "login_main",
  "senha_main",
  "login_secondary",
  "senha_secondary",
] as const;

export class PasswordService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: PessoalPasswordCrypto,
    private readonly auditService: PessoalAuditService,
  ) {}

  async list(
    context: Pick<PessoalAuthContext, "organizationId">,
    query: ListPasswordsQuery,
  ): Promise<PasswordListRecord[]> {
    const passwords = await this.prisma.passwordPessoal.findMany({
      where: {
        organization_id: context.organizationId,
        client_id: query.client_id,
      },
      select: passwordListSelect,
      orderBy: { service_name: "asc" },
    });

    return passwords.map((password) => toPasswordListRecord(password));
  }

  async detail(
    context: Pick<PessoalAuthContext, "organizationId">,
    id: string,
  ): Promise<PasswordDetailRecord> {
    const password = await this.findScopedPassword(context.organizationId, id);

    return this.decryptPassword(password);
  }

  async create(context: PessoalAuthContext, body: CreatePasswordBody): Promise<PasswordListRecord> {
    try {
      const userId = requireUserId(context);
      await this.ensureClient(context.organizationId, body.client_id);
      await this.ensureResponsible(context.organizationId, body.responsavel_id);

      const data = this.buildCreateData(context.organizationId, body);
      const created = await this.prisma.passwordPessoal.create({
        data,
        select: passwordListSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Cadastro",
        referring: "pessoal.passwords",
        referringId: created.id,
        changes: data,
        path: `/pessoal/passwords/${created.id}`,
      });

      return toPasswordListRecord(created);
    } catch (err: unknown) {
      logError("Erro ao criar senha de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao criar senha de pessoal.", err);
    }
  }

  async update(
    context: PessoalAuthContext,
    id: string,
    body: UpdatePasswordBody,
  ): Promise<PasswordListRecord> {
    try {
      const userId = requireUserId(context);
      await this.findScopedPassword(context.organizationId, id);
      await this.ensureResponsible(context.organizationId, body.responsavel_id);

      const data = this.buildUpdateData(body);
      const updated = await this.prisma.passwordPessoal.update({
        where: { id },
        data,
        select: passwordListSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Atualizacao",
        referring: "pessoal.passwords",
        referringId: id,
        changes: data,
        path: `/pessoal/passwords/${id}`,
      });

      return toPasswordListRecord(updated);
    } catch (err: unknown) {
      logError("Erro ao atualizar senha de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao atualizar senha de pessoal.", err);
    }
  }

  async delete(context: PessoalAuthContext, id: string): Promise<PasswordListRecord> {
    try {
      const userId = requireUserId(context);
      const existing = await this.findScopedPassword(context.organizationId, id);
      const deleted = await this.prisma.passwordPessoal.delete({
        where: { id },
        select: passwordListSelect,
      });

      await this.auditService.recordChange({
        requestId: context.requestId,
        organizationId: context.organizationId,
        userId,
        permission: context.permission,
        action: "Exclusao",
        referring: "pessoal.passwords",
        referringId: id,
        changes: toAuditChanges(existing),
        path: `/pessoal/passwords/${id}`,
      });

      return toPasswordListRecord(deleted);
    } catch (err: unknown) {
      logError("Erro ao remover senha de pessoal", { err });
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(500, "Erro ao remover senha de pessoal.", err);
    }
  }

  private async findScopedPassword(
    organizationId: string,
    id: string,
  ): Promise<PasswordDetailRecord> {
    const password = await this.prisma.passwordPessoal.findFirst({
      where: { id, organization_id: organizationId },
      select: passwordDetailSelect,
    });

    if (!password) {
      throw new ServiceError(404, "Senha de pessoal nao encontrada.");
    }

    return password;
  }

  private async ensureClient(organizationId: string, clientId: string): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });

    if (!client) {
      throw new ServiceError(404, "Cliente nao encontrado para a organizacao.");
    }
  }

  private async ensureResponsible(
    organizationId: string,
    responsibleId: string | null | undefined,
  ): Promise<void> {
    if (responsibleId === undefined || responsibleId === null) {
      return;
    }

    const responsible = await this.prisma.user.findFirst({
      where: { id: responsibleId, organization_id: organizationId },
      select: { id: true },
    });
    if (!responsible) {
      throw new ServiceError(404, "Responsavel nao encontrado para a organizacao.");
    }
  }

  private buildCreateData(organizationId: string, body: CreatePasswordBody): PasswordCreateData {
    return {
      client_id: body.client_id,
      service_name: body.service_name,
      ...this.encryptSecrets(body),
      responsavel_id: body.responsavel_id ?? null,
      notes: body.notes ?? null,
      organization_id: organizationId,
    };
  }

  private buildUpdateData(body: UpdatePasswordBody): PasswordUpdateData {
    return omitUndefined({
      service_name: body.service_name,
      ...this.encryptSecretUpdates(body),
      responsavel_id: body.responsavel_id,
      notes: body.notes,
    });
  }

  private encryptSecrets(input: Partial<PasswordSecretFields>): PasswordSecretFields {
    return {
      login_main: this.crypto.encrypt(input.login_main),
      senha_main: this.crypto.encrypt(input.senha_main),
      login_secondary: this.crypto.encrypt(input.login_secondary),
      senha_secondary: this.crypto.encrypt(input.senha_secondary),
    };
  }

  private encryptSecretUpdates(
    input: Partial<PasswordSecretFields>,
  ): Partial<PasswordSecretFields> {
    const output: Partial<PasswordSecretFields> = {};

    for (const field of SECRET_FIELD_NAMES) {
      if (input[field] !== undefined) {
        output[field] = this.crypto.encrypt(input[field]);
      }
    }

    return output;
  }

  private decryptPassword(password: PasswordDetailRecord): PasswordDetailRecord {
    const decrypted = { ...password };

    for (const field of SECRET_FIELD_NAMES) {
      decrypted[field] = this.crypto.decrypt(password[field]);
    }

    return decrypted;
  }
}

function toPasswordListRecord(record: PasswordListRecord): PasswordListRecord {
  return {
    id: record.id,
    client_id: record.client_id,
    service_name: record.service_name,
    responsavel_id: record.responsavel_id,
    responsavel: record.responsavel,
  };
}

function toAuditChanges(record: PasswordDetailRecord): Record<string, unknown> {
  return {
    id: record.id,
    client_id: record.client_id,
    service_name: record.service_name,
    login_main: record.login_main,
    senha_main: record.senha_main,
    login_secondary: record.login_secondary,
    senha_secondary: record.senha_secondary,
    responsavel_id: record.responsavel_id,
    notes: record.notes,
    organization_id: record.organization_id,
  };
}
