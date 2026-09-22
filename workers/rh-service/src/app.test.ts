import { describe, expect, it, vi } from "vitest";
import {
  createRhWorkerApp,
  type RhCategoryPrisma,
  type RhCategoryService,
  type RhNotificationService,
  type RhWorkerEnv,
} from "./app.js";

const USER_ID = "b0000000-0000-4000-8000-000000000001";
const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "c0000000-0000-4000-8000-000000000001";
const TOKEN = "rh-gateway-token";

function env(): RhWorkerEnv {
  return {
    JWT_SECRET: "rh-worker-test-secret-which-is-long-enough",
    INTERNAL_SERVICE_TOKEN: TOKEN,
    HYPERDRIVE: { connectionString: "postgresql://worker:test@db.example/giro" },
  };
}

function headers(permission = "3"): HeadersInit {
  return {
    "x-internal-service-token": TOKEN,
    "x-auth-user-id": USER_ID,
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-permission": permission,
  };
}

function service(): RhCategoryService {
  return {
    list: vi.fn(async () => [{ id: CATEGORY_ID, name: "Férias", active: true }]),
    create: vi.fn(async () => ({ id: CATEGORY_ID, name: "Férias", active: true })),
    update: vi.fn(async () => ({ id: CATEGORY_ID, name: "Folga", active: true })),
    delete: vi.fn(async () => ({ count: 1 })),
  };
}

function notificationService(): RhNotificationService {
  return {
    list: vi.fn(async () => [{ id: "notification-1", read: false }]),
    markRead: vi.fn(async () => ({ count: 1 })),
  };
}

describe("rh Worker", () => {
  it("serves health and readiness", async () => {
    const prisma = { $queryRaw: vi.fn(async () => []) } as unknown as RhCategoryPrisma;
    const app = createRhWorkerApp({ env: env(), prisma, categoryService: service() });
    expect((await app.request("https://rh.test/health")).status).toBe(200);
    expect((await app.request("https://rh.test/ready")).status).toBe(200);
  });

  it("requires authentication and RH permission", async () => {
    const categoryService = service();
    const app = createRhWorkerApp({ env: env(), categoryService });
    expect((await app.request("https://rh.test/rh/categories")).status).toBe(401);
    expect(
      (await app.request("https://rh.test/rh/categories", { headers: headers("0") })).status,
    ).toBe(403);
    expect(categoryService.list).not.toHaveBeenCalled();
  });

  it("keeps category operations scoped to the forwarded organization", async () => {
    const categoryService = service();
    const app = createRhWorkerApp({ env: env(), categoryService });
    const list = await app.request("https://rh.test/rh/categories?activeOnly=true", {
      headers: headers("1"),
    });
    const created = await app.request("https://rh.test/rh/categories", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Férias", active: true }),
    });
    const updated = await app.request("https://rh.test/rh/categories", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: CATEGORY_ID, active: false }),
    });
    expect(list.status).toBe(200);
    expect(created.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(categoryService.list).toHaveBeenCalledWith(ORGANIZATION_ID, true);
    expect(categoryService.create).toHaveBeenCalledWith(ORGANIZATION_ID, {
      name: "Férias",
      active: true,
    });
    expect(categoryService.update).toHaveBeenCalledWith(ORGANIZATION_ID, {
      id: CATEGORY_ID,
      active: false,
    });
  });

  it("deletes a category only inside the forwarded organization", async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const count = vi.fn(async () => 0);
    const prisma = {
      rhCategory: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => ({ id: CATEGORY_ID })),
        create: vi.fn(),
        update: vi.fn(),
        deleteMany,
      },
      rhNotification: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      rhRequest: { count },
    } as unknown as RhCategoryPrisma;
    const app = createRhWorkerApp({ env: env(), prisma });

    const response = await app.request("https://rh.test/rh/categories", {
      method: "DELETE",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: CATEGORY_ID }),
    });

    expect(response.status).toBe(200);
    expect(count).toHaveBeenCalledWith({
      where: { category_id: CATEGORY_ID, organization_id: ORGANIZATION_ID },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: CATEGORY_ID, organization_id: ORGANIZATION_ID },
    });
  });

  it("rejects a category rename that duplicates another category in the organization", async () => {
    const update = vi.fn(async () => ({ id: CATEGORY_ID }));
    const prisma = {
      rhCategory: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: CATEGORY_ID })
          .mockResolvedValueOnce({ id: "other-category" }),
        update,
      },
    } as unknown as RhCategoryPrisma;
    const app = createRhWorkerApp({ env: env(), prisma });

    const response = await app.request("https://rh.test/rh/categories", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: CATEGORY_ID, name: "Férias" }),
    });

    expect(response.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("preserves the score question CRUD contract", async () => {
    const scoreQuestionService = {
      create: vi.fn(async () => ({ id: "question-1" })),
      update: vi.fn(async () => ({ id: "question-1" })),
      list: vi.fn(async () => [{ id: "question-1" }]),
      delete: vi.fn(async () => ({ message: "Pergunta inativada com sucesso" })),
    };
    const app = createRhWorkerApp({ env: env(), scoreQuestionService } as never);

    const created = await app.request("https://rh.test/rh/score/questions", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ question: "Como foi o trimestre?", type: "behavioral" }),
    });
    const updated = await app.request("https://rh.test/rh/score/questions", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: CATEGORY_ID, active: false }),
    });
    const listed = await app.request("https://rh.test/rh/score/questions?type=technical&all=true", {
      headers: headers(),
    });
    const deleted = await app.request("https://rh.test/rh/score/questions", {
      method: "DELETE",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: CATEGORY_ID }),
    });

    expect([created.status, updated.status, listed.status, deleted.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(scoreQuestionService.create).toHaveBeenCalledWith({
      organization_id: ORGANIZATION_ID,
      question: "Como foi o trimestre?",
      type: "behavioral",
    });
    expect(scoreQuestionService.update).toHaveBeenCalledWith({
      id: CATEGORY_ID,
      organization_id: ORGANIZATION_ID,
      active: false,
    });
    expect(scoreQuestionService.list).toHaveBeenCalledWith(ORGANIZATION_ID, {
      type: "technical",
      includeInactive: true,
    });
    expect(scoreQuestionService.delete).toHaveBeenCalledWith({
      id: CATEGORY_ID,
      organization_id: ORGANIZATION_ID,
    });
  });

  it("preserves the holiday CRUD contract", async () => {
    const holidayService = {
      create: vi.fn(async () => ({ id: "holiday-1" })),
      update: vi.fn(async () => ({ id: "holiday-1" })),
      list: vi.fn(async () => [{ id: "holiday-1" }]),
      delete: vi.fn(async () => ({ message: "Feriado removido com sucesso" })),
    };
    const app = createRhWorkerApp({ env: env(), holidayService } as never);

    const created = await app.request("https://rh.test/rh/holidays", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ name: "Confraternização", date: "2026-12-24T00:00:00.000Z" }),
    });
    const updated = await app.request("https://rh.test/rh/holidays", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        id: CATEGORY_ID,
        name: "Confraternização atualizada",
        date: "2026-12-24T00:00:00.000Z",
      }),
    });
    const listed = await app.request("https://rh.test/rh/holidays", { headers: headers("1") });
    const deleted = await app.request("https://rh.test/rh/holidays", {
      method: "DELETE",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: CATEGORY_ID }),
    });

    expect([created.status, updated.status, listed.status, deleted.status]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(holidayService.create).toHaveBeenCalledWith({
      organization_id: ORGANIZATION_ID,
      name: "Confraternização",
      date: new Date("2026-12-24T00:00:00.000Z"),
    });
    expect(holidayService.update).toHaveBeenCalledWith({
      id: CATEGORY_ID,
      organization_id: ORGANIZATION_ID,
      name: "Confraternização atualizada",
      date: new Date("2026-12-24T00:00:00.000Z"),
    });
    expect(holidayService.list).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(holidayService.delete).toHaveBeenCalledWith({
      id: CATEGORY_ID,
      organization_id: ORGANIZATION_ID,
    });
  });

  it("preserves point configuration scoping and time payloads", async () => {
    const pointConfigService = {
      upsert: vi.fn(async () => ({ user_id: USER_ID })),
      getByUserId: vi.fn(async () => ({ user_id: USER_ID })),
    };
    const app = createRhWorkerApp({ env: env(), pointConfigService } as never);

    const updated = await app.request("https://rh.test/rh/point-config", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        target_user_id: USER_ID,
        start_time: "08:00",
        lunch_break: "12:00",
        lunch_return: "13:00",
        end_time: "17:00",
        work_days: "1,2,3,4,5",
      }),
    });
    const own = await app.request("https://rh.test/rh/point-config", { headers: headers("1") });
    const thirdParty = await app.request(`https://rh.test/rh/point-config/${CATEGORY_ID}`, {
      headers: headers(),
    });

    expect([updated.status, own.status, thirdParty.status]).toEqual([200, 200, 200]);
    expect(pointConfigService.upsert).toHaveBeenCalledWith({
      user_id: USER_ID,
      organization_id: ORGANIZATION_ID,
      start_time: "08:00",
      lunch_break: "12:00",
      lunch_return: "13:00",
      end_time: "17:00",
      work_days: "1,2,3,4,5",
    });
    expect(pointConfigService.getByUserId).toHaveBeenNthCalledWith(1, USER_ID, ORGANIZATION_ID);
    expect(pointConfigService.getByUserId).toHaveBeenNthCalledWith(2, CATEGORY_ID, ORGANIZATION_ID);
  });

  it("preserves time bank release scoping and management operations", async () => {
    const timeBankService = {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: "release-1" })),
      approve: vi.fn(async () => ({ id: "release-1", is_approved: true })),
      getSummary: vi.fn(async () => ({ user_id: USER_ID, balance_minutes: 0 })),
      getOverview: vi.fn(async () => ({ total_pending_releases: 0 })),
    };
    const app = createRhWorkerApp({ env: env(), timeBankService } as never);

    const listed = await app.request(
      "https://rh.test/rh/time-bank-releases/list?user_id=00000000-0000-4000-8000-000000000009&is_approved=false",
      { headers: headers("1") },
    );
    const created = await app.request("https://rh.test/rh/time-bank-releases", {
      method: "POST",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        user_id: USER_ID,
        date: "2026-09-22T00:00:00.000Z",
        minutes: 30,
        reason: "Ajuste aprovado",
      }),
    });
    const approved = await app.request("https://rh.test/rh/time-bank-releases/approve", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: CATEGORY_ID }),
    });
    const summary = await app.request("https://rh.test/rh/time-bank/summary", {
      headers: headers("1"),
    });
    const userSummary = await app.request(`https://rh.test/rh/time-bank/summary/${CATEGORY_ID}`, {
      headers: headers(),
    });
    const overview = await app.request("https://rh.test/rh/time-bank/overview", {
      headers: headers(),
    });

    expect([
      listed.status,
      created.status,
      approved.status,
      summary.status,
      userSummary.status,
      overview.status,
    ]).toEqual([200, 200, 200, 200, 200, 200]);
    expect(timeBankService.list).toHaveBeenCalledWith(ORGANIZATION_ID, {
      user_id: USER_ID,
      is_approved: false,
    });
    expect(timeBankService.create).toHaveBeenCalledWith({
      organization_id: ORGANIZATION_ID,
      target_user_id: USER_ID,
      date: new Date("2026-09-22T00:00:00.000Z"),
      minutes: 30,
      reason: "Ajuste aprovado",
      added_by_user_id: USER_ID,
    });
    expect(timeBankService.approve).toHaveBeenCalledWith({
      id: CATEGORY_ID,
      organization_id: ORGANIZATION_ID,
    });
    expect(timeBankService.getSummary).toHaveBeenNthCalledWith(1, ORGANIZATION_ID, USER_ID);
    expect(timeBankService.getSummary).toHaveBeenNthCalledWith(2, ORGANIZATION_ID, CATEGORY_ID);
    expect(timeBankService.getOverview).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it("approves a time bank release atomically with the balance update", async () => {
    const transaction = vi.fn(async (callback: (client: RhCategoryPrisma) => Promise<unknown>) =>
      callback(prisma),
    );
    const prisma = {
      $transaction: transaction,
      pointsConfig: {
        findUnique: vi.fn(async () => ({ user_id: USER_ID })),
        update: vi.fn(async () => ({})),
      },
      timeBankReleases: {
        findFirst: vi.fn(async () => ({
          id: CATEGORY_ID,
          user_id: USER_ID,
          minutes: 30,
          is_approved: false,
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    } as unknown as RhCategoryPrisma;
    const app = createRhWorkerApp({ env: env(), prisma });

    const response = await app.request("https://rh.test/rh/time-bank-releases/approve", {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({ id: CATEGORY_ID }),
    });

    expect(response.status).toBe(200);
    expect(transaction).toHaveBeenCalledOnce();
  });

  it("lists and marks RH notifications for the authenticated user", async () => {
    const rhNotificationService = notificationService();
    const app = createRhWorkerApp({ env: env(), notificationService: rhNotificationService });
    const list = await app.request("https://rh.test/rh/notifications", { headers: headers("1") });
    const read = await app.request("https://rh.test/rh/notifications/read", {
      method: "PUT",
      headers: { ...headers("1"), "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    });

    expect([list.status, read.status]).toEqual([200, 200]);
    expect(rhNotificationService.list).toHaveBeenCalledWith(ORGANIZATION_ID, USER_ID);
    expect(rhNotificationService.markRead).toHaveBeenCalledWith({
      organization_id: ORGANIZATION_ID,
      user_id: USER_ID,
      all: true,
    });
  });
});
