import "./envBootstrap.js";

import { ServiceError } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { PasswordService } from "../services/passwordService.js";
import { createPessoalPasswordCrypto } from "../services/pessoalPasswordCrypto.js";
import {
  clientId,
  createAuditMock,
  organizationId,
  recordId,
  responsibleId,
  userId,
} from "./pessoalCoreTestUtils.js";

const keyBase64 = Buffer.alloc(32, 7).toString("base64");

function createCrypto() {
  return createPessoalPasswordCrypto({ keyBase64, keyVersion: "v1" });
}

function passwordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: recordId,
    client_id: clientId,
    service_name: "Portal eSocial",
    login_main: "encrypted-main-login",
    senha_main: "encrypted-main-password",
    login_secondary: "encrypted-secondary-login",
    senha_secondary: "encrypted-secondary-password",
    responsavel_id: responsibleId,
    notes: "Acesso legado",
    organization_id: organizationId,
    responsavel: {
      id: responsibleId,
      name: "Ana",
      full_name: "Ana Silva",
    },
    ...overrides,
  };
}

function createPrismaMock() {
  const crypto = createCrypto();

  return {
    client: {
      findFirst: vi.fn(async () => ({ id: clientId })),
    },
    user: {
      findFirst: vi.fn(async () => ({ id: responsibleId })),
    },
    passwordPessoal: {
      findMany: vi.fn(async () => [
        passwordRow({
          login_main: undefined,
          senha_main: undefined,
          login_secondary: undefined,
          senha_secondary: undefined,
        }),
      ]),
      findFirst: vi.fn(async () =>
        passwordRow({
          login_main: crypto.encrypt("principal"),
          senha_main: crypto.encrypt("senha-principal"),
          login_secondary: crypto.encrypt("secundario"),
          senha_secondary: crypto.encrypt("senha-secundaria"),
        }),
      ),
      create: vi.fn(async ({ data }) => ({ id: recordId, ...data })),
      update: vi.fn(async ({ data }) => ({ ...passwordRow(), ...data })),
      delete: vi.fn(async () => passwordRow()),
    },
  };
}

describe("pessoal password crypto", () => {
  it("criptografa sem preservar texto puro e descriptografa o valor original", () => {
    const crypto = createCrypto();

    const encrypted = crypto.encrypt("senha-secreta");

    expect(encrypted).not.toBe("senha-secreta");
    expect(encrypted).toEqual(expect.stringContaining('"v":"v1"'));
    expect(crypto.decrypt(encrypted)).toBe("senha-secreta");
    expect(crypto.encrypt(null)).toBeNull();
    expect(crypto.decrypt(undefined)).toBeNull();
  });

  it("rejeita chave invalida como ServiceError", () => {
    expect(() =>
      createPessoalPasswordCrypto({
        keyBase64: Buffer.alloc(16).toString("base64"),
        keyVersion: "v1",
      }),
    ).toThrow(ServiceError);
  });
});

describe("PasswordService", () => {
  it("lista senhas sem selecionar ou retornar campos secretos", async () => {
    const prisma = createPrismaMock();
    const service = new PasswordService(prisma as never, createCrypto(), createAuditMock());

    const result = await service.list({ organizationId }, { client_id: clientId });

    expect(prisma.passwordPessoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId, client_id: clientId },
        select: expect.not.objectContaining({
          login_main: true,
          senha_main: true,
          login_secondary: true,
          senha_secondary: true,
        }),
      }),
    );
    expect(result[0]).toMatchObject({
      id: recordId,
      client_id: clientId,
      service_name: "Portal eSocial",
      responsavel_id: responsibleId,
      responsavel: { id: responsibleId, name: "Ana", full_name: "Ana Silva" },
    });
    expect(result[0]).not.toHaveProperty("login_main");
    expect(result[0]).not.toHaveProperty("senha_main");
    expect(result[0]).not.toHaveProperty("login_secondary");
    expect(result[0]).not.toHaveProperty("senha_secondary");
  });

  it("detalha senha da organizacao com campos secretos descriptografados", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new PasswordService(prisma as never, createCrypto(), audit);

    const result = await service.detail({ organizationId, userId, permission: 3 }, recordId);

    expect(prisma.passwordPessoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: recordId, organization_id: organizationId },
      }),
    );
    expect(result).toMatchObject({
      login_main: "principal",
      senha_main: "senha-principal",
      login_secondary: "secundario",
      senha_secondary: "senha-secundaria",
    });
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Visualizacao",
        referring: "pessoal.passwords",
        referringId: recordId,
        changes: {
          revealedSecretFields: ["login_main", "senha_main", "login_secondary", "senha_secondary"],
        },
      }),
    );
  });

  it("detalha senha sem campos secretos para permissao menor que 3", async () => {
    const prisma = createPrismaMock();
    const service = new PasswordService(prisma as never, createCrypto(), createAuditMock());

    const result = await service.detail({ organizationId, userId, permission: 1 }, recordId);

    expect(result).toMatchObject({
      id: recordId,
      client_id: clientId,
      service_name: "Portal eSocial",
      responsavel_id: responsibleId,
    });
    expect(result).not.toHaveProperty("login_main");
    expect(result).not.toHaveProperty("senha_main");
    expect(result).not.toHaveProperty("login_secondary");
    expect(result).not.toHaveProperty("senha_secondary");
    expect(prisma.passwordPessoal.update).not.toHaveBeenCalled();
  });

  it("recriptografa segredo legado em texto puro antes de retornar detalhe autorizado", async () => {
    const prisma = createPrismaMock();
    prisma.passwordPessoal.findFirst.mockResolvedValueOnce(
      passwordRow({
        login_main: "login-legado",
        senha_main: "senha-legada",
        login_secondary: null,
        senha_secondary: null,
      }),
    );
    prisma.passwordPessoal.update.mockImplementationOnce(async ({ data }) =>
      passwordRow({
        login_main: data.login_main,
        senha_main: data.senha_main,
        login_secondary: null,
        senha_secondary: null,
      }),
    );
    const service = new PasswordService(prisma as never, createCrypto(), createAuditMock());

    const result = await service.detail({ organizationId, userId, permission: 3 }, recordId);

    expect(result).toMatchObject({
      login_main: "login-legado",
      senha_main: "senha-legada",
      login_secondary: null,
      senha_secondary: null,
    });
    expect(prisma.passwordPessoal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: recordId },
        data: expect.objectContaining({
          login_main: expect.not.stringMatching(/^login-legado$/),
          senha_main: expect.not.stringMatching(/^senha-legada$/),
        }),
      }),
    );
  });

  it("cria senha criptografando campos secretos e validando vinculos da organizacao", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new PasswordService(prisma as never, createCrypto(), audit);

    const result = await service.create(
      { organizationId, userId, permission: 3 },
      {
        client_id: clientId,
        service_name: "Portal eSocial",
        login_main: "principal",
        senha_main: "senha-principal",
        login_secondary: null,
        senha_secondary: "senha-secundaria",
        responsavel_id: responsibleId,
        notes: "Acesso legado",
      },
    );

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: clientId, organization_id: organizationId },
      select: { id: true },
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: responsibleId,
        status: "active",
        OR: [
          { organization_id: organizationId },
          { organization_id: null, department: { organization_id: organizationId } },
        ],
        permissions: { some: { organization_id: organizationId, pessoal: { gt: 0 } } },
      },
      select: { id: true },
    });
    expect(prisma.passwordPessoal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          client_id: clientId,
          service_name: "Portal eSocial",
          organization_id: organizationId,
          responsavel_id: responsibleId,
          notes: "Acesso legado",
          login_secondary: null,
        }),
      }),
    );
    const createArg = prisma.passwordPessoal.create.mock.calls[0][0];
    expect(createArg.data.login_main).not.toBe("principal");
    expect(createArg.data.senha_main).not.toBe("senha-principal");
    expect(createArg.data.senha_secondary).not.toBe("senha-secundaria");
    expect(result).not.toHaveProperty("senha_main");
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        referring: "pessoal.passwords",
        referringId: recordId,
        changes: expect.objectContaining({
          login_main: expect.any(String),
          senha_main: expect.any(String),
          senha_secondary: expect.any(String),
        }),
      }),
    );
  });

  it("rejeita criacao de senha com permissao menor que 3", async () => {
    const prisma = createPrismaMock();
    const service = new PasswordService(prisma as never, createCrypto(), createAuditMock());

    await expect(
      service.create(
        { organizationId, userId, permission: 2 },
        {
          client_id: clientId,
          service_name: "Portal eSocial",
          senha_main: "senha-principal",
        },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.passwordPessoal.create).not.toHaveBeenCalled();
  });

  it("atualiza senha sem vazar campos secretos na auditoria", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new PasswordService(prisma as never, createCrypto(), audit);

    await service.update({ organizationId, userId, permission: 3 }, recordId, {
      senha_main: "nova-senha",
      notes: "Atualizado",
    });

    const updateArg = prisma.passwordPessoal.update.mock.calls[0][0];
    expect(updateArg.data.senha_main).not.toBe("nova-senha");
    expect(updateArg.data).not.toHaveProperty("login_main");
    expect(updateArg.data).not.toHaveProperty("login_secondary");
    expect(updateArg.data).not.toHaveProperty("senha_secondary");
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Atualizacao",
        changes: expect.objectContaining({
          senha_main: expect.any(String),
          notes: "Atualizado",
        }),
      }),
    );
  });

  it("remove senha usando snapshot escopado por organizacao", async () => {
    const prisma = createPrismaMock();
    const audit = createAuditMock();
    const service = new PasswordService(prisma as never, createCrypto(), audit);

    await service.delete({ organizationId, userId, permission: 3 }, recordId);

    expect(prisma.passwordPessoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: recordId, organization_id: organizationId },
      }),
    );
    expect(prisma.passwordPessoal.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: recordId } }),
    );
    expect(audit.recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Exclusao",
        changes: expect.objectContaining({
          login_main: expect.any(String),
          senha_main: expect.any(String),
        }),
      }),
    );
  });
});
