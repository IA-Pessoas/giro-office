import type { ProjectPlanAudit, ProjectPlanPrisma } from "../services/ProjectPlanService.js";
import type { CreateTaskCrudRequest } from "../services/TaskCrudService.js";
import { ProjectPlanService } from "../services/ProjectPlanService.js";
import { TaskCrudService } from "../services/TaskCrudService.js";
import { describe, expect, it } from "vitest";

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PLAN_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

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
}

function createAudit(): ProjectPlanAudit {
  return {
    async createLog() {},
    async logUpdateIfChanged() {},
  };
}

function createBasePrisma(): ProjectPlanPrisma {
  return {
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
  };
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

    await expect(service.detail(PLAN_ID, ORG_ID)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("hirePlan instancia as tarefas na ordem do plano", async () => {
    const prisma = createBasePrisma();
    prisma.projectPlan.findFirst = async () => ({ id: PLAN_ID });
    prisma.project.findFirst = async () => ({ client_id: CLIENT_ID });
    prisma.client.findFirst = async () => ({ prospecting_status: "Fechado" });
    prisma.projectPlanTasks.findMany = async () => [{ task_id: "model-2" }, { task_id: "model-1" }];
    const taskCrud = new TaskCrudServiceStub();
    const service = new ProjectPlanService(taskCrud, prisma, createAudit());

    const result = await service.hirePlan({
      user_id: USER_ID,
      organization_id: ORG_ID,
      project_id: PROJECT_ID,
      plan_id: PLAN_ID,
    });

    expect(taskCrud.calls).toHaveLength(2);
    expect(taskCrud.calls.map((call) => call.model_id)).toEqual(["model-2", "model-1"]);
    expect(result.created).toHaveLength(2);
  });
});
