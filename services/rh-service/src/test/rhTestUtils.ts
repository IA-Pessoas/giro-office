import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import type { NextFunction } from "express";
import { vi } from "vitest";

type MockGroup = Record<string, ReturnType<typeof vi.fn>>;

const rhMocks: {
  pointConfigServiceMock: MockGroup;
  pointServiceMock: MockGroup;
  timeClockRequestServiceMock: MockGroup;
  categoryServiceMock: MockGroup;
  requestServiceMock: MockGroup;
  operationalUserServiceMock: MockGroup;
  scoreQuestionServiceMock: MockGroup;
  scoreQuarterServiceMock: MockGroup;
  scoreEvaluationServiceMock: MockGroup;
  holidayServiceMock: MockGroup;
  timeBankReleaseServiceMock: MockGroup;
  messageServiceMock: MockGroup;
  timeSheetServiceMock: MockGroup;
  scoreNitroServiceMock: MockGroup;
  employeeDossierServiceMock: MockGroup;
  rhNotificationServiceMock: MockGroup;
} = vi.hoisted(() => ({
  pointConfigServiceMock: {
    upsert: vi.fn(),
    getByUserId: vi.fn(),
  },
  pointServiceMock: {
    registerPoint: vi.fn(),
    calculateDailyHours: vi.fn(),
    listPoints: vi.fn(),
    getTodayPointForUser: vi.fn(),
    getMonthlySummary: vi.fn(),
    recalculateRange: vi.fn(),
  },
  timeClockRequestServiceMock: {
    create: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    list: vi.fn(),
    approveBulk: vi.fn(),
    createRetroactive: vi.fn(),
    uploadAttachment: vi.fn(),
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
    markOpened: vi.fn(),
  },
  operationalUserServiceMock: {
    list: vi.fn(),
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
    getSummary: vi.fn(),
    getOverview: vi.fn(),
  },
  messageServiceMock: {
    create: vi.fn(),
    listByRequest: vi.fn(),
  },
  timeSheetServiceMock: {
    create: vi.fn(),
    rebuild: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    getPdf: vi.fn(),
    sign: vi.fn(),
    reopen: vi.fn(),
  },
  scoreNitroServiceMock: {
    updateMetric: vi.fn(),
  },
  employeeDossierServiceMock: {
    getDossier: vi.fn(),
    listDossiers: vi.fn(),
    updateDossier: vi.fn(),
    listContacts: vi.fn(),
    createContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
    listAllergies: vi.fn(),
    replaceAllergies: vi.fn(),
  },
  rhNotificationServiceMock: {
    list: vi.fn(),
    markRead: vi.fn(),
    notify: vi.fn(),
  },
}));

const {
  pointConfigServiceMock,
  pointServiceMock,
  timeClockRequestServiceMock,
  categoryServiceMock,
  requestServiceMock,
  operationalUserServiceMock,
  scoreQuestionServiceMock,
  scoreQuarterServiceMock,
  scoreEvaluationServiceMock,
  holidayServiceMock,
  timeBankReleaseServiceMock,
  messageServiceMock,
  timeSheetServiceMock,
  scoreNitroServiceMock,
  employeeDossierServiceMock,
  rhNotificationServiceMock,
} = rhMocks;

vi.mock("../services/pointConfigService.js", () => ({
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
  RH_MANAGEMENT_PERMISSION: 3,
  RH_MANAGER_PERMISSION: 2,
  RH_SELF_SERVICE_PERMISSION: 1,
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

vi.mock("../services/operationalUserService.js", () => ({
  OperationalUserService: vi.fn(function OperationalUserService() {
    return rhMocks.operationalUserServiceMock;
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

vi.mock("../services/employeeDossierService.js", () => ({
  EmployeeDossierService: vi.fn(function EmployeeDossierService() {
    return rhMocks.employeeDossierServiceMock;
  }),
}));

vi.mock("../services/rhNotificationService.js", () => ({
  rhNotificationService: rhMocks.rhNotificationServiceMock,
}));

const testAuthContext = vi.hoisted(() => ({
  rhPermission: 3,
}));

vi.mock("../middlewares/isAuthenticated.js", () => ({
  isAuthenticated: (req: Express.Request, _res: Express.Response, next: NextFunction) => {
    req.user_id = "00000000-0000-4000-8000-000000000001";
    req.organization_id = "00000000-0000-4000-8000-000000000002";
    req.rh_permission ??= testAuthContext.rhPermission;
    next();
  },
}));

import { createApp } from "../app.js";
import type { RhEnv } from "../config/env.js";

export function createTestApp(options: { rhPermission?: number } = {}) {
  if (options.rhPermission !== undefined) {
    testAuthContext.rhPermission = options.rhPermission;
  }

  const env = {
    port: 3034,
    databaseUrl: "postgresql://localhost/rh_test",
    databasePoolMax: 5,
    jwtSecret: "test-secret",
    reportsInternalToken: "test-reports-internal-token",
    reportsGrantSecret: "test-reports-grant-secret",
    nodeEnv: "test",
    logLevel: "silent",
    logPretty: false,
    pointMinIntervalMinutes: 30,
    allowedOrigins: ["*"],
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
  testAuthContext.rhPermission = 3;

  pointConfigServiceMock.upsert.mockResolvedValue({ ok: true });
  pointConfigServiceMock.getByUserId.mockResolvedValue({ ok: true });
  pointServiceMock.registerPoint.mockResolvedValue({ ok: true });
  pointServiceMock.calculateDailyHours.mockResolvedValue({ ok: true });
  pointServiceMock.listPoints.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  pointServiceMock.getTodayPointForUser.mockResolvedValue({
    point: null,
    next_action: "Entrada",
    is_complete: false,
    has_clock_in: false,
    has_lunch_out: false,
    has_lunch_in: false,
    has_clock_out: false,
  });
  pointServiceMock.getMonthlySummary.mockResolvedValue({
    month: "2026-05",
    user_id: "00000000-0000-4000-8000-000000000001",
    total_worked_minutes: 0,
    expected_minutes: 0,
    balance_minutes: 0,
    overtime_minutes: 0,
    absence_days: 0,
    pending_adjustments: 0,
  });
  pointServiceMock.recalculateRange.mockResolvedValue({ processed: 0 });
  timeClockRequestServiceMock.create.mockResolvedValue({ ok: true });
  timeClockRequestServiceMock.approve.mockResolvedValue({ ok: true });
  timeClockRequestServiceMock.reject.mockResolvedValue({ ok: true });
  timeClockRequestServiceMock.approveBulk.mockResolvedValue({ ok: true });
  timeClockRequestServiceMock.createRetroactive.mockResolvedValue({ ok: true });
  timeClockRequestServiceMock.uploadAttachment.mockResolvedValue({ ok: true });
  timeClockRequestServiceMock.list.mockResolvedValue([
    { id: "00000000-0000-4000-8000-000000000010", status: "Pendente" },
  ]);
  categoryServiceMock.create.mockResolvedValue({ ok: true });
  categoryServiceMock.update.mockResolvedValue({ ok: true });
  categoryServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  categoryServiceMock.delete.mockResolvedValue({ ok: true });
  requestServiceMock.create.mockResolvedValue({ ok: true });
  requestServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  requestServiceMock.getById.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000010",
    requester_user_id: "00000000-0000-4000-8000-000000000001",
  });
  requestServiceMock.update.mockResolvedValue({ ok: true });
  requestServiceMock.delete.mockResolvedValue({ ok: true });
  requestServiceMock.markOpened.mockResolvedValue(undefined);
  operationalUserServiceMock.list.mockResolvedValue([
    {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Usuario RH",
      department: "RH",
      status: "active",
    },
  ]);
  scoreQuestionServiceMock.create.mockResolvedValue({ ok: true });
  scoreQuestionServiceMock.update.mockResolvedValue({ ok: true });
  scoreQuestionServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  scoreQuestionServiceMock.delete.mockResolvedValue({ ok: true });
  scoreQuarterServiceMock.generateQuarterlyScore.mockResolvedValue({ ok: true });
  scoreQuarterServiceMock.updateNitro.mockResolvedValue({ ok: true });
  scoreQuarterServiceMock.listForUser.mockResolvedValue([
    { id: "00000000-0000-4000-8000-000000000010" },
  ]);
  scoreQuarterServiceMock.getDetail.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000010",
    user_id: "00000000-0000-4000-8000-000000000001",
  });
  scoreEvaluationServiceMock.listPendingEvaluations.mockResolvedValue([
    { id: "00000000-0000-4000-8000-000000000010" },
  ]);
  scoreEvaluationServiceMock.submitEvaluation.mockResolvedValue({ ok: true });
  holidayServiceMock.create.mockResolvedValue({ ok: true });
  holidayServiceMock.update.mockResolvedValue({ ok: true });
  holidayServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  holidayServiceMock.delete.mockResolvedValue({ ok: true });
  timeBankReleaseServiceMock.list.mockResolvedValue([
    { id: "00000000-0000-4000-8000-000000000010" },
  ]);
  timeBankReleaseServiceMock.create.mockResolvedValue({ ok: true });
  timeBankReleaseServiceMock.approve.mockResolvedValue({ ok: true });
  timeBankReleaseServiceMock.getSummary.mockResolvedValue({
    user_id: "00000000-0000-4000-8000-000000000001",
    balance_minutes: 75,
    approved_releases_count: 2,
    pending_releases_count: 1,
  });
  timeBankReleaseServiceMock.getOverview.mockResolvedValue({
    total_pending_releases: 1,
    total_approved_releases: 2,
    users_with_positive_balance: 3,
    users_with_negative_balance: 4,
  });
  messageServiceMock.create.mockResolvedValue({ ok: true });
  messageServiceMock.listByRequest.mockResolvedValue([
    { id: "00000000-0000-4000-8000-000000000010" },
  ]);
  timeSheetServiceMock.create.mockResolvedValue({ ok: true });
  timeSheetServiceMock.list.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000010" }]);
  timeSheetServiceMock.getById.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000010",
    user_id: "00000000-0000-4000-8000-000000000001",
    status: "Gerada",
    days: [],
    totals: {
      worked_minutes: 0,
      expected_minutes: 0,
      balance_minutes: 0,
      absence_count: 0,
      bank_balance_minutes: 0,
    },
  });
  timeSheetServiceMock.sign.mockResolvedValue({ ok: true });
  timeSheetServiceMock.reopen.mockResolvedValue({ ok: true });
  timeSheetServiceMock.rebuild.mockResolvedValue({ ok: true });
  timeSheetServiceMock.getPdf.mockResolvedValue({
    buffer: Buffer.from("%PDF-1.7\n"),
    fileName: "folha-ponto.pdf",
  });
  scoreNitroServiceMock.updateMetric.mockResolvedValue({ ok: true });
  employeeDossierServiceMock.getDossier.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
  });
  employeeDossierServiceMock.listDossiers.mockResolvedValue([]);
  employeeDossierServiceMock.updateDossier.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
  });
  employeeDossierServiceMock.listContacts.mockResolvedValue([]);
  employeeDossierServiceMock.createContact.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000010",
    name: "Contato",
    phone: "5511999999999",
  });
  employeeDossierServiceMock.updateContact.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000010",
    name: "Contato",
    phone: "5511999999999",
  });
  employeeDossierServiceMock.deleteContact.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000010",
  });
  employeeDossierServiceMock.listAllergies.mockResolvedValue([]);
  employeeDossierServiceMock.replaceAllergies.mockResolvedValue([]);
  rhNotificationServiceMock.list.mockResolvedValue([]);
  rhNotificationServiceMock.markRead.mockResolvedValue({ count: 0 });
  rhNotificationServiceMock.notify.mockResolvedValue(undefined);
}

export function setRhRoutePermission(permission: number) {
  testAuthContext.rhPermission = permission;
}

export {
  categoryServiceMock,
  holidayServiceMock,
  messageServiceMock,
  operationalUserServiceMock,
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
  employeeDossierServiceMock,
  rhNotificationServiceMock,
};
