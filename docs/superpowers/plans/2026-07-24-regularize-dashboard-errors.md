# Regularize Dashboard Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Regularize dashboard request fan-out with one organization-scoped aggregate endpoint, lazy-load tab data, correlate backend failures by request ID, and deduplicate simultaneous server-error toasts.

**Architecture:** A focused `RegularizeDashboardService` will aggregate counts and preview rows inside one Prisma read transaction and expose them through an authenticated `GET /regularize/dashboard` route. The frontend will consume that contract through one React Query hook while a pure tab policy enables the existing list hooks only in their owning contexts. A small shared toast adapter will suppress duplicate `5xx` notifications without hiding the dashboard's contextual error panel.

**Tech Stack:** TypeScript, Express, Zod, Prisma 7, Vitest, Supertest, React 18, Next.js 16, TanStack React Query 5, Axios, React Toastify, Node contract test runners.

## Global Constraints

- Work only in `.worktrees/issue-448` on branch `fix/448-regularize-dashboard-errors`.
- Follow TDD: add a failing behavioral or contract test, observe the expected failure, then add the minimum implementation.
- Keep every backend query scoped by the authenticated `organization_id`; never accept organization identity from query parameters.
- Do not return login, password, credential notes, or unused site fields from the dashboard endpoint.
- Preserve the existing single React Query retry for transient failures.
- Keep public `500` responses generic and expose only the safe `requestId` for correlation.
- Do not add a migration, change deployment configuration, enable RLS, or modify the credential-reveal flow from issue #440.
- Use `apply_patch` for file edits and `pnpm` for package commands.
- Graphify has no local graph in this worktree; validate structure with call-site searches and scoped tests instead.

---

## File Map

### Backend

- Create `services/regularize-service/src/services/regularizeDashboardService.ts`: aggregate dashboard data and define its backend result types.
- Create `services/regularize-service/src/services/regularizeDashboardService.test.ts`: prove aggregation, organization isolation, field minimization, and error propagation.
- Create `services/regularize-service/src/schemas/dashboard.schemas.ts`: validate the required integer `year`.
- Create `services/regularize-service/src/routes/dashboard.routes.ts`: authenticated HTTP adapter for the aggregate service.
- Create `services/regularize-service/src/test/dashboard.routes.test.ts`: cover authentication, validation, success envelope, and safe errors.
- Modify `services/regularize-service/src/routes/index.ts`: mount the dashboard route.
- Modify `services/regularize-service/src/app.ts`: enrich error-log context with request correlation fields.
- Modify `services/regularize-service/src/test/app.test.ts`: cover the error-log context.
- Modify `services/regularize-service/src/openapi/spec.ts`: publish the new route.

### Frontend

- Modify `app/src/modules/regularize/types.ts`: add the aggregate dashboard contract.
- Modify `app/src/modules/regularize/services/regularizeService.contract.ts`: centralize the endpoint and `year` parameter.
- Modify `app/src/modules/regularize/services/regularizeService.ts`: fetch and unwrap the dashboard response.
- Create `app/src/modules/regularize/hooks/useRegularizeDashboard.ts`: own the dashboard query.
- Modify `app/src/modules/regularize/hooks/queryKeys.ts`: add dashboard root and year keys.
- Modify the three `useRegularize*` hook files: invalidate dashboard data after relevant mutations.
- Create `app/src/modules/regularize/utils/regularizeQueryPolicy.ts`: pure mapping from active tab to enabled queries.
- Create `app/src/modules/regularize/utils/regularizeApiError.ts`: safely extract `requestId`.
- Modify `app/src/modules/regularize/components/RegularizePage.tsx`: use the aggregate query, lazy policies, contextual error state, and active-tab refresh.
- Create `app/src/shared/services/serverErrorToast.ts`: pure deduplication adapter.
- Modify `app/src/shared/services/api.ts`: delegate `5xx` notification to the adapter.
- Modify `app/src/modules/regularize/run-regularize-tests.mjs`: behavioral and source-contract regressions.

---

### Task 1: Build the organization-scoped dashboard aggregation service

**Files:**

- Create: `services/regularize-service/src/services/regularizeDashboardService.test.ts`
- Create: `services/regularize-service/src/services/regularizeDashboardService.ts`

**Interfaces:**

- Consumes: generated `PrismaClient`.
- Produces: `RegularizeDashboardService.getDashboard(organizationId: string, year: number): Promise<RegularizeDashboardResult>`.
- Produces: `RegularizeDashboardResult`, used by the HTTP route and serialized by Express.

- [ ] **Step 1: Write the failing service tests**

Create `regularizeDashboardService.test.ts` with a Prisma double whose methods return distinct
values in transaction order:

```ts
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { RegularizeDashboardService } from "./regularizeDashboardService.js";

const organizationId = "a0000000-0000-4000-8000-000000000001";

function createPrismaDouble() {
  const recentProcessRows = [
    {
      id: "process-1",
      process_type: "Abertura",
      cpf_cnpj: "12345678901",
      status: "Aberto",
      clientPF: {
        name: "Ana",
        cpf: "12345678901",
        organization_id: organizationId,
      },
      clientPJ: null,
    },
  ];
  const recentProcesses = [
    {
      id: "process-1",
      process_type: "Abertura",
      cpf_cnpj: "12345678901",
      status: "Aberto",
      clientPF: { name: "Ana", cpf: "12345678901" },
      clientPJ: null,
    },
  ];
  const trackedLicenses = [
    {
      id: "license-1",
      type_license: "Alvará",
      protocol: "PROTO-1",
      due_date: new Date("2026-08-01T00:00:00.000Z"),
    },
  ];

  const prisma = {
    process: {
      count: vi.fn().mockResolvedValue(3),
      findMany: vi.fn().mockResolvedValue(recentProcessRows),
    },
    license: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue(trackedLicenses),
    },
    clientPF: {
      count: vi.fn().mockResolvedValue(5),
    },
    sitePasswordsRegularize: {
      count: vi.fn().mockResolvedValue(7),
    },
    client: {
      count: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(6),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  } as unknown as PrismaClient;

  return { prisma, recentProcesses, trackedLicenses };
}

describe("RegularizeDashboardService", () => {
  it("aggregates dashboard metrics and preview rows for one organization", async () => {
    const { prisma, recentProcesses, trackedLicenses } = createPrismaDouble();

    const result = await new RegularizeDashboardService(prisma).getDashboard(
      organizationId,
      2026,
    );

    expect(result).toEqual({
      year: 2026,
      metrics: {
        openProcesses: 3,
        activeLicenses: 2,
        activeClientPfs: 5,
        activeSites: 7,
        municipalTaxesCompleted: 6,
        municipalTaxesPending: 4,
        municipalTaxesTotal: 10,
      },
      recentProcesses,
      trackedLicenses,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("scopes every aggregate and nested municipal-tax relation by organization", async () => {
    const { prisma } = createPrismaDouble();

    await new RegularizeDashboardService(prisma).getDashboard(organizationId, 2026);

    expect(prisma.process.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organization_id: organizationId }) }),
    );
    expect(prisma.process.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: organizationId },
        take: 6,
        orderBy: { entry_date: "desc" },
        select: expect.objectContaining({
          clientPF: {
            select: { name: true, cpf: true, organization_id: true },
          },
          clientPJ: {
            select: { name: true, cpf_cnpj: true, organization_id: true },
          },
        }),
      }),
    );
    expect(prisma.license.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId, status: "Ativo" },
    });
    expect(prisma.clientPF.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId, status: "Ativo" },
    });
    expect(prisma.sitePasswordsRegularize.count).toHaveBeenCalledWith({
      where: { organization_id: organizationId, status: true },
    });
    expect(prisma.client.count).toHaveBeenLastCalledWith({
      where: {
        organization_id: organizationId,
        status: "Ativo",
        municipalTaxes: {
          some: { organization_id: organizationId, year: 2026 },
        },
      },
    });
  });

  it("selects no credential secrets and never returns a negative pending count", async () => {
    const { prisma } = createPrismaDouble();
    vi.mocked(prisma.client.count).mockReset();
    vi.mocked(prisma.client.count).mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    const result = await new RegularizeDashboardService(prisma).getDashboard(
      organizationId,
      2026,
    );

    expect(result.metrics.municipalTaxesPending).toBe(0);
    expect(JSON.stringify(vi.mocked(prisma.sitePasswordsRegularize.count).mock.calls)).not.toMatch(
      /password|login|notes/,
    );
  });

  it("propagates Prisma failures instead of returning empty dashboard data", async () => {
    const { prisma } = createPrismaDouble();
    vi.mocked(prisma.process.count).mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      new RegularizeDashboardService(prisma).getDashboard(organizationId, 2026),
    ).rejects.toThrow("database unavailable");
  });
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
pnpm --filter @workspace/regularize-service test -- src/services/regularizeDashboardService.test.ts
```

Expected: FAIL because `regularizeDashboardService.js` does not exist.

- [ ] **Step 3: Implement the aggregate service**

Create `regularizeDashboardService.ts` with these exported interfaces and transaction:

```ts
import type { PrismaClient } from "../generated/prisma/client.js";

export interface RegularizeDashboardProcess {
  id: string;
  process_type: string;
  cpf_cnpj: string;
  status: string;
  clientPF: { name: string; cpf: string } | null;
  clientPJ: { name: string; cpf_cnpj: string } | null;
}

export interface RegularizeDashboardLicense {
  id: string;
  type_license: string;
  protocol: string;
  due_date: Date | null;
}

export interface RegularizeDashboardResult {
  year: number;
  metrics: {
    openProcesses: number;
    activeLicenses: number;
    activeClientPfs: number;
    activeSites: number;
    municipalTaxesCompleted: number;
    municipalTaxesPending: number;
    municipalTaxesTotal: number;
  };
  recentProcesses: RegularizeDashboardProcess[];
  trackedLicenses: RegularizeDashboardLicense[];
}

const CLOSED_PROCESS_STATUSES = [
  "Concluído",
  "Concluido",
  "Cancelado",
  "Encerrado",
] as const;

export class RegularizeDashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboard(
    organizationId: string,
    year: number,
  ): Promise<RegularizeDashboardResult> {
    const [
      openProcesses,
      recentProcessRows,
      activeLicenses,
      trackedLicenses,
      activeClientPfs,
      activeSites,
      municipalTaxesTotal,
      municipalTaxesCompleted,
    ] = await this.prisma.$transaction([
      this.prisma.process.count({
        where: {
          organization_id: organizationId,
          status: { notIn: [...CLOSED_PROCESS_STATUSES] },
        },
      }),
      this.prisma.process.findMany({
        where: { organization_id: organizationId },
        select: {
          id: true,
          process_type: true,
          cpf_cnpj: true,
          status: true,
          clientPF: {
            select: { name: true, cpf: true, organization_id: true },
          },
          clientPJ: {
            select: { name: true, cpf_cnpj: true, organization_id: true },
          },
        },
        orderBy: { entry_date: "desc" },
        take: 6,
      }),
      this.prisma.license.count({
        where: { organization_id: organizationId, status: "Ativo" },
      }),
      this.prisma.license.findMany({
        where: { organization_id: organizationId, status: "Ativo" },
        select: {
          id: true,
          type_license: true,
          protocol: true,
          due_date: true,
        },
        orderBy: { entry_date: "desc" },
        take: 6,
      }),
      this.prisma.clientPF.count({
        where: { organization_id: organizationId, status: "Ativo" },
      }),
      this.prisma.sitePasswordsRegularize.count({
        where: { organization_id: organizationId, status: true },
      }),
      this.prisma.client.count({
        where: { organization_id: organizationId, status: "Ativo" },
      }),
      this.prisma.client.count({
        where: {
          organization_id: organizationId,
          status: "Ativo",
          municipalTaxes: {
            some: { organization_id: organizationId, year },
          },
        },
      }),
    ]);

    return {
      year,
      metrics: {
        openProcesses,
        activeLicenses,
        activeClientPfs,
        activeSites,
        municipalTaxesCompleted,
        municipalTaxesPending: Math.max(
          municipalTaxesTotal - municipalTaxesCompleted,
          0,
        ),
        municipalTaxesTotal,
      },
      recentProcesses: recentProcessRows.map(({ clientPF, clientPJ, ...process }) => ({
        ...process,
        clientPF:
          clientPF?.organization_id === organizationId
            ? { name: clientPF.name, cpf: clientPF.cpf }
            : null,
        clientPJ:
          clientPJ?.organization_id === organizationId
            ? { name: clientPJ.name, cpf_cnpj: clientPJ.cpf_cnpj }
            : null,
      })),
      trackedLicenses,
    };
  }
}
```

- [ ] **Step 4: Run service tests and typecheck**

Run:

```bash
pnpm --filter @workspace/regularize-service test -- src/services/regularizeDashboardService.test.ts
pnpm --filter @workspace/regularize-service typecheck
```

Expected: the new test file passes and TypeScript reports no errors.

- [ ] **Step 5: Commit the service**

```bash
git add services/regularize-service/src/services/regularizeDashboardService.ts services/regularize-service/src/services/regularizeDashboardService.test.ts
git commit -m "feat(regularize): aggregate dashboard data"
```

---

### Task 2: Expose the authenticated route and add request correlation

**Files:**

- Create: `services/regularize-service/src/schemas/dashboard.schemas.ts`
- Create: `services/regularize-service/src/routes/dashboard.routes.ts`
- Create: `services/regularize-service/src/test/dashboard.routes.test.ts`
- Modify: `services/regularize-service/src/routes/index.ts`
- Modify: `services/regularize-service/src/app.ts`
- Modify: `services/regularize-service/src/test/app.test.ts`
- Modify: `services/regularize-service/src/openapi/spec.ts`

**Interfaces:**

- Consumes: `RegularizeDashboardService.getDashboard`.
- Produces: authenticated `GET /regularize/dashboard?year=<integer>`.
- Produces: `regularizeServiceErrorLogContext(request)` with `requestId`, method, route, user, organization, and permission.

- [ ] **Step 1: Write failing route and context tests**

Create `dashboard.routes.test.ts`:

```ts
import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { createTestApp, gatewayHeaders } from "./regularizeTestUtils.js";

function createDashboardPrisma(): PrismaClient {
  return {
    process: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([]),
    },
    license: {
      count: vi.fn().mockResolvedValue(2),
      findMany: vi.fn().mockResolvedValue([]),
    },
    clientPF: { count: vi.fn().mockResolvedValue(3) },
    sitePasswordsRegularize: { count: vi.fn().mockResolvedValue(4) },
    client: {
      count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  } as unknown as PrismaClient;
}

describe("regularize dashboard route", () => {
  it("requires authentication", async () => {
    const response = await request(createTestApp()).get("/regularize/dashboard?year=2026");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it("validates the required integer year", async () => {
    const response = await request(createTestApp())
      .get("/regularize/dashboard?year=invalid")
      .set(gatewayHeaders());

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("BAD_REQUEST");
  });

  it("returns the aggregate success envelope", async () => {
    const response = await request(createTestApp(createDashboardPrisma()))
      .get("/regularize/dashboard?year=2026")
      .set(gatewayHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        year: 2026,
        metrics: {
          openProcesses: 1,
          activeLicenses: 2,
          activeClientPfs: 3,
          activeSites: 4,
          municipalTaxesCompleted: 2,
          municipalTaxesPending: 3,
          municipalTaxesTotal: 5,
        },
      },
    });
  });

  it("returns a safe requestId when aggregation fails", async () => {
    const prisma = createDashboardPrisma();
    vi.mocked(prisma.process.count).mockRejectedValueOnce(new Error("private database detail"));

    const response = await request(createTestApp(prisma))
      .get("/regularize/dashboard?year=2026")
      .set({ ...gatewayHeaders(), "x-request-id": "request-dashboard-1" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: "Erro interno no regularize-service.",
      code: "INTERNAL_ERROR",
      requestId: "request-dashboard-1",
    });
    expect(JSON.stringify(response.body)).not.toContain("private database detail");
  });
});
```

Add to `app.test.ts`:

```ts
import type { Request } from "express";

import { regularizeServiceErrorLogContext } from "../app.js";

it("builds correlated regularize error context", () => {
  const context = regularizeServiceErrorLogContext({
    requestId: "request-dashboard-1",
    method: "GET",
    originalUrl: "/regularize/dashboard?year=2026",
    user_id: "user-1",
    organization_id: "organization-1",
    permission: 10,
  } as Request);

  expect(context).toEqual({
    requestId: "request-dashboard-1",
    method: "GET",
    route: "/regularize/dashboard?year=2026",
    userId: "user-1",
    organizationId: "organization-1",
    permission: 10,
  });
});
```

- [ ] **Step 2: Run route tests and verify the red state**

Run:

```bash
pnpm --filter @workspace/regularize-service test -- src/test/dashboard.routes.test.ts src/test/app.test.ts
```

Expected: FAIL because the route and exported context do not exist.

- [ ] **Step 3: Add schema, route, mount, logging context, and OpenAPI**

Create `dashboard.schemas.ts`:

```ts
import { z } from "zod";

export const regularizeDashboardQuerySchema = z
  .object({
    year: z.coerce.number().int(),
  })
  .strict();
```

Create `dashboard.routes.ts`:

```ts
import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import { Router, type NextFunction, type Request, type Response } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { regularizeDashboardQuerySchema } from "../schemas/dashboard.schemas.js";
import { RegularizeDashboardService } from "../services/regularizeDashboardService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createDashboardRoutes({ prisma }: RegularizeRouteDeps): Router {
  const router = Router();
  const dashboardService = new RegularizeDashboardService(prisma);

  router.get(
    "/dashboard",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(regularizeDashboardQuerySchema, request.query);
        const dashboard = await dashboardService.getDashboard(
          request.organization_id,
          query.year,
        );
        response.json(createSuccessResponse(dashboard));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
```

Mount it first inside `createRegularizeRoutes`:

```ts
import { createDashboardRoutes } from "./dashboard.routes.js";

router.use(createDashboardRoutes(deps));
```

Export and extend the context in `app.ts`:

```ts
export function regularizeServiceErrorLogContext(
  request: Request,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    method: request.method,
    route: request.originalUrl,
  };

  if (request.requestId) out.requestId = request.requestId;
  if (request.user_id) out.userId = request.user_id;
  if (request.organization_id) out.organizationId = request.organization_id;
  if (typeof request.permission === "number") out.permission = request.permission;

  return out;
}
```

Add this path to `buildRegularizeServiceOpenApiSpec`:

```ts
"/regularize/dashboard": {
  get: {
    tags: ["Dashboard"],
    summary: "Obter resumo do dashboard do Regularize",
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: "year",
        in: "query",
        required: true,
        schema: { type: "integer" },
      },
    ],
    responses: {
      "200": { description: "Resumo do dashboard", ...successEnvelopeContent() },
    },
  },
},
```

Also add `{ name: "Dashboard", description: "Resumo do modulo Regularize" }` to the tag list.

- [ ] **Step 4: Run service, gateway contract, typecheck, and formatting checks**

Run:

```bash
pnpm --filter @workspace/regularize-service test
pnpm --filter @workspace/regularize-service typecheck
pnpm --filter @workspace/regularize-service check
pnpm --filter @workspace/gateway test -- src/app.routes.test.ts
```

Expected: all Regularize tests pass; gateway OpenAPI aggregation still passes; typecheck and Biome
report no errors.

- [ ] **Step 5: Commit the route and observability**

```bash
git add services/regularize-service/src/schemas/dashboard.schemas.ts services/regularize-service/src/routes/dashboard.routes.ts services/regularize-service/src/routes/index.ts services/regularize-service/src/app.ts services/regularize-service/src/test/dashboard.routes.test.ts services/regularize-service/src/test/app.test.ts services/regularize-service/src/openapi/spec.ts
git commit -m "feat(regularize): expose dashboard summary"
```

---

### Task 3: Add the frontend dashboard data contract and invalidation

**Files:**

- Modify: `app/src/modules/regularize/types.ts`
- Modify: `app/src/modules/regularize/services/regularizeService.contract.ts`
- Modify: `app/src/modules/regularize/services/regularizeService.ts`
- Create: `app/src/modules/regularize/hooks/useRegularizeDashboard.ts`
- Modify: `app/src/modules/regularize/hooks/queryKeys.ts`
- Modify: `app/src/modules/regularize/hooks/useRegularizeCredentials.ts`
- Modify: `app/src/modules/regularize/hooks/useRegularizePeople.ts`
- Modify: `app/src/modules/regularize/hooks/useRegularizeOperations.ts`
- Modify: `app/src/modules/regularize/run-regularize-tests.mjs`

**Interfaces:**

- Consumes: `GET /regularize/dashboard?year=<integer>`.
- Produces: `regularizeService.getDashboard(year): Promise<RegularizeDashboard>`.
- Produces: `useRegularizeDashboard(year, options): UseQueryResult<RegularizeDashboard, Error>`.
- Produces: `regularizeQueryKeys.dashboardRoot()` and `regularizeQueryKeys.dashboard(year)`.

- [ ] **Step 1: Add failing frontend contract assertions**

Add tests to `run-regularize-tests.mjs`:

```js
await runTest("regularize dashboard has a centralized aggregate data contract", async () => {
  const contractSource = await readModuleSource("services/regularizeService.contract.ts");
  const serviceSource = await readModuleSource("services/regularizeService.ts");
  const hookSource = await readModuleSource("hooks/useRegularizeDashboard.ts");
  const queryKeysSource = await readModuleSource("hooks/queryKeys.ts");

  assert.match(contractSource, /dashboard: "\/regularize\/dashboard"/);
  assert.match(contractSource, /buildRegularizeDashboardParams/);
  assert.match(serviceSource, /async getDashboard\(year: number\)/);
  assert.match(serviceSource, /REGULARIZE_ENDPOINTS\.dashboard/);
  assert.match(hookSource, /useRegularizeDashboard/);
  assert.match(hookSource, /regularizeQueryKeys\.dashboard\(year\)/);
  assert.match(queryKeysSource, /dashboardRoot/);
  assert.match(queryKeysSource, /dashboard: \(year: number\)/);
});

await runTest("regularize mutations invalidate aggregate dashboard data", async () => {
  for (const hookPath of [
    "hooks/useRegularizeCredentials.ts",
    "hooks/useRegularizePeople.ts",
    "hooks/useRegularizeOperations.ts",
  ]) {
    const source = await readModuleSource(hookPath);
    assert.match(source, /regularizeQueryKeys\.dashboardRoot\(\)/);
  }
});
```

- [ ] **Step 2: Run the contract test and verify the red state**

Run:

```bash
pnpm --filter @workspace/app test:regularize
```

Expected: FAIL reading `useRegularizeDashboard.ts` or matching the missing endpoint.

- [ ] **Step 3: Add types, endpoint, service method, query key, and hook**

Add to `types.ts`:

```ts
export interface RegularizeDashboard {
  year: number;
  metrics: {
    openProcesses: number;
    activeLicenses: number;
    activeClientPfs: number;
    activeSites: number;
    municipalTaxesCompleted: number;
    municipalTaxesPending: number;
    municipalTaxesTotal: number;
  };
  recentProcesses: RegularizeProcessListItem[];
  trackedLicenses: Array<
    Pick<RegularizeLicenseListItem, "id" | "type_license" | "protocol" | "due_date">
  >;
}
```

Add to `regularizeService.contract.ts`:

```ts
dashboard: "/regularize/dashboard",
```

```ts
export function buildRegularizeDashboardParams(year: number) {
  return { year };
}
```

Import `RegularizeDashboard` and the params builder in `regularizeService.ts`, then add:

```ts
async getDashboard(year: number): Promise<RegularizeDashboard> {
  const api = setupAPIClient();
  const response = await api.get(REGULARIZE_ENDPOINTS.dashboard, {
    params: buildRegularizeDashboardParams(year),
  });

  return unwrapRegularizeEnvelope<RegularizeDashboard>(response.data);
},
```

Add keys to `queryKeys.ts`:

```ts
dashboardRoot: () => [...regularizeQueryKeys.root, "dashboard"] as const,
dashboard: (year: number) => [...regularizeQueryKeys.dashboardRoot(), year] as const,
```

Create `useRegularizeDashboard.ts`:

```ts
import type { UseQueryResult } from "@tanstack/react-query";

import { useFetch } from "@shared/hooks";

import { regularizeService } from "../services/regularizeService";
import type { RegularizeDashboard } from "../types";
import { regularizeQueryKeys } from "./queryKeys";

export function useRegularizeDashboard(
  year: number,
  options?: { enabled?: boolean },
): UseQueryResult<RegularizeDashboard, Error> {
  return useFetch(
    regularizeQueryKeys.dashboard(year),
    () => regularizeService.getDashboard(year),
    { enabled: Boolean(year) && (options?.enabled ?? true) },
  );
}
```

- [ ] **Step 4: Invalidate the dashboard after Regularize mutations**

Keep the existing operations helper and make it await both roots:

```ts
async function invalidateRegularizeOperations(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: regularizeQueryKeys.operations() }),
    queryClient.invalidateQueries({ queryKey: regularizeQueryKeys.dashboardRoot() }),
  ]);
}
```

Create equivalent helpers in the other two hook files:

```ts
async function invalidateRegularizeCredentials(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: regularizeQueryKeys.credentials() }),
    queryClient.invalidateQueries({ queryKey: regularizeQueryKeys.dashboardRoot() }),
  ]);
}

async function invalidateRegularizePeople(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: regularizeQueryKeys.people() }),
    queryClient.invalidateQueries({ queryKey: regularizeQueryKeys.dashboardRoot() }),
  ]);
}
```

Replace every inline credentials/people `onSuccess` invalidation with
`onSuccess: () => invalidateRegularizeCredentials(queryClient)` or
`onSuccess: () => invalidateRegularizePeople(queryClient)`, respectively.

- [ ] **Step 5: Run frontend tests and typecheck**

Run:

```bash
pnpm --filter @workspace/app test:regularize
pnpm --filter @workspace/app typecheck
```

Expected: all Regularize contract tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit the frontend data layer**

```bash
git add app/src/modules/regularize/types.ts app/src/modules/regularize/services/regularizeService.contract.ts app/src/modules/regularize/services/regularizeService.ts app/src/modules/regularize/hooks/useRegularizeDashboard.ts app/src/modules/regularize/hooks/queryKeys.ts app/src/modules/regularize/hooks/useRegularizeCredentials.ts app/src/modules/regularize/hooks/useRegularizePeople.ts app/src/modules/regularize/hooks/useRegularizeOperations.ts app/src/modules/regularize/run-regularize-tests.mjs
git commit -m "feat(regularize): consume dashboard summary"
```

---

### Task 4: Lazy-load tab queries and render one contextual dashboard state

**Files:**

- Create: `app/src/modules/regularize/utils/regularizeQueryPolicy.ts`
- Create: `app/src/modules/regularize/utils/regularizeApiError.ts`
- Modify: `app/src/modules/regularize/components/RegularizePage.tsx`
- Modify: `app/src/modules/regularize/run-regularize-tests.mjs`

**Interfaces:**

- Produces: `getRegularizeQueryPolicy(activeTab): RegularizeQueryPolicy`.
- Produces: `getRegularizeRequestId(error): string | undefined`.
- Consumes: `useRegularizeDashboard(year)` and the dashboard response contract from Task 3.

- [ ] **Step 1: Write failing policy and page regressions**

Add to `run-regularize-tests.mjs`:

```js
await runTest("regularize dashboard enables only its aggregate query", async () => {
  const { getRegularizeQueryPolicy } = await import(
    "./utils/regularizeQueryPolicy.ts"
  );

  assert.deepEqual(getRegularizeQueryPolicy("dashboard"), {
    dashboard: true,
    clientPfs: false,
    sitePasswords: false,
    municipalTaxes: false,
    processes: false,
    licenses: false,
    partners: false,
    passwords: false,
    guidance: false,
  });
});

await runTest("regularize tab query policy enables only owning contexts", async () => {
  const { getRegularizeQueryPolicy } = await import(
    "./utils/regularizeQueryPolicy.ts"
  );

  assert.deepEqual(getRegularizeQueryPolicy("passwords"), {
    dashboard: false,
    clientPfs: false,
    sitePasswords: true,
    municipalTaxes: false,
    processes: false,
    licenses: false,
    partners: false,
    passwords: true,
    guidance: false,
  });
  assert.equal(getRegularizeQueryPolicy("processes").clientPfs, true);
  assert.equal(getRegularizeQueryPolicy("processes").guidance, true);
  assert.equal(getRegularizeQueryPolicy("partners").partners, true);
  assert.equal(getRegularizeQueryPolicy("taxes").municipalTaxes, true);
});

await runTest("regularize safely extracts requestId for contextual errors", async () => {
  const { getRegularizeRequestId } = await import("./utils/regularizeApiError.ts");

  assert.equal(
    getRegularizeRequestId({ response: { data: { requestId: "request-dashboard-1" } } }),
    "request-dashboard-1",
  );
  assert.equal(getRegularizeRequestId(new Error("network")), undefined);
  assert.equal(getRegularizeRequestId({ response: { data: { requestId: 10 } } }), undefined);
});

await runTest("regularize page renders aggregate dashboard and lazy list options", async () => {
  const pageSource = await readModuleSource("components/RegularizePage.tsx");

  assert.match(
    pageSource,
    /useRegularizeDashboard\(currentYear, \{ enabled: queryPolicy\.dashboard \}\)/,
  );
  assert.match(pageSource, /getRegularizeQueryPolicy\(activeTab\)/);
  assert.match(pageSource, /enabled: queryPolicy\.clientPfs/);
  assert.match(pageSource, /enabled: queryPolicy\.sitePasswords/);
  assert.match(pageSource, /enabled: queryPolicy\.municipalTaxes/);
  assert.match(pageSource, /enabled: queryPolicy\.processes/);
  assert.match(pageSource, /enabled: queryPolicy\.licenses/);
  assert.match(pageSource, /dashboardQuery\.data\.metrics/);
  assert.match(pageSource, /getRegularizeRequestId\(dashboardQuery\.error\)/);
  assert.doesNotMatch(pageSource, /const metricData = useMemo/);
});
```

- [ ] **Step 2: Run the frontend contract test and verify the red state**

Run:

```bash
pnpm --filter @workspace/app test:regularize
```

Expected: FAIL because the policy and error utility modules do not exist.

- [ ] **Step 3: Implement the pure query policy**

Create `regularizeQueryPolicy.ts`:

```ts
export type RegularizeTabId =
  | "dashboard"
  | "processes"
  | "licenses"
  | "pf"
  | "partners"
  | "passwords"
  | "sites"
  | "taxes";

export interface RegularizeQueryPolicy {
  dashboard: boolean;
  clientPfs: boolean;
  sitePasswords: boolean;
  municipalTaxes: boolean;
  processes: boolean;
  licenses: boolean;
  partners: boolean;
  passwords: boolean;
  guidance: boolean;
}

export function getRegularizeQueryPolicy(
  activeTab: RegularizeTabId,
): RegularizeQueryPolicy {
  return {
    dashboard: activeTab === "dashboard",
    clientPfs:
      activeTab === "pf" ||
      activeTab === "partners" ||
      activeTab === "processes",
    sitePasswords: activeTab === "sites" || activeTab === "passwords",
    municipalTaxes: activeTab === "taxes",
    processes: activeTab === "processes",
    licenses: activeTab === "licenses",
    partners: activeTab === "partners",
    passwords: activeTab === "passwords",
    guidance: activeTab === "processes",
  };
}
```

Move the `RegularizeTabId` ownership from `RegularizePage.tsx` to this utility and import it back
into the page.

- [ ] **Step 4: Implement safe request ID extraction**

Create `regularizeApiError.ts`:

```ts
export function getRegularizeRequestId(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("response" in error)) {
    return undefined;
  }

  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;

  if (data === null || typeof data !== "object" || !("requestId" in data)) {
    return undefined;
  }

  const requestId = (data as { requestId?: unknown }).requestId;
  return typeof requestId === "string" && requestId.length > 0 ? requestId : undefined;
}
```

- [ ] **Step 5: Wire the policy and dashboard hook into `RegularizePage`**

Import the new hook and utilities:

```ts
import { useRegularizeDashboard } from "../hooks/useRegularizeDashboard";
import { getRegularizeRequestId } from "../utils/regularizeApiError";
import {
  getRegularizeQueryPolicy,
  type RegularizeTabId,
} from "../utils/regularizeQueryPolicy";
```

Replace eager query setup with:

```ts
const queryPolicy = getRegularizeQueryPolicy(activeTab);
const dashboardQuery = useRegularizeDashboard(currentYear, {
  enabled: queryPolicy.dashboard,
});
const pfQuery = useRegularizeClientPfs(
  { status: "Ativo" },
  { enabled: queryPolicy.clientPfs },
);
const siteQuery = useRegularizeSitePasswords(
  { status: true },
  { enabled: queryPolicy.sitePasswords },
);
const taxQuery = useRegularizeMunicipalTaxes(
  { year: currentYear },
  { enabled: queryPolicy.municipalTaxes },
);
const processQuery = useRegularizeProcesses(
  { status: "Todos" },
  { enabled: queryPolicy.processes },
);
const licenseQuery = useRegularizeLicenses(
  { status: "Ativo" },
  { enabled: queryPolicy.licenses },
);
```

Pass policy flags into the dependent queries:

```ts
const partnerQuery = useRegularizePartners(
  currentClientPfId ? { type: "pf", client_id: currentClientPfId } : undefined,
  { enabled: queryPolicy.partners },
);
const credentialQuery = useRegularizePasswords(
  currentCredentialClientId ? { client_id: currentCredentialClientId } : undefined,
  { enabled: queryPolicy.passwords },
);
const guidanceQuery = useRegularizeGuidance(
  currentProcessId ? { process_id: currentProcessId } : undefined,
  { enabled: queryPolicy.guidance },
);
```

Use `dashboardQuery.data.metrics`, `recentProcesses`, and `trackedLicenses` in the dashboard. Remove
the `metricData` memo and do not fall back to zero before a successful response.

Before the dashboard success layout, render these exclusive states:

```tsx
{activeTab === "dashboard" && dashboardQuery.isLoading ? (
  <div className="flex min-h-48 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
    <Loader2 className="h-4 w-4 animate-spin" />
    Carregando resumo do Regularize...
  </div>
) : null}

{activeTab === "dashboard" && dashboardQuery.isError ? (
  <div className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
      Não foi possível carregar o resumo do Regularize.
    </p>
    <p className="mt-1 text-sm text-red-600 dark:text-red-300/80">
      Tente novamente. Se o problema continuar, informe o código da solicitação ao suporte.
    </p>
    {getRegularizeRequestId(dashboardQuery.error) ? (
      <p className="mt-2 font-mono text-xs text-red-700 dark:text-red-200">
        Solicitação: {getRegularizeRequestId(dashboardQuery.error)}
      </p>
    ) : null}
    <button
      type="button"
      onClick={() => void dashboardQuery.refetch()}
      className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
    >
      <RefreshCw className="h-4 w-4" />
      Tentar novamente
    </button>
  </div>
) : null}
```

Render the success dashboard only when `dashboardQuery.data` exists.

- [ ] **Step 6: Restrict refresh to enabled queries**

Replace the unconditional refresh array with:

```ts
function handleRefreshRegularize() {
  const activeQueries = [
    [queryPolicy.dashboard, dashboardQuery],
    [queryPolicy.clientPfs, pfQuery],
    [queryPolicy.sitePasswords, siteQuery],
    [queryPolicy.municipalTaxes, taxQuery],
    [queryPolicy.processes, processQuery],
    [queryPolicy.licenses, licenseQuery],
    [queryPolicy.partners, partnerQuery],
    [queryPolicy.passwords, credentialQuery],
    [queryPolicy.guidance, guidanceQuery],
  ] as const;

  void Promise.all(
    activeQueries
      .filter(([enabled]) => enabled)
      .map(([, query]) => query.refetch()),
  );
}
```

- [ ] **Step 7: Run frontend regressions and typecheck**

Run:

```bash
pnpm --filter @workspace/app test:regularize
pnpm --filter @workspace/app typecheck
```

Expected: policy, request ID, source-contract, existing Regularize tests, and TypeScript all pass.

- [ ] **Step 8: Commit the lazy dashboard UI**

```bash
git add app/src/modules/regularize/utils/regularizeQueryPolicy.ts app/src/modules/regularize/utils/regularizeApiError.ts app/src/modules/regularize/components/RegularizePage.tsx app/src/modules/regularize/run-regularize-tests.mjs
git commit -m "fix(regularize): lazy-load dashboard dependencies"
```

---

### Task 5: Deduplicate simultaneous server-error toasts

**Files:**

- Create: `app/src/shared/services/serverErrorToast.ts`
- Modify: `app/src/shared/services/api.ts`
- Modify: `app/src/modules/regularize/run-regularize-tests.mjs`

**Interfaces:**

- Produces: `notifyServerError(adapter): void`.
- Consumes: React Toastify's `toast.isActive` and `toast.error`.
- Keeps the existing user-facing server error message unchanged.

- [ ] **Step 1: Write the failing behavioral test**

Add to `run-regularize-tests.mjs`:

```js
await runTest("simultaneous server errors produce one active toast", async () => {
  const {
    SERVER_ERROR_TOAST_ID,
    notifyServerError,
  } = await import("../../shared/services/serverErrorToast.ts");
  let active = false;
  const calls = [];
  const adapter = {
    isActive(id) {
      assert.equal(id, SERVER_ERROR_TOAST_ID);
      return active;
    },
    error(message, options) {
      calls.push({ message, options });
      active = true;
    },
  };

  notifyServerError(adapter);
  notifyServerError(adapter);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.toastId, SERVER_ERROR_TOAST_ID);

  active = false;
  notifyServerError(adapter);
  assert.equal(calls.length, 2);
});

await runTest("API client delegates 5xx feedback to the deduplicated notifier", async () => {
  const apiSource = await readFile(join(appRoot, "src/shared/services/api.ts"), "utf8");

  assert.match(apiSource, /notifyServerError\(toast\)/);
  assert.doesNotMatch(apiSource, /toast\.error\(SERVER_ERROR_TOAST_MESSAGE\)/);
});
```

- [ ] **Step 2: Run the contract test and verify the red state**

Run:

```bash
pnpm --filter @workspace/app test:regularize
```

Expected: FAIL because `serverErrorToast.ts` does not exist.

- [ ] **Step 3: Implement the pure notifier and use it from the API client**

Create `serverErrorToast.ts`:

```ts
export const SERVER_ERROR_TOAST_ID = "server-error";
export const SERVER_ERROR_TOAST_MESSAGE =
  "Não foi possível concluir a operação. Tente de novo daqui a pouco.";

export interface ServerErrorToastAdapter {
  isActive(id: string): boolean;
  error(message: string, options: { toastId: string }): unknown;
}

export function notifyServerError(adapter: ServerErrorToastAdapter): void {
  if (adapter.isActive(SERVER_ERROR_TOAST_ID)) {
    return;
  }

  adapter.error(SERVER_ERROR_TOAST_MESSAGE, {
    toastId: SERVER_ERROR_TOAST_ID,
  });
}
```

In `api.ts`, remove the local message constant, import `notifyServerError`, and replace the
callback body:

```ts
import { notifyServerError } from "./serverErrorToast";

onServerError: () => {
  notifyServerError(toast);
},
```

- [ ] **Step 4: Run frontend regressions and typecheck**

Run:

```bash
pnpm --filter @workspace/app test:regularize
pnpm --filter @workspace/app typecheck
```

Expected: the toast behavior test, all existing Regularize tests, and TypeScript pass.

- [ ] **Step 5: Commit toast deduplication**

```bash
git add app/src/shared/services/serverErrorToast.ts app/src/shared/services/api.ts app/src/modules/regularize/run-regularize-tests.mjs
git commit -m "fix(app): deduplicate server error toasts"
```

---

### Task 6: Perform final verification and review

**Files:**

- Review all files changed since `origin/develop`.
- Update the plan checkboxes as tasks complete.

**Interfaces:**

- Consumes: all deliverables from Tasks 1–5.
- Produces: a verified branch ready for code review and later publication.

- [ ] **Step 1: Run all scoped automated checks from a clean command invocation**

```bash
pnpm --filter @workspace/regularize-service test
pnpm --filter @workspace/regularize-service typecheck
pnpm --filter @workspace/regularize-service check
pnpm --filter @workspace/app test:regularize
pnpm --filter @workspace/app typecheck
pnpm --filter @workspace/gateway test -- src/app.routes.test.ts
pnpm smoke:coverage
```

Expected: every command exits `0`; Regularize service retains at least the 53 baseline tests plus
the new dashboard tests; the frontend runner reports every contract as `PASS`.

- [ ] **Step 2: Inspect fan-out and secret boundaries**

Run:

```bash
rg -n "useRegularize(ClientPfs|SitePasswords|MunicipalTaxes|Processes|Licenses|Partners|Passwords|Guidance)" app/src/modules/regularize/components/RegularizePage.tsx
rg -n "password|login|notes" services/regularize-service/src/services/regularizeDashboardService.ts
git diff origin/develop...HEAD --stat
git diff origin/develop...HEAD
```

Expected:

- every list hook receives an `enabled` policy;
- the dashboard service contains no credential selections;
- no unrelated files changed;
- the diff matches the approved specification.

- [ ] **Step 3: Attempt scoped Graphify refresh and record the known fallback**

```bash
pnpm graphify:update:ui
pnpm graphify:update:services
```

Expected in this worktree: both commands may report that no local graph exists. This is an accepted
fallback; do not create or commit `graphify-out/`.

- [ ] **Step 4: Request code review**

Invoke `superpowers:requesting-code-review` against `origin/develop...HEAD`. Resolve any proven
correctness, security, contract, or test gap before declaring the branch complete.

- [ ] **Step 5: Verify the worktree is intentional**

```bash
git status --short --branch
git log --oneline origin/develop..HEAD
```

Expected: only deliberate plan checkbox/document updates may remain uncommitted; implementation
commits are present in task order.

- [ ] **Step 6: Commit completed plan tracking if it changed**

```bash
git add -f docs/superpowers/plans/2026-07-24-regularize-dashboard-errors.md
git commit -m "docs: complete regularize dashboard plan"
```

Expected: the branch is ready for the separate finishing/publish workflow; do not push or open a
PR until explicitly proceeding to that phase.
