import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import { vi } from "vitest";

import { createTiApplication } from "../app.js";
import type { TiServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";

export function createPrismaMock(): PrismaClient {
  const organizationId = "10000000-0000-4000-8000-000000000001";
  const departmentId = "50000000-0000-4000-8000-000000000001";
  const stockId = "80000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000001";
  const robotId = "90000000-0000-4000-8000-000000000001";
  let stockQuantity = 5;
  const stockTransaction = {
    stock: {
      findFirst: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId || where.department_id !== departmentId) {
          return null;
        }

        return {
          id: where.id,
          name: "Notebook",
          category_id: "60000000-0000-4000-8000-000000000001",
          location_id: "70000000-0000-4000-8000-000000000001",
          quantity: stockQuantity,
          department_id: departmentId,
          organization_id: where.organization_id,
        };
      }),
      update: vi.fn(async ({ where, data }) => {
        stockQuantity += data.quantity.increment;
        return { id: where.id, quantity: stockQuantity };
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        if (
          where.organization_id !== organizationId ||
          where.department_id !== departmentId ||
          stockQuantity < where.quantity.gte
        ) {
          return { count: 0 };
        }

        stockQuantity -= data.quantity.decrement;
        return { count: 1 };
      }),
    },
    entryStock: {
      create: vi.fn(async ({ data }) => ({ id: "entry-1", ...data })),
    },
    exitStock: {
      create: vi.fn(async ({ data }) => ({ id: "exit-1", ...data })),
    },
    user: {
      findFirst: vi.fn(async ({ where }) =>
        where.organization_id === organizationId
          ? {
              id: where.id,
              organization_id: where.organization_id,
            }
          : null,
      ),
    },
    locationStock: {
      findFirst: vi.fn(async ({ where }) =>
        where.organization_id === organizationId && where.department_id === departmentId
          ? {
              id: where.id,
              department_id: where.department_id,
              organization_id: where.organization_id,
              status: true,
            }
          : null,
      ),
    },
    categoryStock: {
      findFirst: vi.fn(async ({ where }) =>
        where.organization_id === organizationId && where.department_id === departmentId
          ? {
              id: where.id,
              department_id: where.department_id,
              organization_id: where.organization_id,
              status: true,
            }
          : null,
      ),
    },
  };

  return {
    department: {
      findFirst: vi.fn(async ({ where }) =>
        where.organization_id === organizationId
          ? {
              id: departmentId,
              name: "Tecnologia",
              organization_id: where.organization_id,
            }
          : null,
      ),
    },
    locationStock: {
      findMany: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId || where.department_id !== departmentId) {
          throw new Error("Stock location list missing Tecnologia department scope.");
        }

        return [];
      }),
      findFirst: vi.fn(async ({ where }) => {
        if (
          !where.id ||
          where.organization_id !== organizationId ||
          where.department_id !== departmentId
        ) {
          return null;
        }

        return {
          id: where.id,
          name: "Almoxarifado TI",
          floor: 2,
          department_id: where.department_id,
          status: where.status ?? true,
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: "stock-loc-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    categoryStock: {
      findMany: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId || where.department_id !== departmentId) {
          throw new Error("Stock category list missing Tecnologia department scope.");
        }

        return [];
      }),
      findFirst: vi.fn(async ({ where }) => {
        if (
          !where.id ||
          where.organization_id !== organizationId ||
          where.department_id !== departmentId
        ) {
          return null;
        }

        return {
          id: where.id,
          name: "Perifericos",
          department_id: where.department_id,
          status: where.status ?? true,
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: "stock-cat-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    stock: {
      count: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId || where.department_id !== departmentId) {
          throw new Error("Stock dashboard count missing Tecnologia department scope.");
        }

        return 0;
      }),
      findMany: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId || where.department_id !== departmentId) {
          throw new Error("Stock item list missing Tecnologia department scope.");
        }

        return [];
      }),
      findFirst: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId || where.department_id !== departmentId) {
          return null;
        }

        return {
          id: where.id ?? stockId,
          name: "Notebook",
          category_id: "60000000-0000-4000-8000-000000000001",
          location_id: "70000000-0000-4000-8000-000000000001",
          quantity: stockQuantity,
          description: "Notebook Dell.",
          department_id: where.department_id,
          status: true,
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: stockId, ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    entryStock: {
      create: vi.fn(async ({ data }) => ({ id: "entry-1", ...data })),
      findMany: vi.fn(async ({ where }) => {
        if (where.stock_id !== stockId || where.organization_id !== organizationId) {
          return [];
        }

        return [
          {
            id: "entry-1",
            stock_id: stockId,
            quantity: 2,
            entry_date: new Date("2026-07-13T12:00:00.000Z"),
            entry_by_user_id: userId,
            entry_by_user: {
              id: userId,
              name: "Usuario TI",
            },
          },
        ];
      }),
    },
    exitStock: {
      create: vi.fn(async ({ data }) => ({ id: "exit-1", ...data })),
      findMany: vi.fn(async ({ where }) => {
        if (where.stock_id !== stockId || where.organization_id !== organizationId) {
          return [];
        }

        return [
          {
            id: "exit-1",
            stock_id: stockId,
            quantity: 1,
            destination: "Smoke TI stock exit.",
            exit_date: new Date("2026-07-13T13:00:00.000Z"),
            requester_id: userId,
            approver_id: null,
            operator_id: null,
            location_destination_id: null,
            requester: {
              id: userId,
              name: "Usuario TI",
            },
            approver: null,
            operator: null,
            loc_dest: null,
          },
        ];
      }),
    },
    $transaction: vi.fn(async (callback) => callback(stockTransaction)),
    inventoryCategoryTecnologia: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }) => {
        if (!where.id) {
          return null;
        }

        return {
          id: where.id,
          name: "Notebook",
          tag: "NB",
          active: where.active ?? true,
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: "inv-cat-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    inventoryLocationTecnologia: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }) => {
        if (!where.id) {
          return null;
        }

        return {
          id: where.id,
          name: "Almoxarifado TI",
          active: where.active ?? true,
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: "inv-loc-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    inventoryTecnologia: {
      count: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId) {
          throw new Error("Inventory dashboard count missing organization scope.");
        }

        return where.user_id ? 3 : 5;
      }),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }) => {
        if (where.asset_code) {
          return null;
        }

        return {
          id: where.id,
          asset_code: "NB-001",
          category_id: "20000000-0000-4000-8000-000000000001",
          location_id: "30000000-0000-4000-8000-000000000001",
          user_id: null,
          responsible_it_staff_id: null,
          notes: null,
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: "asset-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    tICategoryRequest: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }) => {
        if (!where.id) {
          return null;
        }

        return {
          id: where.id,
          name: "Hardware",
          active: where.active ?? true,
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: "cat-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    user: {
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id,
        organization_id: where.organization_id,
      })),
    },
    tIRequest: {
      count: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId) {
          throw new Error("Request dashboard count missing organization scope.");
        }
        if (where.urgency) {
          return 1;
        }
        if (where.status === "Resolved") {
          return 1;
        }

        return 2;
      }),
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }) => ({
        id: where.id,
        status: "New",
        organization_id: where.organization_id,
      })),
      create: vi.fn(async ({ data }) => ({ id: "req-1", ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    tIMessage: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }) => ({ id: "msg-1", ...data })),
    },
    tIRobot: {
      count: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId) {
          throw new Error("Robot dashboard count missing organization scope.");
        }

        return 0;
      }),
      findMany: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId) {
          throw new Error("Robot list missing organization scope.");
        }

        return [];
      }),
      findFirst: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId) {
          return null;
        }

        return {
          id: where.id ?? robotId,
          name: "Backup diario",
          description: "Executa backup dos arquivos internos.",
          type: "Backup",
          schedule: "0 2 * * *",
          status: "active",
          active: true,
          organization_id: where.organization_id,
        };
      }),
      create: vi.fn(async ({ data }) => ({ id: robotId, ...data })),
      update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
    },
    tIRobotRun: {
      findMany: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId) {
          throw new Error("Robot run list missing organization scope.");
        }

        return [];
      }),
      create: vi.fn(async ({ data }) => ({ id: "run-1", ...data })),
    },
    termTecnologia: {
      count: vi.fn(async ({ where }) => {
        if (where.organization_id !== organizationId) {
          throw new Error("Term dashboard count missing organization scope.");
        }

        return 1;
      }),
    },
  } as unknown as PrismaClient;
}

export function createTestApp(prisma = createPrismaMock()) {
  const env = {
    nodeEnv: "test",
    port: 3040,
    databaseUrl: "postgresql://localhost/ti_service_test",
    auditServiceUrl: "http://localhost:3020",
    auditServiceToken: "audit-service-token-test",
    internalServiceToken: "ti-service-internal-token-test",
    passwordEncryptionKey: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
    allowedOrigins: ["*"],
    enableApiDocs: false,
    logLevel: "info",
    logPretty: false,
  } satisfies TiServiceEnv;
  const logger = createLogger({
    service: "ti-service-test",
    env: "test",
    level: "silent",
    destination: new MemoryLogStream(),
  });

  return createTiApplication({
    env,
    logger,
    prisma,
  });
}
