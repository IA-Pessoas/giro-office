import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    department: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../integrations/prisma.js", () => ({
  prismaClient: prismaMock,
}));

import { EmployeeDossierService } from "../services/employeeDossierService.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const organizationId = "00000000-0000-4000-8000-000000000002";
const otherUserId = "00000000-0000-4000-8000-000000000003";

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: actorId,
    full_name: "Ana Silva",
    name: "Ana Silva",
    gender: "F",
    birth_date: new Date("1990-01-01T00:00:00.000Z"),
    cpf: "123",
    rg: "RG-1",
    address: "Rua A",
    job_title: "Analista",
    email: "ana@example.com",
    phone: "5511999999999",
    hire_date: new Date("2023-01-01T00:00:00.000Z"),
    dominio_hire_date: new Date("2024-02-01T00:00:00.000Z"),
    termination_date: null,
    photo_url: null,
    status: "active",
    department_id: "00000000-0000-4000-8000-000000000010",
    allergies: [{ name: "poeira", fonts: "ambiental", action: "evitar" }],
    emergency_contacts: [],
    department: { id: "00000000-0000-4000-8000-000000000010", name: "RH" },
    version: 1,
    ...overrides,
  };
}

describe("EmployeeDossierService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna admissão real e admissão Domínio no dossiê completo", async () => {
    prismaMock.user.findFirst.mockResolvedValue(user());

    const result = await new EmployeeDossierService().getDossier({
      actorUserId: actorId,
      organizationId,
      rhPermission: 1,
    });

    expect(result).toMatchObject({
      id: actorId,
      full_name: "Ana Silva",
      hire_date: "2023-01-01T00:00:00.000Z",
      dominio_hire_date: "2024-02-01T00:00:00.000Z",
      allergies: [{ name: "poeira", fonts: "ambiental", action: "evitar" }],
      emergency_contacts: [],
    });
  });

  it("carrega o dossiê autorizado quando o colaborador não tem configuração de ponto", async () => {
    const collaborator = user();
    expect(collaborator).not.toHaveProperty("pointConfig");
    prismaMock.user.findFirst.mockResolvedValue(collaborator);

    const result = await new EmployeeDossierService().getDossier({
      actorUserId: actorId,
      organizationId,
      rhPermission: 1,
    });

    expect(result).toMatchObject({
      id: actorId,
      full_name: "Ana Silva",
      allergies: [{ name: "poeira", fonts: "ambiental", action: "evitar" }],
      emergency_contacts: [],
    });
    expect(prismaMock.user.findFirst).toHaveBeenCalledTimes(2);
    for (const [query] of prismaMock.user.findFirst.mock.calls) {
      expect(query.select).not.toHaveProperty("pointConfig");
    }
  });

  it("entrega somente projeção não sensível para gestor de departamento", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(user())
      .mockResolvedValueOnce(user({ id: otherUserId, full_name: "Bruno Lima" }));

    const result = await new EmployeeDossierService().getDossier({
      actorUserId: actorId,
      organizationId,
      targetUserId: otherUserId,
      rhPermission: 2,
    });

    expect(result).toEqual({
      id: otherUserId,
      full_name: "Bruno Lima",
      job_title: "Analista",
      department: { id: "00000000-0000-4000-8000-000000000010", name: "RH" },
      photo_url: null,
      status: "active",
    });
    expect(result).not.toHaveProperty("cpf");
    expect(result).not.toHaveProperty("allergies");
  });

  it("não revela colaborador de outro departamento para gestor", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(user())
      .mockResolvedValueOnce(
        user({ id: otherUserId, department_id: "00000000-0000-4000-8000-000000000011" }),
      );

    await expect(
      new EmployeeDossierService().getDossier({
        actorUserId: actorId,
        organizationId,
        targetUserId: otherUserId,
        rhPermission: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("mantém gestor em projeção e bloqueia acesso sensível no próprio usuário", async () => {
    prismaMock.user.findFirst.mockResolvedValue(user());

    const result = await new EmployeeDossierService().getDossier({
      actorUserId: actorId,
      organizationId,
      rhPermission: 2,
    });

    expect(result).not.toHaveProperty("cpf");
    expect(result).not.toHaveProperty("allergies");

    await expect(
      new EmployeeDossierService().listAllergies({
        actorUserId: actorId,
        organizationId,
        rhPermission: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("filtra a lista administrativa pelo departamento solicitado dentro da organização", async () => {
    prismaMock.user.findFirst.mockResolvedValue(user());
    prismaMock.user.findMany.mockResolvedValue([]);

    await new EmployeeDossierService().listDossiers({
      actorUserId: actorId,
      organizationId,
      rhPermission: 3,
      departmentId: "00000000-0000-4000-8000-000000000011",
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [{ department_id: "00000000-0000-4000-8000-000000000011" }],
        }),
      }),
    );
  });

  it("impede gestor de alterar o próprio cadastro", async () => {
    prismaMock.user.findFirst.mockResolvedValue(user());

    await expect(
      new EmployeeDossierService().updateDossier({
        actorUserId: actorId,
        organizationId,
        rhPermission: 2,
        changes: { address: "Rua B" },
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("permite ao colaborador alterar somente endereço, email e telefone", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(user())
      .mockResolvedValueOnce(user({ address: "Rua B", email: "novo@example.com" }));
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    await new EmployeeDossierService().updateDossier({
      actorUserId: actorId,
      organizationId,
      rhPermission: 1,
      changes: { address: "Rua B", email: "novo@example.com" },
    });

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          address: "Rua B",
          email: "novo@example.com",
          version: { increment: 1 },
        }),
      }),
    );
  });

  it("bloqueia alteração de CPF no autoatendimento", async () => {
    prismaMock.user.findFirst.mockResolvedValue(user());

    await expect(
      new EmployeeDossierService().updateDossier({
        actorUserId: actorId,
        organizationId,
        rhPermission: 1,
        changes: { cpf: "999" },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("lista colaboradores sem campos sensíveis", async () => {
    prismaMock.user.findFirst.mockResolvedValue(user());
    prismaMock.user.findMany.mockResolvedValue([user(), user({ id: otherUserId })]);

    const result = await new EmployeeDossierService().listDossiers({
      actorUserId: actorId,
      organizationId,
      rhPermission: 3,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({ id: actorId, full_name: "Ana Silva" }));
    expect(result[0]).not.toHaveProperty("cpf");
    expect(result[0]).not.toHaveProperty("hire_date");
    expect(result[0]).not.toHaveProperty("emergency_contacts");
  });

  it("gera id do servidor ao criar contato e mantém contatos isolados no usuário", async () => {
    prismaMock.user.findFirst.mockResolvedValue(user());
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await new EmployeeDossierService().createContact({
      actorUserId: actorId,
      organizationId,
      rhPermission: 1,
      contact: { name: "Carlos Silva", phone: "5511888888888", reference: "irmão" },
    });

    expect(result).toMatchObject({
      name: "Carlos Silva",
      phone: "5511888888888",
      reference: "irmão",
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emergency_contacts: [result],
          version: { increment: 1 },
        }),
      }),
    );
  });

  it("não encontra contato fora do array do usuário", async () => {
    prismaMock.user.findFirst.mockResolvedValue(user({ emergency_contacts: [] }));

    await expect(
      new EmployeeDossierService().deleteContact({
        actorUserId: actorId,
        organizationId,
        rhPermission: 1,
        contact: { id: otherUserId },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("valida itens de alergia antes de persistir", async () => {
    prismaMock.user.findFirst.mockResolvedValue(user());

    await expect(
      new EmployeeDossierService().replaceAllergies({
        actorUserId: actorId,
        organizationId,
        rhPermission: 1,
        allergies: [{ name: "", fonts: "ambiental", action: "evitar" }],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });
});
