import { Writable } from "node:stream";

import { createLogger } from "@workspace/shared/logger";
import type { NextFunction } from "express";
import { vi } from "vitest";

type MockGroup = Record<string, ReturnType<typeof vi.fn>>;

const rhMocks: {
  pointConfigServiceMock: MockGroup;
  pointServiceMock: MockGroup;
  timeClockRequestServiceMock: MockGroup;
  categoryServiceMock: MockGroup;
  requestServiceMock: MockGroup;
  scoreQuestionServiceMock: MockGroup;
  scoreQuarterServiceMock: MockGroup;
  scoreEvaluationServiceMock: MockGroup;
  holidayServiceMock: MockGroup;
  timeBankReleaseServiceMock: MockGroup;
  messageServiceMock: MockGroup;
  timeSheetServiceMock: MockGroup;
  scoreNitroServiceMock: MockGroup;
} = vi.hoisted(() => ({
  pointConfigServiceMock: {
    upsert: vi.fn(),
    getByUserId: vi.fn(),
  },
  pointServiceMock: {
    registerPoint: vi.fn(),
    calculateDailyHours: vi.fn(),
  },
  timeClockRequestServiceMock: {
    create: vi.fn(),
    approve: vi.fn(),
  },
  categoryServiceMock: {
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  },
  requestServiceMock: {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  scoreQuestionServiceMock: {
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  },
  scoreQuarterServiceMock: {
    generateQuarterlyScore: vi.fn(),
    updateNitro: vi.fn(),
    listForUser: vi.fn(),
    getDetail: vi.fn(),
  },
  scoreEvaluationServiceMock: {
    listPendingEvaluations: vi.fn(),
    submitEvaluation: vi.fn(),
  },
  holidayServiceMock: {
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  },
  timeBankReleaseServiceMock: {
    list: vi.fn(),
    create: vi.fn(),
    approve: vi.fn(),
  },
  messageServiceMock: {
    create: vi.fn(),
    listByRequest: vi.fn(),
  },
  timeSheetServiceMock: {
    create: vi.fn(),
    list: vi.fn(),
    sign: vi.fn(),
  },
  scoreNitroServiceMock: {
    updateMetric: vi.fn(),
  },
}));

const {
  pointConfigServiceMock,
  pointServiceMock,
  timeClockRequestServiceMock,
  categoryServiceMock,
  requestServiceMock,
  scoreQuestionServiceMock,
  scoreQuarterServiceMock,
  scoreEvaluationServiceMock,
  holidayServiceMock,
  timeBankReleaseServiceMock,
  messageServiceMock,
  timeSheetServiceMock,
  scoreNitroServiceMock,
} = rhMocks;

vi.mock("../services/PointConfigService.js", () => ({
  PointConfigService: vi.fn(function PointConfigService() {
    return rhMocks.pointConfigServiceMock;
  }),
}));

vi.mock("../services/pointService.js", () => ({
  PointService: vi.fn(function PointService() {
    return rhMocks.pointServiceMock;
  }),
}));

vi.mock("../services/timeClockRequestService.js", () => ({
  TimeClockRequestService: vi.fn(function TimeClockRequestService() {
    return rhMocks.timeClockRequestServiceMock;
  }),
}));

vi.mock("../services/categoryService.js", () => ({
  CategoryService: vi.fn(function CategoryService() {
    return rhMocks.categoryServiceMock;
  }),
}));

vi.mock("../services/requestService.js", () => ({
  RequestService: vi.fn(function RequestService() {
    return rhMocks.requestServiceMock;
  }),
}));

vi.mock("../services/scoreQuestionService.js", () => ({
  ScoreQuestionService: vi.fn(function ScoreQuestionService() {
    return rhMocks.scoreQuestionServiceMock;
  }),
}));

vi.mock("../services/scoreQuarterService.js", () => ({
  ScoreQuarterService: vi.fn(function ScoreQuarterService() {
    return rhMocks.scoreQuarterServiceMock;
  }),
}));

vi.mock("../services/scoreEvaluationService.js", () => ({
  ScoreEvaluationService: vi.fn(function ScoreEvaluationService() {
    return rhMocks.scoreEvaluationServiceMock;
  }),
}));

vi.mock("../services/holidayService.js", () => ({
  HolidayService: vi.fn(function HolidayService() {
    return rhMocks.holidayServiceMock;
  }),
}));

vi.mock("../services/timeBankReleaseService.js", () => ({
  TimeBankReleaseService: vi.fn(function TimeBankReleaseService() {
    return rhMocks.timeBankReleaseServiceMock;
  }),
}));

vi.mock("../services/messageService.js", () => ({
  MessageService: vi.fn(function MessageService() {
    return rhMocks.messageServiceMock;
  }),
}));

vi.mock("../services/timeSheetService.js", () => ({
  TimeSheetService: vi.fn(function TimeSheetService() {
    return rhMocks.timeSheetServiceMock;
  }),
}));

vi.mock("../services/scoreNitroService.js", () => ({
  ScoreNitroService: vi.fn(function ScoreNitroService() {
    return rhMocks.scoreNitroServiceMock;
  }),
}));

vi.mock("../middlewares/isAuthenticated.js", () => ({
  isAuthenticated: (
    req: Express.Request,
    _res: Express.Response,
    next: NextFunction,
  ) => {
    req.user_id = "00000000-0000-4000-8000-000000000001";
    req.organization_id = "00000000-0000-4000-8000-000000000002";
    next();
  },
}));

import { createApp } from "../app.js";
import type { RhEnv } from "../config/env.js";

class MemoryLogStream extends Writable {
  _write(
    _chunk: string | Uint8Array,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

export function createTestApp() {
  const env = {
    port: 3034,
    databaseUrl: "postgresql://localhost/rh_test",
    jwtSecret: "test-secret",
    nodeEnv: "test",
    logLevel: "silent",
    logPretty: false,
    pointMinIntervalMinutes: 30,
    enableApiDocs: false,
  } satisfies RhEnv;
  const logger = createLogger({
    service: "rh-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  return createApp(logger, env);
}

export function resetRhRouteMocks() {
  vi.clearAllMocks();

  pointConfigServiceMock.upsert.mockResolvedValue({ ok: true });
  pointConfigServiceMock.getByUserId.mockResolvedValue({ ok: true });
  pointServiceMock.registerPoint.mockResolvedValue({ ok: true });
  pointServiceMock.calculateDailyHours.mockResolvedValue({ ok: true });
  timeClockRequestServiceMock.create.mockResolvedValue({ ok: true });
  timeClockRequestServiceMock.approve.mockResolvedValue({ ok: true });
  categoryServiceMock.create.mockResolvedValue({ ok: true });
  categoryServiceMock.update.mockResolvedValue({ ok: true });
  categoryServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  categoryServiceMock.delete.mockResolvedValue({ ok: true });
  requestServiceMock.create.mockResolvedValue({ ok: true });
  requestServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  requestServiceMock.getById.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000010" });
  requestServiceMock.update.mockResolvedValue({ ok: true });
  requestServiceMock.delete.mockResolvedValue({ ok: true });
  scoreQuestionServiceMock.create.mockResolvedValue({ ok: true });
  scoreQuestionServiceMock.update.mockResolvedValue({ ok: true });
  scoreQuestionServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  scoreQuestionServiceMock.delete.mockResolvedValue({ ok: true });
  scoreQuarterServiceMock.generateQuarterlyScore.mockResolvedValue({ ok: true });
  scoreQuarterServiceMock.updateNitro.mockResolvedValue({ ok: true });
  scoreQuarterServiceMock.listForUser.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  scoreQuarterServiceMock.getDetail.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000010" });
  scoreEvaluationServiceMock.listPendingEvaluations.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  scoreEvaluationServiceMock.submitEvaluation.mockResolvedValue({ ok: true });
  holidayServiceMock.create.mockResolvedValue({ ok: true });
  holidayServiceMock.update.mockResolvedValue({ ok: true });
  holidayServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  holidayServiceMock.delete.mockResolvedValue({ ok: true });
  timeBankReleaseServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  timeBankReleaseServiceMock.create.mockResolvedValue({ ok: true });
  timeBankReleaseServiceMock.approve.mockResolvedValue({ ok: true });
  messageServiceMock.create.mockResolvedValue({ ok: true });
  messageServiceMock.listByRequest.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  timeSheetServiceMock.create.mockResolvedValue({ ok: true });
  timeSheetServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  timeSheetServiceMock.sign.mockResolvedValue({ ok: true });
  scoreNitroServiceMock.updateMetric.mockResolvedValue({ ok: true });
}

export {
  categoryServiceMock,
  holidayServiceMock,
  messageServiceMock,
  pointConfigServiceMock,
  pointServiceMock,
  requestServiceMock,
  scoreEvaluationServiceMock,
  scoreNitroServiceMock,
  scoreQuarterServiceMock,
  scoreQuestionServiceMock,
  timeBankReleaseServiceMock,
  timeClockRequestServiceMock,
  timeSheetServiceMock,
};
