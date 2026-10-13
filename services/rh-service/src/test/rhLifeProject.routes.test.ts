import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../middlewares/isAuthenticated.js", () => ({
  isAuthenticated: (_request: Request, _response: Response, next: NextFunction) => next(),
}));
vi.mock("../integrations/prisma.js", () => ({ prismaClient: {} }));

import { createRhLifeProjectRouter } from "../routes/rhLifeProject.routes.js";

const organizationId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000010";
const objectiveId = "00000000-0000-4000-8000-000000000011";

const lifeProjectServiceMock = {
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createObjective: vi.fn(),
  updateObjective: vi.fn(),
};

function createTestApp(permission = 1) {
  const app = express();
  app.use(express.json());
  app.use((req, _response, next) => {
    req.organization_id = organizationId;
    req.user_id = userId;
    req.rh_permission = permission;
    next();
  });
  app.use("/rh/life-projects", createRhLifeProjectRouter(lifeProjectServiceMock as never));
  app.use(((
    err: { statusCode?: number; message?: string },
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => response.status(err.statusCode ?? 500).json({ error: err.message })) as ErrorRequestHandler);
  return app;
}

describe("RH life project routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    lifeProjectServiceMock.get.mockResolvedValue(null);
    lifeProjectServiceMock.create.mockResolvedValue({ id: projectId, year: 2026 });
    lifeProjectServiceMock.update.mockResolvedValue({ id: projectId, year: 2026 });
    lifeProjectServiceMock.createObjective.mockResolvedValue({ id: projectId, objectives: [] });
    lifeProjectServiceMock.updateObjective.mockResolvedValue({ id: projectId, objectives: [] });
  });

  it("consults the requested year for the authenticated collaborator by default", async () => {
    const response = await request(createTestApp()).get("/rh/life-projects?year=2026");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: null });
    expect(lifeProjectServiceMock.get).toHaveBeenCalledWith(
      { actorUserId: userId, organizationId, rhPermission: 1 },
      2026,
    );
  });

  it("creates the authenticated user's annual project without trusting organization input", async () => {
    const response = await request(createTestApp())
      .post("/rh/life-projects")
      .send({ year: 2026, organization_id: "another-org" });

    expect(response.status).toBe(400);
    expect(lifeProjectServiceMock.create).not.toHaveBeenCalled();
  });

  it("scopes a valid create to the authenticated collaborator", async () => {
    const response = await request(createTestApp()).post("/rh/life-projects").send({ year: 2026 });

    expect(response.status).toBe(201);
    expect(lifeProjectServiceMock.create).toHaveBeenCalledWith(
      { actorUserId: userId, organizationId, rhPermission: 1 },
      2026,
    );
  });

  it("returns the duplicate-year conflict from the public create flow", async () => {
    lifeProjectServiceMock.create.mockRejectedValue({
      statusCode: 409,
      message: "Já existe um Projeto de Vida para este colaborador e ano.",
    });

    const response = await request(createTestApp()).post("/rh/life-projects").send({ year: 2026 });

    expect(response.status).toBe(409);
    expect(lifeProjectServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid years and callers without RH access before reaching the service", async () => {
    const invalidYear = await request(createTestApp()).get("/rh/life-projects?year=not-a-year");
    const forbidden = await request(createTestApp(0)).get("/rh/life-projects?year=2026");

    expect(invalidYear.status).toBe(400);
    expect(forbidden.status).toBe(403);
    expect(lifeProjectServiceMock.get).not.toHaveBeenCalled();
  });

  it("updates histories and creates or updates objectives through validated routes", async () => {
    const updatedProject = await request(createTestApp())
      .patch(`/rh/life-projects/${projectId}`)
      .send({ life_story: "Nova história" });
    const createdObjective = await request(createTestApp())
      .post(`/rh/life-projects/${projectId}/objectives`)
      .send({ title: "Concluir formação", forecast_date: "2026-12-01" });
    const updatedObjective = await request(createTestApp(3))
      .patch(`/rh/life-projects/${projectId}/objectives/${objectiveId}`)
      .send({ status: "Realized", rh_observations: "Concluído" });

    expect(updatedProject.status).toBe(200);
    expect(createdObjective.status).toBe(201);
    expect(updatedObjective.status).toBe(200);
    expect(lifeProjectServiceMock.update).toHaveBeenCalledWith(
      { actorUserId: userId, organizationId, rhPermission: 1 },
      projectId,
      { life_story: "Nova história" },
    );
    expect(lifeProjectServiceMock.createObjective).toHaveBeenCalledWith(
      { actorUserId: userId, organizationId, rhPermission: 1 },
      projectId,
      { title: "Concluir formação", forecast_date: new Date("2026-12-01T00:00:00.000Z") },
    );
    expect(lifeProjectServiceMock.updateObjective).toHaveBeenCalledWith(
      { actorUserId: userId, organizationId, rhPermission: 3 },
      projectId,
      objectiveId,
      { status: "Realized", rh_observations: "Concluído" },
    );
  });
});
