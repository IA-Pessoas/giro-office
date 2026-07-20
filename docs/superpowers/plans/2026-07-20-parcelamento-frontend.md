# Parcelamento Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a pagina mockada de `/parcelamento` por um modulo frontend real em `@modules/parcelamento`, consumindo o contrato publico `/parcelamento/*` via gateway.

**Architecture:** `app/src/pages/parcelamento/index.tsx` vira um adaptador fino para `ParcelamentoShell`. A branch ponte `feature/parcelamento-frontend` recebe PRs menores: uma branch de foundation para contrato, shell, seletor de cliente e dashboard real simples; depois uma branch por grupo funcional de endpoints.

**Tech Stack:** Next.js pages router, React 18, TypeScript, Tailwind utility classes, `lucide-react`, `@tanstack/react-query`, `useFetch`, `api` de `@shared/services/apiClient`, `useModuleAccess`, `useClients`, scripts Node com `assert`.

## Global Constraints

- Responder e documentar em portugues neste workspace.
- Escopo frontend-only: nao alterar backend, gateway, Prisma, OpenAPI ou contratos HTTP.
- Branch ponte: `feature/parcelamento-frontend`.
- PRs das branches filhas devem mirar `feature/parcelamento-frontend`, nao `develop`.
- A ponte so mira `develop` depois de integrar e validar todas as filhas.
- Nao adicionar dependencias novas de UI, formulario ou data fetching.
- Nao reintroduzir Certidoes, Debitos ou Lembretes como abas principais sem contrato real.
- Nao implementar delete, porque o backend atual nao expoe remocao para estes dominios.
- Usar `useModuleAccess("parcelamento")`.
- Usar `useClients` para seletor/filtro de cliente.
- Services sao o unico ponto do modulo com `api.get`, `api.post` e `api.patch`.
- A pagina `/parcelamento` nao pode importar `shared/components/newLayout/Parcelamento`.
- Nao stagear `app/next-env.d.ts` se ele aparecer como alteracao local preexistente.

---

## Source Spec

Spec aprovada: `docs/superpowers/specs/2026-07-20-parcelamento-frontend-design.md`

Contrato backend consultado:

- `services/parcelamento-service/src/openapi/spec.ts`
- `services/parcelamento-service/src/schemas/installment.schemas.ts`
- `services/parcelamento-service/src/schemas/installmentCompetency.schemas.ts`
- `services/parcelamento-service/src/schemas/panorama.schemas.ts`

Antes de editar `app/**`, cada branch deve tentar:

```bash
pnpm graphify:context:ui -- "parcelamento frontend <nome-da-branch>"
```

Se Graphify estiver indisponivel ou sem grafo local, registrar a limitacao no resumo da branch e usar descoberta manual com `rg --files` e `rg -n`.

---

## Branch Order

```text
feature/parcelamento-frontend
  -> feat/parcelamento-front-foundation
  -> feat/parcelamento-front-installments
  -> feat/parcelamento-front-competencies
  -> feat/parcelamento-front-panoramas
  -> feat/parcelamento-front-polish
```

Fluxo por branch filha:

```bash
git switch feature/parcelamento-frontend
git status --short
git switch -c feat/parcelamento-front-<escopo>
```

Ao terminar a branch filha, abrir PR para `feature/parcelamento-frontend`. Depois de mergear a filha na ponte, atualizar a ponte antes de criar a proxima filha.

---

## File Structure Map

### Foundation Branch

Create:

- `app/src/modules/parcelamento/index.ts`
- `app/src/modules/parcelamento/types/index.ts`
- `app/src/modules/parcelamento/services/index.ts`
- `app/src/modules/parcelamento/services/parcelamentoService.contract.ts`
- `app/src/modules/parcelamento/services/parcelamentoService.ts`
- `app/src/modules/parcelamento/hooks/index.ts`
- `app/src/modules/parcelamento/hooks/queryKeys.ts`
- `app/src/modules/parcelamento/hooks/useParcelamentoInstallments.ts`
- `app/src/modules/parcelamento/hooks/useParcelamentoPanoramas.ts`
- `app/src/modules/parcelamento/components/ParcelamentoShell.tsx`
- `app/src/modules/parcelamento/components/ParcelamentoDashboard.tsx`
- `app/src/modules/parcelamento/components/ParcelamentoClientSelector.tsx`
- `app/src/modules/parcelamento/components/ParcelamentoStateBox.tsx`
- `app/src/modules/parcelamento/components/parcelamentoFormControls.ts`
- `app/src/modules/parcelamento/utils/parcelamentoError.ts`
- `app/src/modules/parcelamento/run-parcelamento-tests.mjs`

Modify:

- `app/src/pages/parcelamento/index.tsx`
- `app/package.json`

### Functional Branches

Add as the endpoint groups become real:

- `app/src/modules/parcelamento/hooks/useParcelamentoCompetencies.ts`
- `app/src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx`
- `app/src/modules/parcelamento/components/ParcelamentoInstallmentForm.tsx`
- `app/src/modules/parcelamento/components/ParcelamentoCompetenciesSection.tsx`
- `app/src/modules/parcelamento/components/ParcelamentoCompetencyForm.tsx`
- `app/src/modules/parcelamento/components/ParcelamentoPanoramasSection.tsx`
- `app/src/modules/parcelamento/components/ParcelamentoPanoramaForm.tsx`

No shared component should be created until two parcelamento sections really need the same behavior and the duplication is clear.

---

## Shared Interfaces

All tasks depend on these names once Task 1 lands.

```ts
export type ParcelamentoTabId = "dashboard" | "installments" | "competencies" | "panoramas";

export interface ParcelamentoTab {
  id: ParcelamentoTabId;
  label: string;
}

export interface ParcelamentoClientOption {
  id: string;
  name: string;
  document?: string | null;
}

export interface ParcelamentoSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ParcelamentoPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface ParcelamentoListPage<T> extends ParcelamentoPage<T> {
  data: T[];
  pageSize: number;
  hasMore: boolean;
}
```

---

## Task 1: Foundation Contract And Guardrail Tests

**Branch:** `feat/parcelamento-front-foundation`

**Files:**

- Create: `app/src/modules/parcelamento/types/index.ts`
- Create: `app/src/modules/parcelamento/services/parcelamentoService.contract.ts`
- Create: `app/src/modules/parcelamento/hooks/queryKeys.ts`
- Create: `app/src/modules/parcelamento/run-parcelamento-tests.mjs`
- Modify: `app/package.json`

**Interfaces:**

- Produces: `PARCELAMENTO_ENDPOINTS`, `PARCELAMENTO_TABS`, `unwrapParcelamentoEnvelope`, `unwrapParcelamentoPage`, `buildParcelamentoListParams`, `buildParcelamentoPatchPayload`, `PARCELAMENTO_QUERY_KEY`, `parcelamentoQueryKey`.
- Consumed by: every service, hook, component and guardrail in later tasks.

- [ ] **Step 1: Run UI context discovery**

Run:

```bash
pnpm graphify:context:ui -- "parcelamento frontend foundation contract"
```

Expected: a short context package. If it fails because Graphify is unavailable, continue with `rg` and mention the fallback in the branch summary.

- [ ] **Step 2: Write the failing contract test**

Create `app/src/modules/parcelamento/run-parcelamento-tests.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  PARCELAMENTO_DEFAULT_PAGE,
  PARCELAMENTO_DEFAULT_PAGE_SIZE,
  PARCELAMENTO_ENDPOINTS,
  PARCELAMENTO_MAX_PAGE_SIZE,
  PARCELAMENTO_TABS,
  buildParcelamentoListParams,
  buildParcelamentoPatchPayload,
  unwrapParcelamentoEnvelope,
  unwrapParcelamentoPage,
} from "./services/parcelamentoService.contract.ts";
import { PARCELAMENTO_QUERY_KEY, parcelamentoQueryKey } from "./hooks/queryKeys.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function readWorkspaceFile(filePath) {
  return readFileSync(path.join(process.cwd(), filePath), "utf8");
}

function listSourceFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory).flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

runTest("parcelamento endpoints match the gateway public contract", () => {
  assert.equal(PARCELAMENTO_ENDPOINTS.installments, "/parcelamento/installments");
  assert.equal(
    PARCELAMENTO_ENDPOINTS.installmentDetail("installment-1"),
    "/parcelamento/installments/installment-1",
  );
  assert.equal(
    PARCELAMENTO_ENDPOINTS.installmentCompetencies("installment-1"),
    "/parcelamento/installments/installment-1/competencies",
  );
  assert.equal(
    PARCELAMENTO_ENDPOINTS.installmentCompetencyDetail("competency-1"),
    "/parcelamento/installment-competencies/competency-1",
  );
  assert.equal(PARCELAMENTO_ENDPOINTS.panoramas, "/parcelamento/panoramas");
  assert.equal(
    PARCELAMENTO_ENDPOINTS.panoramaDetail("panorama-1"),
    "/parcelamento/panoramas/panorama-1",
  );
  assert.equal(
    PARCELAMENTO_ENDPOINTS.panoramaGenerate("2026-07"),
    "/parcelamento/panoramas/competences/2026-07/generate",
  );
});

runTest("parcelamento pagination defaults stay aligned with backend", () => {
  assert.equal(PARCELAMENTO_DEFAULT_PAGE, 1);
  assert.equal(PARCELAMENTO_DEFAULT_PAGE_SIZE, 50);
  assert.equal(PARCELAMENTO_MAX_PAGE_SIZE, 100);
});

runTest("parcelamento tabs stay stable", () => {
  assert.deepEqual(
    PARCELAMENTO_TABS.map((tab) => tab.id),
    ["dashboard", "installments", "competencies", "panoramas"],
  );
});

runTest("unwrap helpers extract success envelopes and normalize pages", () => {
  const rawItem = { id: "item-1" };

  assert.deepEqual(unwrapParcelamentoEnvelope({ success: true, data: rawItem }), rawItem);
  assert.deepEqual(unwrapParcelamentoEnvelope(rawItem), rawItem);

  assert.deepEqual(
    unwrapParcelamentoPage({
      success: true,
      data: {
        items: [rawItem],
        total: 1,
        page: 2,
        page_size: 10,
        has_more: false,
      },
    }),
    {
      items: [rawItem],
      data: [rawItem],
      total: 1,
      page: 2,
      page_size: 10,
      pageSize: 10,
      has_more: false,
      hasMore: false,
    },
  );
});

runTest("list params keep backend names and remove empty filters", () => {
  assert.deepEqual(
    buildParcelamentoListParams({
      client_id: "client-1",
      status: "",
      search: " pgfn ",
      page: 0,
      page_size: 150,
    }),
    {
      client_id: "client-1",
      search: "pgfn",
      page: 1,
      page_size: 100,
    },
  );
});

runTest("patch payload removes empty values and rejects empty patch", () => {
  assert.deepEqual(
    buildParcelamentoPatchPayload({
      status: "Ativo",
      document_url: "",
      completion_date: null,
    }),
    {
      status: "Ativo",
      completion_date: null,
    },
  );

  assert.throws(() => buildParcelamentoPatchPayload({ document_url: "" }), /ao menos um campo/i);
});

runTest("parcelamento query keys include domain and optional params", () => {
  assert.deepEqual(PARCELAMENTO_QUERY_KEY, ["parcelamento"]);
  assert.deepEqual(parcelamentoQueryKey("installments"), ["parcelamento", "installments"]);
  assert.deepEqual(
    parcelamentoQueryKey("installments", { page: 1, client_id: "client-1" }),
    ["parcelamento", "installments", { page: 1, client_id: "client-1" }],
  );
});

runTest("parcelamento package script is wired into app tests", () => {
  const packageJson = JSON.parse(readWorkspaceFile("package.json"));

  assert.equal(
    packageJson.scripts["test:parcelamento"],
    "node --experimental-strip-types src/modules/parcelamento/run-parcelamento-tests.mjs",
  );
  assert.match(packageJson.scripts.test, /pnpm run test:parcelamento/);
});

runTest("parcelamento page uses the new module", () => {
  const page = readWorkspaceFile("src/pages/parcelamento/index.tsx");

  assert.match(page, /@modules\/parcelamento/);
  assert.doesNotMatch(page, /shared\/components\/newLayout\/Parcelamento/);
});

runTest("parcelamento shell gates access and stays free of primary mock arrays", () => {
  const shell = readWorkspaceFile("src/modules/parcelamento/components/ParcelamentoShell.tsx");

  assert.match(shell, /useModuleAccess\("parcelamento"\)/);
  assert.doesNotMatch(shell, /const\s+(certificates|debts|installments|reminders)\s*=\s*\[/);
});

runTest("parcelamento api calls stay inside the domain service", () => {
  const moduleFiles = listSourceFiles(path.join(process.cwd(), "src/modules/parcelamento"));
  const apiCallPattern = /api\.(get|post|patch|put|delete)\(/;

  for (const filePath of moduleFiles) {
    const normalizedPath = filePath.replaceAll("\\", "/");
    const source = readFileSync(filePath, "utf8");

    if (normalizedPath.endsWith("/services/parcelamentoService.ts")) {
      continue;
    }

    assert.doesNotMatch(source, apiCallPattern, `${normalizedPath} should not call api directly`);
  }
});

console.log("parcelamento frontend tests passed");
```

- [ ] **Step 3: Add the app script before implementing the contract**

Modify `app/package.json`:

```json
"test:parcelamento": "node --experimental-strip-types src/modules/parcelamento/run-parcelamento-tests.mjs"
```

Add `&& pnpm run test:parcelamento` to the aggregate `test` script after `pnpm run test:regularize`.

- [ ] **Step 4: Run the failing test**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
```

Expected: fail because contract, query key, page and shell files do not exist yet.

- [ ] **Step 5: Add shared types**

Create `app/src/modules/parcelamento/types/index.ts`:

```ts
export type ParcelamentoTabId = "dashboard" | "installments" | "competencies" | "panoramas";

export interface ParcelamentoTab {
  id: ParcelamentoTabId;
  label: string;
}

export interface ParcelamentoClientOption {
  id: string;
  name: string;
  document?: string | null;
}

export interface ParcelamentoSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface ParcelamentoPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface ParcelamentoListPage<T> extends ParcelamentoPage<T> {
  data: T[];
  pageSize: number;
  hasMore: boolean;
}

export interface ParcelamentoListFilters {
  page?: number;
  page_size?: number;
  client_id?: string;
  status?: string;
  type?: string;
  jurisdiction?: string;
  search?: string;
  competence?: string;
  responsavel_id?: string;
}

export interface ParcelamentoInstallment {
  id: string;
  client_id: string;
  agreement_number: string | null;
  type: string;
  legal_nature: string;
  jurisdiction: string;
  status: string;
  is_automatic_debit: boolean;
  consolidated_total_amount: number;
  first_installment_amount: number;
  current_month_installment_amount: number;
  agreed_installments_count: number;
  down_payment_installments_count: number;
  paid_installments_count: number;
  overdue_installments_count: number;
  remaining_installments_count: number;
  outstanding_balance: number;
  enrollment_date: string | null;
  document_url: string | null;
  situation_shutdown: string | null;
  completion_date: string | null;
}

export interface ParcelamentoPanorama {
  id: string;
  client_id: string;
  competence: string;
  cnd_municipal: boolean;
  cnd_state: boolean;
  cnd_federal: boolean;
  cnd_fgts: boolean;
  cnd_labor: boolean;
  protests: boolean;
  state_tax_situation: boolean;
  federal_tax_situation: boolean;
  responsavel_id: string | null;
}
```

- [ ] **Step 6: Add contract helpers**

Create `app/src/modules/parcelamento/services/parcelamentoService.contract.ts`:

```ts
import type {
  ParcelamentoListFilters,
  ParcelamentoListPage,
  ParcelamentoPage,
  ParcelamentoSuccessEnvelope,
  ParcelamentoTab,
} from "../types";

export const PARCELAMENTO_DEFAULT_PAGE = 1;
export const PARCELAMENTO_DEFAULT_PAGE_SIZE = 50;
export const PARCELAMENTO_MAX_PAGE_SIZE = 100;

export const PARCELAMENTO_ENDPOINTS = {
  installments: "/parcelamento/installments",
  installmentDetail: (id: string) => `/parcelamento/installments/${id}`,
  installmentCompetencies: (installmentId: string) =>
    `/parcelamento/installments/${installmentId}/competencies`,
  installmentCompetencyDetail: (id: string) => `/parcelamento/installment-competencies/${id}`,
  panoramas: "/parcelamento/panoramas",
  panoramaDetail: (id: string) => `/parcelamento/panoramas/${id}`,
  panoramaGenerate: (competence: string) =>
    `/parcelamento/panoramas/competences/${competence}/generate`,
} as const;

export const PARCELAMENTO_TABS: ParcelamentoTab[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "installments", label: "Parcelamentos" },
  { id: "competencies", label: "Competencias" },
  { id: "panoramas", label: "Panoramas" },
];

export function unwrapParcelamentoEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as ParcelamentoSuccessEnvelope<T>).data;
  }

  return body as T;
}

export function unwrapParcelamentoPage<T>(body: unknown): ParcelamentoListPage<T> {
  const page = unwrapParcelamentoEnvelope<ParcelamentoPage<T>>(body);

  return {
    ...page,
    data: page.items,
    pageSize: page.page_size,
    hasMore: page.has_more,
  };
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizePage(value: unknown) {
  const page = Math.trunc(Number(value ?? PARCELAMENTO_DEFAULT_PAGE));

  return Number.isFinite(page) && page > 0 ? page : PARCELAMENTO_DEFAULT_PAGE;
}

function normalizePageSize(value: unknown) {
  const pageSize = Math.trunc(Number(value ?? PARCELAMENTO_DEFAULT_PAGE_SIZE));
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 ? pageSize : PARCELAMENTO_DEFAULT_PAGE_SIZE;

  return Math.min(PARCELAMENTO_MAX_PAGE_SIZE, safePageSize);
}

export function buildParcelamentoListParams(filters: ParcelamentoListFilters = {}) {
  const params: Record<string, string | number> = {
    page: normalizePage(filters.page),
    page_size: normalizePageSize(filters.page_size),
  };

  for (const key of ["client_id", "status", "type", "jurisdiction", "search", "competence", "responsavel_id"] as const) {
    const value = normalizeText(filters[key]);

    if (typeof value === "string" && value.length > 0) {
      params[key] = value;
    }
  }

  return params;
}

export function buildParcelamentoPatchPayload<T extends Record<string, unknown>>(payload: T) {
  const nextPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      return !(typeof value === "string" && value.trim().length === 0) && value !== undefined;
    }),
  ) as Partial<T>;

  if (Object.keys(nextPayload).length === 0) {
    throw new Error("Informe ao menos um campo para atualizar.");
  }

  return nextPayload;
}
```

- [ ] **Step 7: Add query keys**

Create `app/src/modules/parcelamento/hooks/queryKeys.ts`:

```ts
export const PARCELAMENTO_QUERY_KEY = ["parcelamento"] as const;

export function parcelamentoQueryKey(
  ...parts: Array<string | number | boolean | null | undefined | Record<string, unknown>>
) {
  return [...PARCELAMENTO_QUERY_KEY, ...parts.filter((part) => part !== null && part !== undefined)];
}
```

- [ ] **Step 8: Run the focused test**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
```

Expected: still fail on page and shell guardrails. That confirms the contract part is present and the UI replacement is still pending.

- [ ] **Step 9: Commit the contract slice**

Run:

```bash
git status --short
git add app/package.json app/src/modules/parcelamento
git commit -m "feat: add parcelamento frontend contract"
```

Expected: only `app/package.json` and `app/src/modules/parcelamento/**` are staged. Do not include `app/next-env.d.ts`.

---

## Task 2: Foundation Shell, Client Selector, Dashboard And Page Swap

**Branch:** `feat/parcelamento-front-foundation`

**Files:**

- Create: `app/src/modules/parcelamento/services/index.ts`
- Create: `app/src/modules/parcelamento/services/parcelamentoService.ts`
- Create: `app/src/modules/parcelamento/hooks/index.ts`
- Create: `app/src/modules/parcelamento/hooks/useParcelamentoInstallments.ts`
- Create: `app/src/modules/parcelamento/hooks/useParcelamentoPanoramas.ts`
- Create: `app/src/modules/parcelamento/components/ParcelamentoShell.tsx`
- Create: `app/src/modules/parcelamento/components/ParcelamentoDashboard.tsx`
- Create: `app/src/modules/parcelamento/components/ParcelamentoClientSelector.tsx`
- Create: `app/src/modules/parcelamento/components/ParcelamentoStateBox.tsx`
- Create: `app/src/modules/parcelamento/components/parcelamentoFormControls.ts`
- Create: `app/src/modules/parcelamento/utils/parcelamentoError.ts`
- Create: `app/src/modules/parcelamento/index.ts`
- Modify: `app/src/pages/parcelamento/index.tsx`

**Interfaces:**

- Consumes: Task 1 contract helpers and query keys.
- Produces: read-only `listInstallments`, `listPanoramas`, dashboard KPIs, active tab shell, client selector based on `useClients`.
- Later tasks replace read-only sections with CRUD sections without changing route ownership.

- [ ] **Step 1: Run the existing failing guardrails**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
```

Expected: fail on `/parcelamento` still importing legacy UI and missing shell.

- [ ] **Step 2: Add error helper and form classes**

Create `app/src/modules/parcelamento/utils/parcelamentoError.ts`:

```ts
export function getParcelamentoErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Nao foi possivel carregar os dados de parcelamento.";
}
```

Create `app/src/modules/parcelamento/components/parcelamentoFormControls.ts`:

```ts
export const parcelamentoTextFieldClassName =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white";

export const parcelamentoButtonClassName =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
```

- [ ] **Step 3: Add read services**

Create `app/src/modules/parcelamento/services/parcelamentoService.ts`:

```ts
import { api } from "@shared/services/apiClient";

import type {
  ParcelamentoInstallment,
  ParcelamentoListFilters,
  ParcelamentoPanorama,
} from "../types";
import {
  PARCELAMENTO_ENDPOINTS,
  buildParcelamentoListParams,
  unwrapParcelamentoEnvelope,
  unwrapParcelamentoPage,
} from "./parcelamentoService.contract";

export const parcelamentoService = {
  async listInstallments(filters: ParcelamentoListFilters = {}) {
    const response = await api.get(PARCELAMENTO_ENDPOINTS.installments, {
      params: buildParcelamentoListParams(filters),
    });

    return unwrapParcelamentoPage<ParcelamentoInstallment>(response.data);
  },

  async detailInstallment(id: string) {
    const response = await api.get(PARCELAMENTO_ENDPOINTS.installmentDetail(id));

    return unwrapParcelamentoEnvelope<ParcelamentoInstallment>(response.data);
  },

  async listPanoramas(filters: ParcelamentoListFilters = {}) {
    const response = await api.get(PARCELAMENTO_ENDPOINTS.panoramas, {
      params: buildParcelamentoListParams(filters),
    });

    return unwrapParcelamentoPage<ParcelamentoPanorama>(response.data);
  },

  async detailPanorama(id: string) {
    const response = await api.get(PARCELAMENTO_ENDPOINTS.panoramaDetail(id));

    return unwrapParcelamentoEnvelope<ParcelamentoPanorama>(response.data);
  },
};
```

Create `app/src/modules/parcelamento/services/index.ts`:

```ts
export * from "./parcelamentoService";
export * from "./parcelamentoService.contract";
```

- [ ] **Step 4: Add read hooks**

Create `app/src/modules/parcelamento/hooks/useParcelamentoInstallments.ts`:

```ts
import { useFetch } from "@shared/hooks";

import { parcelamentoService } from "../services";
import type { ParcelamentoListFilters } from "../types";
import { parcelamentoQueryKey } from "./queryKeys";

export function parcelamentoInstallmentsQueryKey(filters: ParcelamentoListFilters) {
  return parcelamentoQueryKey("installments", filters);
}

export function useParcelamentoInstallments(
  filters: ParcelamentoListFilters,
  enabled = true,
) {
  return useFetch(
    parcelamentoInstallmentsQueryKey(filters),
    () => parcelamentoService.listInstallments(filters),
    {
      enabled,
      placeholderData: (previousData) => previousData,
    },
  );
}
```

Create `app/src/modules/parcelamento/hooks/useParcelamentoPanoramas.ts`:

```ts
import { useFetch } from "@shared/hooks";

import { parcelamentoService } from "../services";
import type { ParcelamentoListFilters } from "../types";
import { parcelamentoQueryKey } from "./queryKeys";

export function parcelamentoPanoramasQueryKey(filters: ParcelamentoListFilters) {
  return parcelamentoQueryKey("panoramas", filters);
}

export function useParcelamentoPanoramas(filters: ParcelamentoListFilters, enabled = true) {
  return useFetch(
    parcelamentoPanoramasQueryKey(filters),
    () => parcelamentoService.listPanoramas(filters),
    {
      enabled,
      placeholderData: (previousData) => previousData,
    },
  );
}
```

Create `app/src/modules/parcelamento/hooks/index.ts`:

```ts
export * from "./queryKeys";
export * from "./useParcelamentoInstallments";
export * from "./useParcelamentoPanoramas";
```

- [ ] **Step 5: Add state box and client selector**

Create `ParcelamentoStateBox.tsx` with this public API:

```tsx
import type { LucideIcon } from "lucide-react";

interface ParcelamentoStateBoxProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "info" | "warning" | "error";
}
```

The component renders one bordered section with the icon, title and description. Use it for loading, empty, error and access denied states.

Create `ParcelamentoClientSelector.tsx` by adapting the existing `PessoalClientSelector` behavior to Parcelamento:

```tsx
interface ParcelamentoClientSelectorProps {
  selectedClient: ParcelamentoClientOption | null;
  onSelectClient: (client: ParcelamentoClientOption | null) => void;
}
```

Required behavior:

- call `useClients({ status: "Ativo", search: deferredSearch, page, limit: 50 })`;
- map clients to `{ id, name: client.company_name || client.name, document: client.cpf_cnpj }`;
- allow clearing selection with "Sem cliente selecionado";
- search by name, company name or CPF/CNPJ through the existing `search` filter;
- paginate with previous and next buttons;
- close the dialog after selection.

- [ ] **Step 6: Add dashboard with real derived metrics**

Create `ParcelamentoDashboard.tsx` with this public API:

```tsx
import type {
  ParcelamentoInstallment,
  ParcelamentoListPage,
  ParcelamentoPanorama,
  ParcelamentoTabId,
} from "../types";

interface ParcelamentoDashboardProps {
  installmentsPage?: ParcelamentoListPage<ParcelamentoInstallment>;
  panoramasPage?: ParcelamentoListPage<ParcelamentoPanorama>;
  isLoading: boolean;
  isError: boolean;
  onSelectTab: (tab: ParcelamentoTabId) => void;
}
```

KPIs allowed in this component:

- total de parcelamentos: `installmentsPage?.total ?? 0`;
- ativos: `installmentsPage.items.filter((item) => item.status === "Ativo").length`;
- em atraso: `installmentsPage.items.filter((item) => item.overdue_installments_count > 0).length`;
- panoramas no filtro atual: `panoramasPage?.total ?? 0`;
- progresso medio: derive only from `paid_installments_count` and `agreed_installments_count` when `agreed_installments_count > 0`.

The component must not create sample arrays. Empty and error states use `ParcelamentoStateBox`.

- [ ] **Step 7: Add shell**

Create `ParcelamentoShell.tsx`.

Required behavior:

- call `const { access, isLoading } = useModuleAccess("parcelamento")`;
- keep `activeTab` as `ParcelamentoTabId`;
- keep `selectedClient` as `ParcelamentoClientOption | null`;
- build list filters with `client_id: selectedClient?.id`, `page: 1`, `page_size: 50`;
- run domain queries only when `access.canView` is true;
- render `ParcelamentoDashboard` for `dashboard`;
- render a read-only section for `installments` in the foundation branch;
- render `ParcelamentoStateBox` for `competencies` until a parcelamento is selected in the later branch;
- render a read-only panorama list for `panoramas` in the foundation branch;
- pass `access.canEdit` to future sections instead of checking permissions inside services.

The shell structure follows the recent modules:

```tsx
return (
  <div className="mx-auto max-w-[1600px] space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      {/* title, subtitle and ParcelamentoClientSelector */}
    </header>
    <nav role="tablist">{/* PARCELAMENTO_TABS buttons */}</nav>
    {/* active tab content */}
  </div>
);
```

- [ ] **Step 8: Export module and replace page**

Create `app/src/modules/parcelamento/index.ts`:

```ts
export { ParcelamentoShell } from "./components/ParcelamentoShell";
```

Modify `app/src/pages/parcelamento/index.tsx`:

```tsx
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { ParcelamentoShell } from "@modules/parcelamento";

export default function ParcelamentoPage() {
  return (
    <>
      <Head>
        <title>Parcelamento</title>
      </Head>
      <ParcelamentoShell />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
```

- [ ] **Step 9: Validate foundation**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
pnpm --filter @workspace/app typecheck
```

Expected:

- `test:parcelamento` passes.
- `typecheck` passes, or only preexisting unrelated errors are documented. Fix every error caused by `app/src/modules/parcelamento` or `app/src/pages/parcelamento/index.tsx`.

- [ ] **Step 10: Commit and prepare PR**

Run:

```bash
git status --short
git add app/package.json app/src/pages/parcelamento/index.tsx app/src/modules/parcelamento
git commit -m "feat: add parcelamento frontend foundation"
```

Open PR from `feat/parcelamento-front-foundation` to `feature/parcelamento-frontend`.

---

## Task 3: Installments Branch

**Branch:** `feat/parcelamento-front-installments`

**Files:**

- Modify: `app/src/modules/parcelamento/types/index.ts`
- Modify: `app/src/modules/parcelamento/services/parcelamentoService.ts`
- Modify: `app/src/modules/parcelamento/hooks/useParcelamentoInstallments.ts`
- Create: `app/src/modules/parcelamento/components/ParcelamentoInstallmentsSection.tsx`
- Create: `app/src/modules/parcelamento/components/ParcelamentoInstallmentForm.tsx`
- Modify: `app/src/modules/parcelamento/components/ParcelamentoShell.tsx`
- Modify: `app/src/modules/parcelamento/run-parcelamento-tests.mjs`

**Interfaces:**

- Consumes: `parcelamentoService.listInstallments`, `detailInstallment`, query keys and shell tab handling.
- Produces: `createInstallment`, `updateInstallment`, create/update mutations and a usable Parcelamentos tab.

- [ ] **Step 1: Start from updated bridge**

Run:

```bash
git switch feature/parcelamento-frontend
git status --short
git switch -c feat/parcelamento-front-installments
pnpm graphify:context:ui -- "parcelamento frontend installments"
```

If Graphify fails, use manual discovery and mention it in the PR.

- [ ] **Step 2: Extend tests for installment payloads and hooks**

Append tests to `run-parcelamento-tests.mjs`:

```js
import {
  buildCreateInstallmentPayload,
  buildPatchInstallmentPayload,
} from "./services/parcelamentoService.ts";

runTest("installment payload builders keep backend field names", () => {
  assert.deepEqual(
    buildCreateInstallmentPayload({
      client_id: "client-1",
      agreement_number: "",
      type: "PGFN",
      legal_nature: "Federal",
      jurisdiction: "Federal",
      is_automatic_debit: false,
      first_installment_amount: 100,
      current_month_installment_amount: 120,
      agreed_installments_count: 10,
      enrollment_date: "",
    }),
    {
      client_id: "client-1",
      agreement_number: null,
      type: "PGFN",
      legal_nature: "Federal",
      jurisdiction: "Federal",
      is_automatic_debit: false,
      first_installment_amount: 100,
      current_month_installment_amount: 120,
      agreed_installments_count: 10,
      enrollment_date: null,
    },
  );

  assert.deepEqual(buildPatchInstallmentPayload({ status: "Ativo", document_url: "" }), {
    status: "Ativo",
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
```

Expected: fail because the installment payload builders do not exist.

- [ ] **Step 4: Add installment payload types**

Extend `types/index.ts`:

```ts
export interface CreateParcelamentoInstallmentPayload {
  client_id: string;
  agreement_number?: string | null;
  type: string;
  legal_nature: string;
  jurisdiction: string;
  is_automatic_debit: boolean;
  first_installment_amount: number;
  current_month_installment_amount: number;
  agreed_installments_count: number;
  enrollment_date?: string | null;
}

export interface PatchParcelamentoInstallmentPayload {
  agreement_number?: string | null;
  type?: string;
  legal_nature?: string;
  jurisdiction?: string;
  is_automatic_debit?: boolean;
  consolidated_total_amount?: number;
  first_installment_amount?: number;
  current_month_installment_amount?: number;
  agreed_installments_count?: number;
  enrollment_date?: string | null;
  document_url?: string;
  situation_shutdown?: string | null;
  status?: string;
  completion_date?: string | null;
}
```

- [ ] **Step 5: Add service write methods**

Extend `parcelamentoService.ts`:

```ts
import type {
  CreateParcelamentoInstallmentPayload,
  PatchParcelamentoInstallmentPayload,
} from "../types";
import { buildParcelamentoPatchPayload } from "./parcelamentoService.contract";

function normalizeNullableText(value: string | null | undefined) {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value === null || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

export function buildCreateInstallmentPayload(payload: CreateParcelamentoInstallmentPayload) {
  return {
    ...payload,
    agreement_number: normalizeNullableText(payload.agreement_number) ?? null,
    enrollment_date: normalizeNullableText(payload.enrollment_date) ?? null,
  };
}

export function buildPatchInstallmentPayload(payload: PatchParcelamentoInstallmentPayload) {
  return buildParcelamentoPatchPayload({
    ...payload,
    agreement_number: normalizeNullableText(payload.agreement_number),
    enrollment_date: normalizeNullableText(payload.enrollment_date),
    situation_shutdown: normalizeNullableText(payload.situation_shutdown),
    completion_date: normalizeNullableText(payload.completion_date),
  });
}
```

Add to `parcelamentoService`:

```ts
async createInstallment(payload: CreateParcelamentoInstallmentPayload) {
  const response = await api.post(
    PARCELAMENTO_ENDPOINTS.installments,
    buildCreateInstallmentPayload(payload),
  );

  return unwrapParcelamentoEnvelope<ParcelamentoInstallment>(response.data);
},

async updateInstallment(id: string, payload: PatchParcelamentoInstallmentPayload) {
  const response = await api.patch(
    PARCELAMENTO_ENDPOINTS.installmentDetail(id),
    buildPatchInstallmentPayload(payload),
  );

  return unwrapParcelamentoEnvelope<ParcelamentoInstallment>(response.data);
},
```

- [ ] **Step 6: Add mutations**

Extend `useParcelamentoInstallments.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  CreateParcelamentoInstallmentPayload,
  PatchParcelamentoInstallmentPayload,
} from "../types";

export function useCreateParcelamentoInstallmentMutation(filters: ParcelamentoListFilters) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateParcelamentoInstallmentPayload) =>
      parcelamentoService.createInstallment(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("installments") });
      await queryClient.invalidateQueries({ queryKey: parcelamentoInstallmentsQueryKey(filters) });
    },
  });
}

export function useUpdateParcelamentoInstallmentMutation(
  id: string,
  filters: ParcelamentoListFilters,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PatchParcelamentoInstallmentPayload) =>
      parcelamentoService.updateInstallment(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("installments") });
      await queryClient.invalidateQueries({ queryKey: parcelamentoInstallmentsQueryKey(filters) });
      await queryClient.invalidateQueries({ queryKey: parcelamentoQueryKey("installments", id) });
    },
  });
}
```

- [ ] **Step 7: Add installments UI**

Create `ParcelamentoInstallmentForm.tsx` with native controls for these backend fields:

```text
client_id
agreement_number
type
legal_nature
jurisdiction
is_automatic_debit
first_installment_amount
current_month_installment_amount
agreed_installments_count
enrollment_date
status
document_url
situation_shutdown
completion_date
```

Rules:

- create mode requires `selectedClient`; use selected client id as `client_id`;
- edit mode sends only changed fields through `buildPatchInstallmentPayload`;
- `PATCH` with no changed fields shows "Altere ao menos um campo para salvar.";
- number inputs convert empty string to `0` only for required create fields;
- date inputs send `null` when empty;
- submit buttons are disabled when `!canEdit` or mutation is pending.

Create `ParcelamentoInstallmentsSection.tsx`:

- receives `selectedClient`, `canEdit`, and list filters;
- renders loading, error, empty and success states;
- provides filters for `search`, `status`, `type`, `jurisdiction`;
- paginates with `page` and `page_size`;
- shows create/edit form in the same section or a local dialog;
- never calls `api` directly.

- [ ] **Step 8: Mount the tab**

Modify `ParcelamentoShell.tsx` so `activeTab === "installments"` renders `ParcelamentoInstallmentsSection`.

Pass:

```tsx
selectedClient={selectedClient}
canEdit={access.canEdit}
```

- [ ] **Step 9: Validate and commit**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
pnpm --filter @workspace/app typecheck
git status --short
git add app/src/modules/parcelamento
git commit -m "feat: add parcelamento installments frontend"
```

Open PR from `feat/parcelamento-front-installments` to `feature/parcelamento-frontend`.

---

## Task 4: Competencies Branch

**Branch:** `feat/parcelamento-front-competencies`

**Files:**

- Modify: `app/src/modules/parcelamento/types/index.ts`
- Modify: `app/src/modules/parcelamento/services/parcelamentoService.ts`
- Create: `app/src/modules/parcelamento/hooks/useParcelamentoCompetencies.ts`
- Modify: `app/src/modules/parcelamento/hooks/index.ts`
- Create: `app/src/modules/parcelamento/components/ParcelamentoCompetenciesSection.tsx`
- Create: `app/src/modules/parcelamento/components/ParcelamentoCompetencyForm.tsx`
- Modify: `app/src/modules/parcelamento/components/ParcelamentoShell.tsx`
- Modify: `app/src/modules/parcelamento/run-parcelamento-tests.mjs`

**Interfaces:**

- Consumes: selected installment from the Parcelamentos section or local selector from installment list.
- Produces: `listInstallmentCompetencies`, `createInstallmentCompetency`, `updateInstallmentCompetency`, query invalidation for installment aggregates.

- [ ] **Step 1: Start from updated bridge**

Run:

```bash
git switch feature/parcelamento-frontend
git status --short
git switch -c feat/parcelamento-front-competencies
pnpm graphify:context:ui -- "parcelamento frontend competencies"
```

- [ ] **Step 2: Extend tests for competency payloads**

Append:

```js
import {
  buildCreateInstallmentCompetencyPayload,
  buildPatchInstallmentCompetencyPayload,
} from "./services/parcelamentoService.ts";

runTest("competency payload builders keep backend field names", () => {
  assert.deepEqual(
    buildCreateInstallmentCompetencyPayload({
      competence: "2026-07",
      how_many_paid: 1,
      how_many_overdue: 0,
      download: true,
      download_notes: "",
      upload_file: null,
      is_sent: false,
      submission_type: "",
      notes: "",
      installment_amount: 250,
    }),
    {
      competence: "2026-07",
      how_many_paid: 1,
      how_many_overdue: 0,
      download: true,
      download_notes: null,
      upload_file: null,
      is_sent: false,
      submission_type: null,
      notes: null,
      installment_amount: 250,
    },
  );

  assert.deepEqual(buildPatchInstallmentCompetencyPayload({ how_many_paid: 2, notes: "" }), {
    how_many_paid: 2,
    notes: null,
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
```

Expected: fail because competency payload builders do not exist.

- [ ] **Step 4: Add competency types**

Extend `types/index.ts`:

```ts
export interface ParcelamentoInstallmentCompetency {
  id: string;
  installment_id: string;
  competence: string;
  how_many_paid: number;
  how_many_overdue: number;
  download: boolean;
  download_notes: string | null;
  upload_file: boolean | null;
  is_sent: boolean | null;
  submission_type: string | null;
  notes: string | null;
  installment_amount: number;
}

export interface CreateParcelamentoInstallmentCompetencyPayload {
  competence: string;
  how_many_paid: number;
  how_many_overdue: number;
  download: boolean;
  download_notes?: string | null;
  upload_file?: boolean | null;
  is_sent?: boolean | null;
  submission_type?: string | null;
  notes?: string | null;
  installment_amount: number;
}

export type PatchParcelamentoInstallmentCompetencyPayload = Partial<
  Omit<CreateParcelamentoInstallmentCompetencyPayload, "competence">
>;
```

- [ ] **Step 5: Add service methods**

Extend `parcelamentoService.ts`:

```ts
function normalizeNullableString(value: string | null | undefined) {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value === null || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

export function buildCreateInstallmentCompetencyPayload(
  payload: CreateParcelamentoInstallmentCompetencyPayload,
) {
  return {
    ...payload,
    download_notes: normalizeNullableString(payload.download_notes) ?? null,
    submission_type: normalizeNullableString(payload.submission_type) ?? null,
    notes: normalizeNullableString(payload.notes) ?? null,
  };
}

export function buildPatchInstallmentCompetencyPayload(
  payload: PatchParcelamentoInstallmentCompetencyPayload,
) {
  return buildParcelamentoPatchPayload({
    ...payload,
    download_notes: normalizeNullableString(payload.download_notes),
    submission_type: normalizeNullableString(payload.submission_type),
    notes: normalizeNullableString(payload.notes),
  });
}
```

Add to `parcelamentoService`:

```ts
async listInstallmentCompetencies(installmentId: string, filters: ParcelamentoListFilters = {}) {
  const response = await api.get(PARCELAMENTO_ENDPOINTS.installmentCompetencies(installmentId), {
    params: buildParcelamentoListParams(filters),
  });

  return unwrapParcelamentoPage<ParcelamentoInstallmentCompetency>(response.data);
},

async createInstallmentCompetency(
  installmentId: string,
  payload: CreateParcelamentoInstallmentCompetencyPayload,
) {
  const response = await api.post(
    PARCELAMENTO_ENDPOINTS.installmentCompetencies(installmentId),
    buildCreateInstallmentCompetencyPayload(payload),
  );

  return unwrapParcelamentoEnvelope<ParcelamentoInstallmentCompetency>(response.data);
},

async updateInstallmentCompetency(
  id: string,
  payload: PatchParcelamentoInstallmentCompetencyPayload,
) {
  const response = await api.patch(
    PARCELAMENTO_ENDPOINTS.installmentCompetencyDetail(id),
    buildPatchInstallmentCompetencyPayload(payload),
  );

  return unwrapParcelamentoEnvelope<ParcelamentoInstallmentCompetency>(response.data);
},
```

- [ ] **Step 6: Add competency hooks**

Create `useParcelamentoCompetencies.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useFetch } from "@shared/hooks";

import { parcelamentoService } from "../services";
import type {
  CreateParcelamentoInstallmentCompetencyPayload,
  ParcelamentoListFilters,
  PatchParcelamentoInstallmentCompetencyPayload,
} from "../types";
import { parcelamentoQueryKey } from "./queryKeys";

export function parcelamentoCompetenciesQueryKey(
  installmentId: string,
  filters: ParcelamentoListFilters,
) {
  return parcelamentoQueryKey("installments", installmentId, "competencies", filters);
}

export function useParcelamentoCompetencies(
  installmentId: string,
  filters: ParcelamentoListFilters,
  enabled = true,
) {
  return useFetch(
    parcelamentoCompetenciesQueryKey(installmentId, filters),
    () => parcelamentoService.listInstallmentCompetencies(installmentId, filters),
    { enabled: enabled && Boolean(installmentId), placeholderData: (previousData) => previousData },
  );
}
```

Add create/update mutations that invalidate:

```ts
parcelamentoQueryKey("installments")
parcelamentoQueryKey("installments", installmentId, "competencies")
```

Export it from `hooks/index.ts`.

- [ ] **Step 7: Add competencies UI**

Create `ParcelamentoCompetencyForm.tsx` with native fields:

```text
competence
how_many_paid
how_many_overdue
download
download_notes
upload_file
is_sent
submission_type
notes
installment_amount
```

Rules:

- use `<input type="month">` for `competence`;
- create requires selected installment id;
- edit cannot change `competence`, matching backend patch schema;
- `how_many_paid`, `how_many_overdue` and `installment_amount` use non-negative numeric inputs;
- submit disabled when `!canEdit`.

Create `ParcelamentoCompetenciesSection.tsx`:

- includes a compact installment selector fed by the installments hook;
- requires one installment before listing competencies;
- shows page, page size, loading, error, empty and success states;
- invalidates installment lists after create/update because backend recalculates aggregates.

- [ ] **Step 8: Mount the tab**

Modify `ParcelamentoShell.tsx` so `activeTab === "competencies"` renders `ParcelamentoCompetenciesSection`.

Pass:

```tsx
selectedClient={selectedClient}
canEdit={access.canEdit}
```

- [ ] **Step 9: Validate and commit**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
pnpm --filter @workspace/app typecheck
git status --short
git add app/src/modules/parcelamento
git commit -m "feat: add parcelamento competencies frontend"
```

Open PR from `feat/parcelamento-front-competencies` to `feature/parcelamento-frontend`.

---

## Task 5: Panoramas Branch

**Branch:** `feat/parcelamento-front-panoramas`

**Files:**

- Modify: `app/src/modules/parcelamento/types/index.ts`
- Modify: `app/src/modules/parcelamento/services/parcelamentoService.ts`
- Modify: `app/src/modules/parcelamento/hooks/useParcelamentoPanoramas.ts`
- Create: `app/src/modules/parcelamento/components/ParcelamentoPanoramasSection.tsx`
- Create: `app/src/modules/parcelamento/components/ParcelamentoPanoramaForm.tsx`
- Modify: `app/src/modules/parcelamento/components/ParcelamentoShell.tsx`
- Modify: `app/src/modules/parcelamento/run-parcelamento-tests.mjs`

**Interfaces:**

- Consumes: foundation read list and detail methods.
- Produces: create, update and generate panorama flows, with query invalidation.

- [ ] **Step 1: Start from updated bridge**

Run:

```bash
git switch feature/parcelamento-frontend
git status --short
git switch -c feat/parcelamento-front-panoramas
pnpm graphify:context:ui -- "parcelamento frontend panoramas"
```

- [ ] **Step 2: Extend tests for panorama payloads and generation**

Append:

```js
import {
  buildCreatePanoramaPayload,
  buildPatchPanoramaPayload,
} from "./services/parcelamentoService.ts";

runTest("panorama payload builders keep backend field names", () => {
  assert.deepEqual(
    buildCreatePanoramaPayload({
      client_id: "client-1",
      competence: "2026-07",
      cnd_municipal: true,
      cnd_state: false,
      cnd_federal: false,
      cnd_fgts: false,
      cnd_labor: false,
      protests: false,
      state_tax_situation: false,
      federal_tax_situation: false,
      responsavel_id: "",
    }),
    {
      client_id: "client-1",
      competence: "2026-07",
      cnd_municipal: true,
      cnd_state: false,
      cnd_federal: false,
      cnd_fgts: false,
      cnd_labor: false,
      protests: false,
      state_tax_situation: false,
      federal_tax_situation: false,
      responsavel_id: null,
    },
  );

  assert.deepEqual(buildPatchPanoramaPayload({ cnd_fgts: true, responsavel_id: "" }), {
    cnd_fgts: true,
    responsavel_id: null,
  });
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
```

Expected: fail because panorama payload builders are missing.

- [ ] **Step 4: Add panorama payload types**

Extend `types/index.ts`:

```ts
export interface CreateParcelamentoPanoramaPayload {
  client_id: string;
  competence: string;
  cnd_municipal?: boolean;
  cnd_state?: boolean;
  cnd_federal?: boolean;
  cnd_fgts?: boolean;
  cnd_labor?: boolean;
  protests?: boolean;
  state_tax_situation?: boolean;
  federal_tax_situation?: boolean;
  responsavel_id?: string | null;
}

export type PatchParcelamentoPanoramaPayload = Partial<
  Omit<CreateParcelamentoPanoramaPayload, "client_id" | "competence">
>;

export interface ParcelamentoPanoramaGenerateResult {
  created: number;
  existing: number;
  totalActiveClients: number;
}
```

- [ ] **Step 5: Add panorama write service methods**

Extend `parcelamentoService.ts`:

```ts
const panoramaBooleanDefaults = {
  cnd_municipal: false,
  cnd_state: false,
  cnd_federal: false,
  cnd_fgts: false,
  cnd_labor: false,
  protests: false,
  state_tax_situation: false,
  federal_tax_situation: false,
};

export function buildCreatePanoramaPayload(payload: CreateParcelamentoPanoramaPayload) {
  return {
    ...panoramaBooleanDefaults,
    ...payload,
    responsavel_id: normalizeNullableString(payload.responsavel_id) ?? null,
  };
}

export function buildPatchPanoramaPayload(payload: PatchParcelamentoPanoramaPayload) {
  return buildParcelamentoPatchPayload({
    ...payload,
    responsavel_id: normalizeNullableString(payload.responsavel_id),
  });
}
```

Add to `parcelamentoService`:

```ts
async createPanorama(payload: CreateParcelamentoPanoramaPayload) {
  const response = await api.post(PARCELAMENTO_ENDPOINTS.panoramas, buildCreatePanoramaPayload(payload));

  return unwrapParcelamentoEnvelope<ParcelamentoPanorama>(response.data);
},

async updatePanorama(id: string, payload: PatchParcelamentoPanoramaPayload) {
  const response = await api.patch(PARCELAMENTO_ENDPOINTS.panoramaDetail(id), buildPatchPanoramaPayload(payload));

  return unwrapParcelamentoEnvelope<ParcelamentoPanorama>(response.data);
},

async generatePanoramas(competence: string) {
  const response = await api.post(PARCELAMENTO_ENDPOINTS.panoramaGenerate(competence), {});

  return unwrapParcelamentoEnvelope<ParcelamentoPanoramaGenerateResult>(response.data);
},
```

- [ ] **Step 6: Add panorama mutations**

Extend `useParcelamentoPanoramas.ts` with create, update and generate mutations.

Invalidate:

```ts
parcelamentoQueryKey("panoramas")
parcelamentoPanoramasQueryKey(filters)
```

For update, also invalidate:

```ts
parcelamentoQueryKey("panoramas", id)
```

- [ ] **Step 7: Add panoramas UI**

Create `ParcelamentoPanoramaForm.tsx` with:

```text
client_id
competence
cnd_municipal
cnd_state
cnd_federal
cnd_fgts
cnd_labor
protests
state_tax_situation
federal_tax_situation
responsavel_id
```

Rules:

- create mode requires selected client and uses selected client id;
- use `<input type="month">` for `competence`;
- boolean fields use checkboxes;
- edit mode cannot change `client_id` or `competence`;
- empty `responsavel_id` is sent as `null`;
- no card promises a future metric.

Create `ParcelamentoPanoramasSection.tsx`:

- filters by selected client and `competence`;
- lists current page with status checklist fields;
- supports create and edit when `canEdit`;
- provides "Gerar panoramas" button for selected competence when `canEdit`;
- shows generated counters from `created`, `existing`, `totalActiveClients`.

- [ ] **Step 8: Mount final panoramas tab**

Replace the foundation read-only panorama tab in `ParcelamentoShell.tsx` with `ParcelamentoPanoramasSection`.

- [ ] **Step 9: Validate and commit**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
pnpm --filter @workspace/app typecheck
git status --short
git add app/src/modules/parcelamento
git commit -m "feat: add parcelamento panoramas frontend"
```

Open PR from `feat/parcelamento-front-panoramas` to `feature/parcelamento-frontend`.

---

## Task 6: Polish Branch And Bridge Validation

**Branch:** `feat/parcelamento-front-polish`, then final checks on `feature/parcelamento-frontend`

**Files:**

- Review: `app/src/modules/parcelamento/**`
- Review: `app/src/pages/parcelamento/index.tsx`
- Review: `app/package.json`
- Optional remove only if no route imports it: `app/src/shared/components/newLayout/Parcelamento.tsx`

**Interfaces:**

- Consumes: all merged parcelamento frontend branches.
- Produces: final visual, static and typecheck validation before bridge PR to `develop`.

- [ ] **Step 1: Start polish branch from updated bridge**

Run:

```bash
git switch feature/parcelamento-frontend
git status --short
git switch -c feat/parcelamento-front-polish
pnpm graphify:context:ui -- "parcelamento frontend polish validation"
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @workspace/app test:parcelamento
```

Expected: pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm --filter @workspace/app typecheck
```

Expected: pass, or only unrelated preexisting errors documented with file paths. Fix every parcelamento error.

- [ ] **Step 4: Static review for forbidden regressions**

Run:

```bash
rg -n "shared/components/newLayout/Parcelamento|const\s+(certificates|debts|installments|reminders)\s*=\s*\[|api\.(get|post|patch|put|delete)\(" app/src/pages/parcelamento app/src/modules/parcelamento
```

Expected:

- no legacy import;
- no primary mock arrays in `ParcelamentoShell.tsx`;
- `api.*` calls only in `app/src/modules/parcelamento/services/parcelamentoService.ts`.

- [ ] **Step 5: Visual smoke**

Start the app only if needed:

```bash
pnpm --filter @workspace/app dev
```

Manual smoke:

```text
[ ] /parcelamento opens.
[ ] User without parcelamento view access sees access denied and no domain query is triggered.
[ ] Dashboard loads real data states and has no mock cards.
[ ] Client selector searches, paginates, selects and clears clients.
[ ] Parcelamentos filters by selected client and can create/edit when canEdit is true.
[ ] Competencias requires selected installment and can create/edit monthly records.
[ ] Panoramas filters by client and competence, can create/edit and can generate by competence.
[ ] Buttons with unavailable actions are hidden or disabled with real reason.
[ ] Text does not overlap on desktop or mobile viewport.
```

- [ ] **Step 6: Remove only confirmed dead legacy UI**

Check route imports:

```bash
rg -n "newLayout/Parcelamento|<Parcelamento" app/src
```

If the legacy component has no remaining import, remove `app/src/shared/components/newLayout/Parcelamento.tsx`. If another route still imports it, leave it and document the remaining owner.

- [ ] **Step 7: Commit polish**

Run:

```bash
git status --short
git add app/package.json app/src/pages/parcelamento/index.tsx app/src/modules/parcelamento
git commit -m "chore: polish parcelamento frontend"
```

If the legacy component was removed, include it in the same commit.

- [ ] **Step 8: Merge polish PR into bridge and validate bridge**

After PR `feat/parcelamento-front-polish -> feature/parcelamento-frontend` is merged:

```bash
git switch feature/parcelamento-frontend
pnpm --filter @workspace/app test:parcelamento
pnpm --filter @workspace/app typecheck
git status --short
```

Expected: bridge has no uncommitted parcelamento changes and is ready for review/PR to `develop`.

---

## PR Review Checklist

Use this checklist for every child PR:

```text
[ ] PR target is feature/parcelamento-frontend.
[ ] No backend, gateway, Prisma or OpenAPI change is included.
[ ] app/next-env.d.ts is not staged unless the PR intentionally changed it.
[ ] Graphify was used, or manual fallback is documented.
[ ] pnpm --filter @workspace/app test:parcelamento was run.
[ ] pnpm --filter @workspace/app typecheck was run, or unrelated preexisting errors are documented.
[ ] No component calls api.get, api.post or api.patch directly.
[ ] No dashboard or primary tab depends on local mock arrays.
[ ] useModuleAccess("parcelamento") gates the shell.
[ ] useClients powers the client selector.
```

---

## Self-Review Notes

- Spec coverage: branch bridge, child branches, endpoint groups, page replacement, access gate, client selector, dashboard real, tests, validation and frontend-only limits are covered.
- Type consistency: exported names use the `Parcelamento*` prefix, query keys start from `PARCELAMENTO_QUERY_KEY`, and HTTP paths stay in `PARCELAMENTO_ENDPOINTS`.
- Branch sizing: foundation proves the route and real data plumbing; CRUD work stays in smaller endpoint-group branches.
- Test strategy: `test:parcelamento` starts as contract and guardrail coverage, then grows with each branch's payload builders and routing checks.
