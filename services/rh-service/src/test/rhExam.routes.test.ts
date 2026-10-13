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

import { createRhExamRouter } from "../routes/rhExam.routes.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";
const evaluatorId = "00000000-0000-4000-8000-000000000003";
const participantId = "00000000-0000-4000-8000-000000000004";

const examServiceMock = {
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  open: vi.fn(),
};

function createTestApp(permission = 3) {
  const app = express();
  app.use(express.json());
  app.use((req, _response, next) => {
    req.organization_id = organizationId;
    req.user_id = userId;
    req.rh_permission = permission;
    next();
  });
  app.use("/rh/exams", createRhExamRouter(examServiceMock as never));
  app.use(((
    err: { statusCode?: number; message?: string },
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => response.status(err.statusCode ?? 500).json({ error: err.message })) as ErrorRequestHandler);
  return app;
}

describe("RH exam routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    examServiceMock.create.mockResolvedValue({ id: "exam-1", status: "New" });
    examServiceMock.list.mockResolvedValue([]);
    examServiceMock.get.mockResolvedValue({ id: "exam-1" });
    examServiceMock.open.mockResolvedValue({ id: "exam-1", status: "Open" });
  });

  it("requires RH management permission for exam administration", async () => {
    const response = await request(createTestApp(1)).get("/rh/exams");

    expect(response.status).toBe(403);
    expect(examServiceMock.list).not.toHaveBeenCalled();
  });

  it("creates an exam scoped to the authenticated organization and creator", async () => {
    const response = await request(createTestApp())
      .post("/rh/exams")
      .send({
        title: "Prova discursiva",
        evaluator_id: evaluatorId,
        participant_ids: [participantId],
        questions: [{ prompt: "Questão", value: 10, answer_key: "Gabarito" }],
      });

    expect(response.status).toBe(201);
    expect(examServiceMock.create).toHaveBeenCalledWith({
      title: "Prova discursiva",
      evaluator_id: evaluatorId,
      participant_ids: [participantId],
      questions: [{ prompt: "Questão", value: 10, answer_key: "Gabarito" }],
      observations: "",
      organization_id: organizationId,
      created_by_id: userId,
    });
  });

  it("rejects malformed exam data before the service call", async () => {
    const response = await request(createTestApp()).post("/rh/exams").send({ title: "" });

    expect(response.status).toBe(400);
    expect(examServiceMock.create).not.toHaveBeenCalled();
  });

  it("lists and opens exams within the authenticated organization", async () => {
    const list = await request(createTestApp()).get("/rh/exams");
    const opened = await request(createTestApp()).post(
      "/rh/exams/00000000-0000-4000-8000-000000000010/open",
    );

    expect(list.status).toBe(200);
    expect(examServiceMock.list).toHaveBeenCalledWith(organizationId);
    expect(opened.status).toBe(200);
    expect(examServiceMock.open).toHaveBeenCalledWith(
      organizationId,
      "00000000-0000-4000-8000-000000000010",
    );
  });
});
