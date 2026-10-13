import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cceCycleServiceMock } = vi.hoisted(() => ({
  cceCycleServiceMock: {
    getFloorConfiguration: vi.fn(),
    configureFloors: vi.fn(),
    createCycle: vi.fn(),
    listCycles: vi.fn(),
    updateWeeklyEvaluation: vi.fn(),
  },
}));

vi.mock("../middlewares/isAuthenticated.js", () => ({
  isAuthenticated: (_request: Request, _response: Response, next: NextFunction) => next(),
}));

vi.mock("../services/cceCycleService.js", () => ({
  CceCycleService: vi.fn(function CceCycleService() {
    return cceCycleServiceMock;
  }),
}));

import cceCycleRoutes from "../routes/cceCycle.routes.js";

function createTestApp(permission = 3) {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.organization_id = "00000000-0000-4000-8000-000000000002";
    request.user_id = "00000000-0000-4000-8000-000000000001";
    request.rh_permission = permission;
    next();
  });
  app.use("/rh/cce", cceCycleRoutes);
  app.use(((
    err: { statusCode?: number; message?: string },
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    response.status(err.statusCode ?? 500).json({ error: err.message });
  }) as ErrorRequestHandler);
  return app;
}

describe("CCE cycle routes", () => {
  const organizationId = "00000000-0000-4000-8000-000000000002";
  const userId = "00000000-0000-4000-8000-000000000001";
  const evaluationId = "00000000-0000-4000-8000-000000000010";

  beforeEach(() => {
    vi.clearAllMocks();
    cceCycleServiceMock.getFloorConfiguration.mockResolvedValue({ floor_count: 4 });
    cceCycleServiceMock.configureFloors.mockResolvedValue({ floor_count: 4 });
    cceCycleServiceMock.createCycle.mockResolvedValue({ id: "cycle-1" });
    cceCycleServiceMock.listCycles.mockResolvedValue([]);
    cceCycleServiceMock.updateWeeklyEvaluation.mockResolvedValue({ total: 9 });
  });

  it("allows RH readers to read floor settings and scopes the request to their organization", async () => {
    const response = await request(createTestApp(1)).get("/rh/cce/floors");

    expect(response.status).toBe(200);
    expect(cceCycleServiceMock.getFloorConfiguration).toHaveBeenCalledWith(organizationId);
  });

  it("requires management permission to change floor settings", async () => {
    const response = await request(createTestApp(1)).put("/rh/cce/floors").send({ floor_count: 4 });

    expect(response.status).toBe(403);
    expect(cceCycleServiceMock.configureFloors).not.toHaveBeenCalled();
  });

  it("validates floor bounds before calling the service", async () => {
    const response = await request(createTestApp()).put("/rh/cce/floors").send({ floor_count: 5 });

    expect(response.status).toBe(400);
    expect(cceCycleServiceMock.configureFloors).not.toHaveBeenCalled();
  });

  it("creates a monthly cycle with the authenticated organization and user", async () => {
    const response = await request(createTestApp())
      .post("/rh/cce/cycles")
      .send({ year: 2026, month: 10 });

    expect(response.status).toBe(201);
    expect(cceCycleServiceMock.createCycle).toHaveBeenCalledWith({
      organization_id: organizationId,
      created_by_user_id: userId,
      year: 2026,
      month: 10,
    });
  });

  it("lists cycles for a reader using only the authenticated organization", async () => {
    const response = await request(createTestApp(1)).get("/rh/cce/cycles");

    expect(response.status).toBe(200);
    expect(cceCycleServiceMock.listCycles).toHaveBeenCalledWith({
      organization_id: organizationId,
    });
  });

  it("requires management permission to submit a weekly evaluation", async () => {
    const response = await request(createTestApp(1))
      .patch(`/rh/cce/weeks/${evaluationId}`)
      .send({});

    expect(response.status).toBe(403);
    expect(cceCycleServiceMock.updateWeeklyEvaluation).not.toHaveBeenCalled();
  });
});
