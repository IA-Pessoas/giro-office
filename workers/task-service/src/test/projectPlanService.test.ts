import { describe, expect, it } from "vitest";
import type { ProjectPlanAudit, ProjectPlanPrisma } from "../services/projectPlanService.js";
import { ProjectPlanService } from "../services/projectPlanService.js";
import type { CreateTaskCrudRequest } from "../services/taskCrudService.js";
import { TaskCrudService } from "../services/taskCrudService.js";

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PLAN_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ADMIN_AUTH = { integracaoLevel: 3 as const };

class TaskCrudServiceStub extends TaskCrudService {
  readonly calls: CreateTaskCrudRequest[] = [];

  override async createTask(data: CreateTaskCrudRequest) {
    this.calls.push(data);

    return {
      create: {
        id: `task-${data.model_id}`,
        model_id: data.model_id,
        project_id: data.project_id,
        client_id: data.client_id,
        name: `Task ${data.model_id}`,
        status: "A Realizar",
        department_id: "dep-1",
        observations: data.observations,
        billing: "Realizar",
        urgency: data.urgency,
        responsible_id: "resp-1",
        responsible2_id: null,
        responsible3_id: null,
        start_date: null,
        charge_comercial: true,
        charge_financeiro: false,
      },
    };
  }

  override async createTaskInTransaction(data: CreateTaskCrudRequest) {
    const result = await this.createTask(data);
    return { ...result, dependentCreates: [] };
  }
}

function createAudit(): ProjectPlanAudit {
  return {
    async createLog() {},
    async logUpdateIfChanged() {},
  };
}

function createBasePrisma(): ProjectPlanPrisma {
  const hirings = new Map<string, { response_snapshot: unknown }>();
  const prisma = {
    projectPlan: {
      async findFirst() {
        return null;
      },
      async findMany() {
        return [];
      },
      async create() {
        return { id: PLAN_ID, name: "Plano", color: "#000000" };
      },
      async update() {
        return { id: PLAN_ID, name: "Plano", color: "#000000" };
      },
      async delete() {
        return { id: PLAN_ID };
      },
    },
    projectPlanTasks: {
      async findFirst() {
        return null;
      },
      async findMany() {
        return [];
      },
      async create() {
        return {
          id: "plan-task-1",
          plan_id: PLAN_ID,
          task_id: "model-1",
          order: 1,
          tasks: {
            id: "model-1",
            name: "Modelo",
            department_id: "dep-1",
            billing: "Realizar",
            prevision: 3,
            type: "regularize",
          },
        };
      },
      async update() {
        return {
          id: "plan-task-1",
          plan_id: PLAN_ID,
          task_id: "model-1",
          order: 1,
          tasks: {
            id: "model-1",
            name: "Modelo",
            department_id: "dep-1",
            billing: "Realizar",
            prevision: 3,
            type: "regularize",
          },
        };
      },
      async updateMany() {
        return { count: 0 };
      },
      async delete() {
        return { id: "plan-task-1" };
      },
      async deleteMany() {
        return { count: 0 };
      },
    },
    projectPlanHiring: {
      async findUnique(args: {
        where: {
          organization_id_plan_id_project_id: {
            organization_id: string;
            plan_id: string;
            project_id: string;
          };
        };
      }) {
        const { organization_id, plan_id, project_id } =
          args.where.organization_id_plan_id_project_id;
        return hirings.get(`${organization_id}:${plan_id}:${project_id}`) ?? null;
      },
      async create(args: {
        data: {
          organization_id: string;
          plan_id: string;
          project_id: string;
          response_snapshot: unknown;
        };
      }) {
        const { organization_id, plan_id, project_id, response_snapshot } = args.data;
        hirings.set(`${organization_id}:${plan_id}:${project_id}`, { response_snapshot });
        return { id: "plan-hiring-1" };
      },
    },
    taskModel: {
      async findFirst() {
        return null;
      },
    },
    project: {
      async findFirst() {
        return null;
      },
    },
    client: {
      async findFirst() {
        return null;
      },
    },
    user: {
      async findFirst() {
        return null;
      },
    },
    async $transaction(input: unknown) {
      if (typeof input === "function") {
        return input(this as never);
      }

      return Promise.all(input as Promise<unknown>[]);
    },
    async $executeRaw() {
      return 0;
    },
  };

  return prisma as unknown as ProjectPlanPrisma;
}

describe("ProjectPlanService", () => {
  it("create lança 409 quando já existe plano com mesmo nome na organização", async () => {
    let auditCalled = false;
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    const audit = {
      async createLog() {
        auditCalled = true;
      },
      async logUpdateIfChanged() {},
    } satisfies ProjectPlanAudit;
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, audit);

    await expect(
      service.create({
        user_id: USER_ID,
        organization_id: ORG_ID,
        ...ADMIN_AUTH,
        name: "Plano",
        color: "#ffffff",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(auditCalled).toBe(false);
  });

  it("detail lança 404 quando o plano não existe", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => null;
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.detail(PLAN_ID, ORG_ID, { user_id: USER_ID, organization_id: ORG_ID, ...ADMIN_AUTH }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("create lança 403 quando usuário não tem permissão", async () => {
    const prisma = createBasePrisma();
    prisma.user.findFirst = async () => ({ id: USER_ID, permission: 1 });
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.create({
        user_id: USER_ID,
        organization_id: ORG_ID,
        name: "Plano",
        color: "#ffffff",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("update lança 403 quando usuário não tem permissão", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID, name: "Plano", color: "#000000" });
    prisma.user.findFirst = async () => ({ id: USER_ID, permission: 1 });
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.update({
        user_id: USER_ID,
        organization_id: ORG_ID,
        id: PLAN_ID,
        name: "Plano",
        color: "#ffffff",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("addTask lança 403 quando usuário não tem permissão", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.taskModel.findFirst = async () => ({ id: "model-1" });
    prisma.user.findFirst = async () => ({ id: USER_ID, permission: 1 });
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.addTask({
        user_id: USER_ID,
        organization_id: ORG_ID,
        plan_id: PLAN_ID,
        task_id: "model-1",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("addTask rejeita o mesmo modelo duas vezes no plano", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.taskModel.findFirst = async () => ({ id: "model-1" });
    prisma.projectPlanTasks.findFirst = async () => ({ id: "plan-task-1" });
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.addTask({
        user_id: USER_ID,
        organization_id: ORG_ID,
        plan_id: PLAN_ID,
        task_id: "model-1",
        integracaoLevel: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("reorderTask lança 403 quando usuário não tem permissão", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlanTasks.findFirst = async (args?: {
      where?: { id?: string; order?: number };
    }) => {
      if (args?.where?.id === "plan-task-1") {
        return { id: "plan-task-1", order: 2 };
      }
      if (args?.where?.order === 1) {
        return { id: "plan-task-2", order: 1 };
      }
      return null;
    };
    prisma.user.findFirst = async () => ({ id: USER_ID, permission: 1 });
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.reorderTask({
        plan_id: PLAN_ID,
        plan_task_id: "plan-task-1",
        direction: "up",
        user_id: USER_ID,
        organization_id: ORG_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("deleteTask lança 403 quando usuário não tem permissão", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlanTasks.findFirst = async () => ({
      id: "plan-task-1",
      plan_id: PLAN_ID,
      task_id: "model-1",
      order: 1,
      tasks: {
        id: "model-1",
        name: "Modelo",
        department_id: "dep-1",
        billing: "Realizar",
        prevision: 3,
        type: "regularize",
      },
    });
    prisma.user.findFirst = async () => ({ id: USER_ID, permission: 1 });
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.deleteTask({
        plan_id: PLAN_ID,
        plan_task_id: "plan-task-1",
        user_id: USER_ID,
        organization_id: ORG_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("hirePlan lança 403 quando usuário não tem permissão", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.project.findFirst = async () => ({ client_id: CLIENT_ID });
    prisma.client.findFirst = async () => ({ prospecting_status: "Fechado" });
    prisma.user.findFirst = async () => ({ id: USER_ID, permission: 1 });
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.hirePlan({
        user_id: USER_ID,
        organization_id: ORG_ID,
        project_id: PROJECT_ID,
        plan_id: PLAN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("delete lança 403 quando usuário não tem permissão", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.user.findFirst = async () => ({ id: USER_ID, permission: 1 });
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.delete({
        id: PLAN_ID,
        user_id: USER_ID,
        organization_id: ORG_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("delete retorna 409 quando o plano já foi contratado", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.projectPlan.delete = async () => {
      throw { code: "P2003" };
    };
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.delete({
        id: PLAN_ID,
        user_id: USER_ID,
        organization_id: ORG_ID,
        ...ADMIN_AUTH,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("hirePlan instancia as tarefas na ordem do plano", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.project.findFirst = async () => ({ client_id: CLIENT_ID });
    prisma.client.findFirst = async () => ({ prospecting_status: "Fechado" });
    prisma.user.findFirst = async () => ({ id: USER_ID, permission: 2 });
    prisma.projectPlanTasks.findMany = async () => [{ task_id: "model-2" }, { task_id: "model-1" }];
    const taskCrud = new TaskCrudServiceStub();
    const service = new ProjectPlanService(taskCrud, prisma, createAudit());

    const result = await service.hirePlan({
      user_id: USER_ID,
      organization_id: ORG_ID,
      ...ADMIN_AUTH,
      project_id: PROJECT_ID,
      plan_id: PLAN_ID,
    });

    expect(taskCrud.calls).toHaveLength(2);
    expect(taskCrud.calls.map((call) => call.model_id)).toEqual(["model-2", "model-1"]);
    expect(result.created).toHaveLength(2);
    expect(result).toMatchObject({ idempotent: false });

    const repeated = await service.hirePlan({
      user_id: USER_ID,
      organization_id: ORG_ID,
      ...ADMIN_AUTH,
      project_id: PROJECT_ID,
      plan_id: PLAN_ID,
    });

    expect(repeated).toMatchObject({ idempotent: true, created: result.created });
    expect(taskCrud.calls).toHaveLength(2);
  });

  it("hirePlan aplica o escopo da organização a plano, projeto e cliente", async () => {
    const prisma = createBasePrisma();
    const whereClauses: Record<string, unknown>[] = [];
    prisma.projectPlan.findFirst = async (...args: unknown[]) => {
      whereClauses.push((args[0] as { where: Record<string, unknown> }).where);
      return { id: PLAN_ID };
    };
    prisma.project.findFirst = async (...args: unknown[]) => {
      whereClauses.push((args[0] as { where: Record<string, unknown> }).where);
      return { client_id: CLIENT_ID };
    };
    prisma.client.findFirst = async (...args: unknown[]) => {
      whereClauses.push((args[0] as { where: Record<string, unknown> }).where);
      return null;
    };
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, createAudit());

    await expect(
      service.hirePlan({
        user_id: USER_ID,
        organization_id: ORG_ID,
        ...ADMIN_AUTH,
        project_id: PROJECT_ID,
        plan_id: PLAN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(whereClauses).toEqual([
      { id: PLAN_ID, organization_id: ORG_ID },
      { id: PROJECT_ID, organization_id: ORG_ID },
      { id: CLIENT_ID, organization_id: ORG_ID },
    ]);
  });

  it("hirePlan serializa chamadas concorrentes no mesmo plano e projeto", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.project.findFirst = async () => ({ client_id: CLIENT_ID });
    prisma.client.findFirst = async () => ({ prospecting_status: "Fechado" });
    prisma.projectPlanTasks.findMany = async () => [{ task_id: "model-1" }];

    let lockTail = Promise.resolve();
    let lockCalls = 0;
    prisma.$transaction = (async (input: unknown) => {
      if (typeof input !== "function") {
        return Promise.all(input as Promise<unknown>[]);
      }

      let releaseLock: (() => void) | undefined;
      const tx = {
        ...prisma,
        async $executeRaw() {
          lockCalls += 1;
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          await previous;
          return 0;
        },
      };

      try {
        return await input(tx as never);
      } finally {
        releaseLock?.();
      }
    }) as typeof prisma.$transaction;

    const taskCrud = new TaskCrudServiceStub();
    const service = new ProjectPlanService(taskCrud, prisma, createAudit());
    const request = {
      user_id: USER_ID,
      organization_id: ORG_ID,
      ...ADMIN_AUTH,
      project_id: PROJECT_ID,
      plan_id: PLAN_ID,
    };

    const [first, second] = await Promise.all([
      service.hirePlan(request),
      service.hirePlan(request),
    ]);

    expect([first.idempotent, second.idempotent].sort()).toEqual([false, true]);
    expect(taskCrud.calls).toHaveLength(1);
    expect(lockCalls).toBe(2);
  });

  it("hirePlan não confirma sucesso quando a auditoria obrigatória falha", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.project.findFirst = async () => ({ client_id: CLIENT_ID });
    prisma.client.findFirst = async () => ({ prospecting_status: "Fechado" });
    prisma.projectPlanTasks.findMany = async () => [{ task_id: "model-1" }];
    let auditAvailable = false;
    let auditAttempts = 0;
    let auditRequired = false;
    const audit = {
      async createLog(params) {
        auditAttempts += 1;
        auditRequired = params.required === true;
        if (!auditAvailable) {
          throw new Error("audit indisponível");
        }
      },
      async logUpdateIfChanged() {},
    } satisfies ProjectPlanAudit;
    const service = new ProjectPlanService(new TaskCrudServiceStub(), prisma, audit);

    await expect(
      service.hirePlan({
        user_id: USER_ID,
        organization_id: ORG_ID,
        ...ADMIN_AUTH,
        project_id: PROJECT_ID,
        plan_id: PLAN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 500 });

    auditAvailable = true;
    const retry = await service.hirePlan({
      user_id: USER_ID,
      organization_id: ORG_ID,
      ...ADMIN_AUTH,
      project_id: PROJECT_ID,
      plan_id: PLAN_ID,
    });

    expect(retry).toMatchObject({ idempotent: false });
    expect(auditAttempts).toBe(2);
    expect(auditRequired).toBe(true);
  });

  it("hirePlan rejeita plano sem modelos antes de criar tarefas", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.project.findFirst = async () => ({ client_id: CLIENT_ID });
    prisma.client.findFirst = async () => ({ prospecting_status: "Fechado" });
    prisma.user.findFirst = async () => ({ id: USER_ID, permission: 2 });
    const taskCrud = new TaskCrudServiceStub();
    const service = new ProjectPlanService(taskCrud, prisma, createAudit());

    await expect(
      service.hirePlan({
        user_id: USER_ID,
        organization_id: ORG_ID,
        ...ADMIN_AUTH,
        project_id: PROJECT_ID,
        plan_id: PLAN_ID,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(taskCrud.calls).toEqual([]);
  });
});
