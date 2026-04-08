import { ServiceError } from "@workspace/shared";

import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  CreatePasswordBody,
  CreateSitePasswordBody,
  UpdatePasswordBody,
  UpdateSitePasswordBody,
} from "../schemas/password.schema.js";
import { EncryptionService } from "./encryptionService.js";
import { RegularizeLogService } from "./regularizeLogService.js";

const passwordSelect = {
  id: true,
  client_id: true,
  site_id: true,
  login: true,
  password: true,
  notes: true,
} as const;

const sitePasswordSelect = {
  id: true,
  name: true,
  sphere: true,
  link: true,
  user: true,
  password: true,
  status: true,
} as const;

export class PasswordService {
  readonly #encryption: EncryptionService;
  readonly #logs: RegularizeLogService;

  constructor(
    private readonly prisma: PrismaClient,
    encryptionKey: string,
  ) {
    this.#encryption = new EncryptionService(encryptionKey);
    this.#logs = new RegularizeLogService(prisma);
  }

  async create(input: {
    organizationId: string;
    userId: string;
    body: CreatePasswordBody;
  }): Promise<Record<string, unknown>> {
    await this.ensureClientExists(input.organizationId, input.body.client_id);
    await this.ensureSiteExists(input.organizationId, input.body.site_id);
    await this.ensurePasswordIsUnique(input.organizationId, input.body);

    const created = await this.prisma.passwordRegularize.create({
      data: {
        client_id: input.body.client_id,
        site_id: input.body.site_id,
        login: this.#encryption.encrypt(input.body.login),
        password: this.#encryption.encrypt(input.body.password),
        notes: input.body.notes ?? null,
        organization_id: input.organizationId,
      },
      select: passwordSelect,
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Cadastro",
      referring: "regularize.passwordsRegularize",
      referringId: created.id,
      changes: "{}",
    });

    return this.hydratePassword(created);
  }

  async update(input: {
    organizationId: string;
    userId: string;
    body: UpdatePasswordBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.passwordRegularize.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
      select: passwordSelect,
    });
    if (!existing) {
      throw new ServiceError(404, "Senha nao encontrada.");
    }

    await this.ensureClientExists(input.organizationId, input.body.client_id);
    await this.ensureSiteExists(input.organizationId, input.body.site_id);

    const updated = await this.prisma.passwordRegularize.update({
      where: { id: input.body.id },
      data: {
        client_id: input.body.client_id,
        site_id: input.body.site_id,
        login: this.#encryption.encrypt(input.body.login),
        password: this.#encryption.encrypt(input.body.password),
        notes: input.body.notes ?? null,
      },
      select: passwordSelect,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.passwordsRegularize",
      referringId: existing.id,
      oldData: existing as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });

    return this.hydratePassword(updated);
  }

  async list(organizationId: string, clientId: string): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.passwordRegularize.findMany({
      where: {
        organization_id: organizationId,
        client_id: clientId,
      },
      select: {
        id: true,
        site_id: true,
        notes: true,
        site: {
          select: {
            name: true,
            link: true,
            sphere: true,
          },
        },
      },
      orderBy: {
        site_id: "asc",
      },
    });

    return list as unknown as Record<string, unknown>[];
  }

  async detail(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const password = await this.prisma.passwordRegularize.findFirst({
      where: { id, organization_id: organizationId },
      select: passwordSelect,
    });
    if (!password) {
      throw new ServiceError(404, "Senha nao encontrada.");
    }

    return this.hydratePassword(password);
  }

  async createSite(input: {
    organizationId: string;
    userId: string;
    body: CreateSitePasswordBody;
  }): Promise<Record<string, unknown>> {
    const exists = await this.prisma.sitePasswordsRegularize.findFirst({
      where: {
        organization_id: input.organizationId,
        name: input.body.name,
        sphere: input.body.sphere,
        link: input.body.link ?? null,
      },
      select: { id: true },
    });
    if (exists) {
      throw new ServiceError(409, "Site ja cadastrado.");
    }

    const created = await this.prisma.sitePasswordsRegularize.create({
      data: {
        name: input.body.name,
        sphere: input.body.sphere,
        link: input.body.link ?? null,
        user: input.body.user,
        password: input.body.password,
        organization_id: input.organizationId,
      },
      select: sitePasswordSelect,
    });

    await this.#logs.createLog({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Cadastro",
      referring: "regularize.passowordsSites",
      referringId: created.id,
      changes: "{}",
    });

    return created as unknown as Record<string, unknown>;
  }

  async updateSite(input: {
    organizationId: string;
    userId: string;
    body: UpdateSitePasswordBody;
  }): Promise<Record<string, unknown>> {
    const existing = await this.prisma.sitePasswordsRegularize.findFirst({
      where: { id: input.body.id, organization_id: input.organizationId },
      select: sitePasswordSelect,
    });
    if (!existing) {
      throw new ServiceError(404, "Site nao encontrado.");
    }

    const updated = await this.prisma.sitePasswordsRegularize.update({
      where: { id: input.body.id },
      data: {
        name: input.body.name,
        sphere: input.body.sphere,
        link: input.body.link ?? null,
        user: input.body.user,
        password: input.body.password,
        status: input.body.status,
      },
      select: sitePasswordSelect,
    });

    await this.#logs.logUpdateIfChanged({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "Atualizacao",
      referring: "regularize.sitePasswordsRegularize",
      referringId: existing.id,
      oldData: existing as unknown as Record<string, unknown>,
      updatedData: updated as unknown as Record<string, unknown>,
    });

    return updated as unknown as Record<string, unknown>;
  }

  async listSites(organizationId: string, status: boolean): Promise<Record<string, unknown>[]> {
    const list = await this.prisma.sitePasswordsRegularize.findMany({
      where: {
        organization_id: organizationId,
        status,
      },
      select: sitePasswordSelect,
      orderBy: {
        name: "asc",
      },
    });

    return list as unknown as Record<string, unknown>[];
  }

  async detailSite(organizationId: string, id: string): Promise<Record<string, unknown>> {
    const detail = await this.prisma.sitePasswordsRegularize.findFirst({
      where: { id, organization_id: organizationId },
      select: sitePasswordSelect,
    });
    if (!detail) {
      throw new ServiceError(404, "Site nao encontrado.");
    }

    return detail as unknown as Record<string, unknown>;
  }

  async ensurePasswordIsUnique(
    organizationId: string,
    body: CreatePasswordBody | UpdatePasswordBody,
  ): Promise<void> {
    const existing = await this.prisma.passwordRegularize.findMany({
      where: {
        organization_id: organizationId,
        client_id: body.client_id,
        site_id: body.site_id,
        ...( "id" in body ? { NOT: { id: body.id } } : {} ),
      },
      select: passwordSelect,
    });

    const duplicate = existing.find((item) => {
      const decryptedLogin = this.#encryption.decrypt(item.login);
      const decryptedPassword = this.#encryption.decrypt(item.password);
      return (
        decryptedLogin === body.login &&
        decryptedPassword === body.password &&
        (item.notes ?? null) === (body.notes ?? null)
      );
    });

    if (duplicate) {
      throw new ServiceError(409, "Senha ja cadastrada.");
    }
  }

  private async ensureClientExists(organizationId: string, clientId: string): Promise<void> {
    const exists = await this.prisma.client.findFirst({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    if (!exists) {
      throw new ServiceError(404, "Cliente nao encontrado.");
    }
  }

  private async ensureSiteExists(organizationId: string, siteId: string): Promise<void> {
    const exists = await this.prisma.sitePasswordsRegularize.findFirst({
      where: { id: siteId, organization_id: organizationId },
      select: { id: true },
    });
    if (!exists) {
      throw new ServiceError(404, "Site nao encontrado.");
    }
  }

  private hydratePassword(password: {
    id: string;
    client_id: string;
    site_id: string;
    login: string;
    password: string;
    notes: string | null;
  }): Record<string, unknown> {
    return {
      ...password,
      login: this.#encryption.decrypt(password.login),
      password: this.#encryption.decrypt(password.password),
    };
  }
}
