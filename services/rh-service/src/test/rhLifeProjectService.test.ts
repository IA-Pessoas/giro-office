import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn() },
    rhLifeProject: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    rhLifeProjectObjective: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { RhLifeProjectService } from "../services/rhLifeProjectService.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
const organizationId = "00000000-0000-4000-8000-000000000003";
const departmentId = "00000000-0000-4000-8000-000000000004";

function collaborator(id: string, overrides: Record<string, unknown> = {}) {
  return { id, department_id: departmentId, ...overrides };
}

function lifeProjectRow(overrides: Record<string, unknown> = {}) {
  const timestamp = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: "project-1",
    organization_id: organizationId,
    user_id: actorId,
    year: 2026,
    life_story: "",
    company_story: "",
    created_by_id: actorId,
    updated_by_id: actorId,
    created_at: timestamp,
    updated_at: timestamp,
    objectives: [],
    ...overrides,
  };
}

describe("RhLifeProjectService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calcula progresso como objetivos realizados sobre o total e retorna zero sem objetivos", async () => {
    prismaMock.user.findFirst.mockResolvedValue(collaborator(actorId));
    prismaMock.user.findFirst
      .mockResolvedValueOnce(collaborator(actorId))
      .mockResolvedValueOnce(collaborator(actorId));
    prismaMock.rhLifeProject.findFirst
      .mockResolvedValueOnce({
        id: "project-1",
        organization_id: organizationId,
        user_id: actorId,
        year: 2026,
        life_story: "História pessoal",
        company_story: "História na empresa",
        created_by_id: actorId,
        updated_by_id: actorId,
        created_at: new Date("2026-01-01T00:00:00.000Z"),
        updated_at: new Date("2026-01-01T00:00:00.000Z"),
        objectives: [
          { id: "goal-1", status: "Realized" },
          { id: "goal-2", status: "ToDo" },
          { id: "goal-3", status: "Discontinued" },
        ].map((objective) => ({
          title: "Objetivo",
          forecast_date: null,
          completed_at: null,
          rh_observations: "",
          employee_observations: "",
          created_by_id: actorId,
          updated_by_id: actorId,
          created_at: new Date("2026-01-01T00:00:00.000Z"),
          updated_at: new Date("2026-01-01T00:00:00.000Z"),
          ...objective,
        })),
      })
      .mockResolvedValueOnce({
        id: "project-2",
        organization_id: organizationId,
        user_id: actorId,
        year: 2025,
        life_story: "",
        company_story: "",
        created_by_id: actorId,
        updated_by_id: actorId,
        created_at: new Date("2025-01-01T00:00:00.000Z"),
        updated_at: new Date("2025-01-01T00:00:00.000Z"),
        objectives: [],
      });

    const service = new RhLifeProjectService(prismaMock as never);
    const project = await service.get(
      { actorUserId: actorId, organizationId, rhPermission: 1 },
      2026,
    );
    const emptyProject = await service.get(
      { actorUserId: actorId, organizationId, rhPermission: 1 },
      2025,
    );

    expect(project).toMatchObject({
      progress: 1 / 3,
      objective_count: 3,
      completed_objective_count: 1,
    });
    expect(emptyProject).toMatchObject({
      progress: 0,
      objective_count: 0,
      completed_objective_count: 0,
    });
  });

  it("mantém a consulta de projeto no usuário e ano dentro da organização", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(collaborator(actorId))
      .mockResolvedValueOnce(collaborator(targetId));
    prismaMock.rhLifeProject.findFirst.mockResolvedValue(null);

    await new RhLifeProjectService(prismaMock as never).get(
      { actorUserId: actorId, organizationId, targetUserId: targetId, rhPermission: 2 },
      2026,
    );

    expect(prismaMock.rhLifeProject.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: organizationId,
          user_id: targetId,
          year: 2026,
        }),
      }),
    );
  });

  it("oculta projetos de outra equipe para o gestor de departamento", async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(collaborator(actorId))
      .mockResolvedValueOnce(
        collaborator(targetId, { department_id: "00000000-0000-4000-8000-000000000099" }),
      );

    await expect(
      new RhLifeProjectService(prismaMock as never).get(
        { actorUserId: actorId, organizationId, targetUserId: targetId, rhPermission: 2 },
        2026,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.rhLifeProject.findFirst).not.toHaveBeenCalled();
  });

  it("cria o plano vinculado ao colaborador, organização e ano autenticados", async () => {
    prismaMock.user.findFirst.mockResolvedValue(collaborator(actorId));
    prismaMock.rhLifeProject.create.mockResolvedValue(lifeProjectRow());

    await new RhLifeProjectService(prismaMock as never).create(
      { actorUserId: actorId, organizationId, rhPermission: 1 },
      2026,
    );

    expect(prismaMock.rhLifeProject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organization_id: organizationId,
          user_id: actorId,
          year: 2026,
          created_by_id: actorId,
          updated_by_id: actorId,
        },
      }),
    );
  });

  it("converte a restrição única de colaborador e ano em conflito de domínio", async () => {
    prismaMock.user.findFirst.mockResolvedValue(collaborator(actorId));
    prismaMock.rhLifeProject.create.mockRejectedValue({ code: "P2002" });

    await expect(
      new RhLifeProjectService(prismaMock as never).create(
        { actorUserId: actorId, organizationId, rhPermission: 1 },
        2026,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("impede o colaborador de editar observações reservadas ao RH", async () => {
    prismaMock.rhLifeProject.findFirst.mockResolvedValue({ user_id: actorId });
    prismaMock.user.findFirst.mockResolvedValue(collaborator(actorId));

    await expect(
      new RhLifeProjectService(prismaMock as never).updateObjective(
        { actorUserId: actorId, organizationId, rhPermission: 1 },
        "project-1",
        "objective-1",
        { rh_observations: "Não permitido" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.rhLifeProjectObjective.updateMany).not.toHaveBeenCalled();
  });

  it("mantém projetos de colaboradores de outras equipes inacessíveis ao gestor", async () => {
    prismaMock.rhLifeProject.findFirst.mockResolvedValue({ user_id: targetId });
    prismaMock.user.findFirst
      .mockResolvedValueOnce(collaborator(actorId))
      .mockResolvedValueOnce(
        collaborator(targetId, { department_id: "00000000-0000-4000-8000-000000000099" }),
      );

    await expect(
      new RhLifeProjectService(prismaMock as never).update(
        { actorUserId: actorId, organizationId, rhPermission: 2 },
        "project-1",
        { life_story: "Não permitido" },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.rhLifeProject.updateMany).not.toHaveBeenCalled();
  });
});
