# Tecnologia TI Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tela mockada `/tecnologia` por um frontend operacional que consome os
endpoints reais do TI Service em `/ti/*`.

**Architecture:** O trabalho acontece na branch ponte `feature/tecnologia-ti-frontend-platform`.
A fundacao cria o modulo `app/src/modules/ti`, centraliza contratos, query keys, exports e tabs
vazias; depois duas pessoas trabalham em blocos funcionais interligados para reduzir conflitos.
Backend, gateway, Prisma e smoke backend ficam fora do escopo.

**Tech Stack:** Next.js pages router, React, TypeScript, React Query/useFetch, Tailwind,
lucide-react, `api` de `@shared/services/apiClient`, scripts Node de guardrail.

**Spec:** `docs/superpowers/specs/2026-07-06-tecnologia-ti-frontend-design.md`

---

## Decisao Atual

Este plano organiza a execucao em PRs independentes contra a branch ponte. Cada task abaixo e uma
PR com branch propria. A execucao ainda nao comecou neste documento.

O usuario pediu divisao por pessoa agrupando subdominios interligados. Por isso, depois da
fundacao, a divisao fica assim:

- Pessoa 1: atendimento, chamados, mensagens, robos e dashboard operacional.
- Pessoa 2: recursos de TI, inventario, termos, estoque, senhas e ramais.

---

## Contexto E Fallback

Graphify UI esta indisponivel neste workspace porque nao existe grafo local em
`app/graphify-out/graph.json`. O plano usa o fallback manual previsto no `AGENTS.md`: leitura das
regras locais, spec aprovada, arquivos reais e padroes existentes em `regularize` e `certificates`.

A rota e superficie do usuario continuam:

```text
/tecnologia
```

O modulo de permissao continua:

```text
ti
```

Nao criar rota publica `/ti` nesta trilha.

---

## Fluxo De Branches

```text
feature/tecnologia-ti-frontend-platform
  <- feat/tecnologia-ti-foundation
  <- feat/tecnologia-ti-support-requests
  <- feat/tecnologia-ti-robots-dashboard
  <- feat/tecnologia-ti-assets-terms
  <- feat/tecnologia-ti-stock-access
  <- feat/tecnologia-ti-final-hardening
  -> develop
```

Regras:

- `feat/tecnologia-ti-foundation` deve entrar primeiro.
- Pessoas 1 e 2 devem criar suas branches a partir da ponte depois da fundacao integrada.
- Pessoa 1 nao deve editar arquivos de Pessoa 2.
- Pessoa 2 nao deve editar arquivos de Pessoa 1.
- Depois da fundacao, evitar alteracoes em `TiPage.tsx`, `queryKeys.ts`,
  `tiService.contract.ts`, `types/index.ts`, `services/index.ts` e `hooks/index.ts`, exceto se a
  PR declarar explicitamente o motivo.
- PRs devem tocar apenas `app/` e docs desta trilha.
- Se o diff tocar `services/`, `gateway/`, `infra/`, Prisma, OpenAPI ou smoke backend, parar e
  revisar escopo.
- Nao usar `Closes #...` nas PRs menores. Usar `Refs #...` se houver issue. Usar `Closes #...`
  somente na PR final, se houver issue principal.

---

## Validacoes Base

Durante a trilha, usar validacoes escopadas:

```bash
pnpm --filter @workspace/app run test:ti
pnpm --filter @workspace/app run test:status-badge
pnpm --filter @workspace/app run test:react-query-cache
pnpm --filter @workspace/app typecheck
```

No fechamento:

```bash
pnpm --filter @workspace/app test
pnpm --filter @workspace/app typecheck
```

Smoke visual quando houver tela suficiente:

- abrir `/tecnologia` em desktop;
- abrir `/tecnologia` em mobile;
- confirmar que a tela nova usa dados via hooks;
- confirmar que nao ha mocks principais;
- confirmar que erro de uma aba nao derruba as outras;
- confirmar que senha nao aparece em lista.

---

## Gate De Cobertura Tecnologia/TI

Antes de considerar qualquer aba pronta, a pessoa responsavel deve conferir a matriz:

```text
endpoint -> service -> hook/query ou mutation -> botao/fluxo visivel -> permissao -> estado de erro
```

Regras obrigatorias:

- Todo `POST` e `PATCH` do contrato precisa aparecer como botao, dialog, painel ou acao de detalhe,
  salvo decisao registrada no handoff.
- Cadastros auxiliares usados em selects/filtros/forms tambem precisam de botao de gestao quando
  houver endpoint de criacao/edicao. Exemplos: categorias de chamados, categorias/locais de
  inventario e categorias/locais de estoque.
- Botoes de criar, editar, gerenciar categoria/local, registrar entrada/saida, atribuir,
  devolver, assinar, revelar senha e registrar execucao devem seguir o padrao de popup/dialog ou
  painel contextual ja usado no modulo.
- Selects devem usar `TiNativeSelect` para manter seta, padding e foco alinhados.
- Dashboard e Chamados merecem revisao propria porque concentram fluxo operacional: nao aceitar
  resumo/lista sem acoes, permissao e estados completos.
- A revisao final deve procurar especificamente botoes faltantes, popups ausentes, filtros
  apertados, cards desalinhados, selects quebrados e acoes visiveis para usuario sem permissao.

---

## File Ownership

### Fundacao comum

| Arquivo | Responsabilidade |
|---|---|
| `app/src/modules/ti/index.ts` | Exports publicos do modulo |
| `app/src/modules/ti/types/*` | Tipos base e barrels por subdominio |
| `app/src/modules/ti/services/tiService.contract.ts` | `TI_ENDPOINTS`, builders e unwrap |
| `app/src/modules/ti/services/index.ts` | Barrel de services |
| `app/src/modules/ti/hooks/queryKeys.ts` | Query keys raiz e por subdominio |
| `app/src/modules/ti/hooks/index.ts` | Barrel de hooks |
| `app/src/modules/ti/components/TiPage.tsx` | Shell de abas |
| `app/src/modules/ti/components/Ti*Tab.tsx` | Tabs vazias iniciais |
| `app/src/modules/ti/components/tiFormControls.tsx` | Controles compartilhados |
| `app/src/modules/ti/components/tiWorkspaceUi.ts` | Classes/tokens do dominio |
| `app/src/modules/ti/run-ti-tests.mjs` | Guardrails estaticos |
| `app/src/pages/tecnologia/index.tsx` | Rota fina usando `@modules/ti` |
| `app/package.json` | Script `test:ti` |

### Pessoa 1: atendimento e automacao

| Arquivo | Responsabilidade |
|---|---|
| `app/src/modules/ti/types/requests.ts` | Tipos de chamados, categorias e mensagens |
| `app/src/modules/ti/types/robots.ts` | Tipos de robos e execucoes |
| `app/src/modules/ti/types/dashboard.ts` | Tipos do resumo consolidado |
| `app/src/modules/ti/services/tiRequestsService.ts` | HTTP de chamados |
| `app/src/modules/ti/services/tiRobotsService.ts` | HTTP de robos |
| `app/src/modules/ti/services/tiDashboardService.ts` | HTTP do dashboard |
| `app/src/modules/ti/hooks/useTiRequests.ts` | Queries/mutations de chamados |
| `app/src/modules/ti/hooks/useTiRobots.ts` | Queries/mutations de robos |
| `app/src/modules/ti/hooks/useTiDashboard.ts` | Query de dashboard |
| `app/src/modules/ti/components/TiRequestsTab.tsx` | Aba de chamados |
| `app/src/modules/ti/components/TiRobotsTab.tsx` | Aba de robos |
| `app/src/modules/ti/components/TiDashboardTab.tsx` | Aba de dashboard |

### Pessoa 2: recursos e responsabilidade

| Arquivo | Responsabilidade |
|---|---|
| `app/src/modules/ti/types/inventory.ts` | Tipos de inventario, categorias e locais |
| `app/src/modules/ti/types/terms.ts` | Tipos de termos |
| `app/src/modules/ti/types/stock.ts` | Tipos de estoque |
| `app/src/modules/ti/types/passwords.ts` | Tipos de senhas |
| `app/src/modules/ti/types/extensions.ts` | Tipos de ramais |
| `app/src/modules/ti/services/tiInventoryService.ts` | HTTP de inventario |
| `app/src/modules/ti/services/tiTermsService.ts` | HTTP de termos |
| `app/src/modules/ti/services/tiStockService.ts` | HTTP de estoque |
| `app/src/modules/ti/services/tiPasswordsService.ts` | HTTP de senhas |
| `app/src/modules/ti/services/tiExtensionsService.ts` | HTTP de ramais |
| `app/src/modules/ti/hooks/useTiInventory.ts` | Queries/mutations de inventario |
| `app/src/modules/ti/hooks/useTiTerms.ts` | Queries/mutations de termos |
| `app/src/modules/ti/hooks/useTiStock.ts` | Queries/mutations de estoque |
| `app/src/modules/ti/hooks/useTiPasswords.ts` | Queries/mutations de senhas |
| `app/src/modules/ti/hooks/useTiExtensions.ts` | Queries/mutations de ramais |
| `app/src/modules/ti/components/TiInventoryTab.tsx` | Aba de inventario |
| `app/src/modules/ti/components/TiTermsTab.tsx` | Aba de termos |
| `app/src/modules/ti/components/TiStockTab.tsx` | Aba de estoque |
| `app/src/modules/ti/components/TiPasswordsTab.tsx` | Aba de senhas |
| `app/src/modules/ti/components/TiExtensionsTab.tsx` | Aba de ramais |

---

## PR 1: Foundation Comum

**Branch:** `feat/tecnologia-ti-foundation`
**Target:** `feature/tecnologia-ti-frontend-platform`
**Responsavel:** dono da ponte antes de dividir com o colega.
**Escopo:** criar o dominio TI, a rota fina, contracts, query keys, stubs de services/hooks/tabs e
guardrails iniciais.

### Task 1: Baseline Da Branch

**Files:**
- Read: `.codex/config.toml`
- Read: `.codex/rules/default.rules.md`
- Read: `.codex/rules/frontend-ui-patterns.rules.md`
- Read: `docs/superpowers/specs/2026-07-06-tecnologia-ti-frontend-design.md`
- Read: `app/src/pages/tecnologia/index.tsx`
- Read: `app/src/modules/auth/utils/moduleAccess.ts`
- Read: `app/src/shared/components/newLayout/AppShell.tsx`

- [ ] Confirmar branch:

```bash
git status --short --branch
```

Expected:

```text
## feat/tecnologia-ti-foundation
```

- [ ] Tentar contexto Graphify:

```bash
pnpm graphify:context:ui -- "tecnologia ti frontend foundation"
```

Accepted fallback:

```text
Graphify indisponivel ou sem grafo local (ui); vou usar descoberta manual.
```

- [ ] Confirmar que `app/next-env.d.ts`, se aparecer modificado, nao entra no commit desta PR.
- [ ] Confirmar que nenhum arquivo fora de `app/` e `docs/superpowers/` sera alterado.

### Task 2: Criar Tipos Base E Barrels

**Files:**
- Create: `app/src/modules/ti/types/common.ts`
- Create: `app/src/modules/ti/types/dashboard.ts`
- Create: `app/src/modules/ti/types/requests.ts`
- Create: `app/src/modules/ti/types/robots.ts`
- Create: `app/src/modules/ti/types/inventory.ts`
- Create: `app/src/modules/ti/types/terms.ts`
- Create: `app/src/modules/ti/types/stock.ts`
- Create: `app/src/modules/ti/types/passwords.ts`
- Create: `app/src/modules/ti/types/extensions.ts`
- Create: `app/src/modules/ti/types/index.ts`
- Create: `app/src/modules/ti/index.ts`

- [ ] Criar `common.ts` com tipos compartilhados:

```ts
export type TiId = string;
export type TiStatus = string | boolean | null | undefined;

export interface TiListFilters {
  search?: string;
  status?: string;
  category_id?: TiId;
  location_id?: TiId;
  assigned_to_user_id?: TiId;
}

export interface TiMutationMessage {
  message?: string;
}

export interface TiEnvelope<T> {
  success?: boolean;
  data: T;
}
```

- [ ] Criar cada arquivo de subdominio com tipos minimamente largos e seguros, por exemplo:

```ts
import type { TiId } from "./common";

export interface TiInventoryAsset {
  id: TiId;
  name?: string | null;
  status?: string | boolean | null;
  [key: string]: unknown;
}
```

Aplicar o mesmo padrao para `TiRequest`, `TiRobot`, `TiStockItem`, `TiPassword`, `TiExtension`,
`TiTerm` e `TiDashboardSummary`, usando nomes especificos por arquivo.

- [ ] Criar `types/index.ts`:

```ts
export type * from "./common";
export type * from "./dashboard";
export type * from "./requests";
export type * from "./robots";
export type * from "./inventory";
export type * from "./terms";
export type * from "./stock";
export type * from "./passwords";
export type * from "./extensions";
```

- [ ] Criar `app/src/modules/ti/index.ts` exportando types, hooks, services e `TiPage` conforme
  estes forem criados nas proximas tasks.

### Task 3: Criar Contract E Query Keys

**Files:**
- Create: `app/src/modules/ti/services/tiService.contract.ts`
- Create: `app/src/modules/ti/hooks/queryKeys.ts`

- [ ] Criar `TI_ENDPOINTS` com todos os paths da spec:

```ts
export const TI_ENDPOINTS = {
  dashboard: "/ti/dashboard",
  inventoryList: "/ti/inventory/list",
  inventory: "/ti/inventory",
  inventoryDetail: (id: string) => `/ti/inventory/${id}`,
  inventoryAssignUser: (id: string) => `/ti/inventory/${id}/assign-user`,
  inventoryReturn: (id: string) => `/ti/inventory/${id}/return`,
  inventoryCategoriesList: "/ti/inventory-categories/list",
  inventoryCategories: "/ti/inventory-categories",
  inventoryCategoryDetail: (id: string) => `/ti/inventory-categories/${id}`,
  inventoryLocationsList: "/ti/inventory-locations/list",
  inventoryLocations: "/ti/inventory-locations",
  inventoryLocationDetail: (id: string) => `/ti/inventory-locations/${id}`,
  requestsList: "/ti/requests/list",
  requests: "/ti/requests",
  requestDetail: (id: string) => `/ti/requests/${id}`,
  requestAssign: (id: string) => `/ti/requests/${id}/assign`,
  requestStatus: (id: string) => `/ti/requests/${id}/status`,
  requestMessages: (id: string) => `/ti/requests/${id}/messages`,
  requestCategoriesList: "/ti/request-categories/list",
  requestCategories: "/ti/request-categories",
  requestCategoryDetail: (id: string) => `/ti/request-categories/${id}`,
  passwordsList: "/ti/passwords/list",
  passwords: "/ti/passwords",
  passwordDetail: (id: string) => `/ti/passwords/${id}`,
  extensionsList: "/ti/extensions/list",
  extensions: "/ti/extensions",
  extensionDetail: (id: string) => `/ti/extensions/${id}`,
  termsList: "/ti/terms/list",
  terms: "/ti/terms",
  termDetail: (id: string) => `/ti/terms/${id}`,
  termSign: (id: string) => `/ti/terms/${id}/sign`,
  stockItemsList: "/ti/stock/items/list",
  stockItems: "/ti/stock/items",
  stockItemDetail: (id: string) => `/ti/stock/items/${id}`,
  stockItemEntries: (id: string) => `/ti/stock/items/${id}/entries`,
  stockItemExits: (id: string) => `/ti/stock/items/${id}/exits`,
  stockCategoriesList: "/ti/stock/categories/list",
  stockCategories: "/ti/stock/categories",
  stockCategoryDetail: (id: string) => `/ti/stock/categories/${id}`,
  stockLocationsList: "/ti/stock/locations/list",
  stockLocations: "/ti/stock/locations",
  stockLocationDetail: (id: string) => `/ti/stock/locations/${id}`,
  robotsList: "/ti/robots/list",
  robots: "/ti/robots",
  robotDetail: (id: string) => `/ti/robots/${id}`,
  robotRuns: (id: string) => `/ti/robots/${id}/runs`,
  robotRunsList: (id: string) => `/ti/robots/${id}/runs/list`,
} as const;
```

- [ ] Criar helpers no mesmo arquivo:

```ts
export function unwrapTiEnvelope<T>(body: unknown): T {
  if (body !== null && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export function buildTiListParams<TFilters extends Record<string, unknown>>(
  filters: TFilters = {} as TFilters,
) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined),
  );
}
```

- [ ] Criar `tiQueryKeys` com roots preparados para todos os subdominios:

```ts
import type { TiId, TiListFilters } from "../types";

export const tiQueryKeys = {
  root: ["ti"] as const,
  dashboard: () => [...tiQueryKeys.root, "dashboard"] as const,
  inventory: () => [...tiQueryKeys.root, "inventory"] as const,
  inventoryList: (filters: TiListFilters = {}) =>
    [...tiQueryKeys.inventory(), "list", filters] as const,
  inventoryDetail: (id?: TiId | null) => [...tiQueryKeys.inventory(), "detail", id ?? ""] as const,
  requests: () => [...tiQueryKeys.root, "requests"] as const,
  requestList: (filters: TiListFilters = {}) => [...tiQueryKeys.requests(), "list", filters] as const,
  requestDetail: (id?: TiId | null) => [...tiQueryKeys.requests(), "detail", id ?? ""] as const,
  robots: () => [...tiQueryKeys.root, "robots"] as const,
  robotList: (filters: TiListFilters = {}) => [...tiQueryKeys.robots(), "list", filters] as const,
  robotDetail: (id?: TiId | null) => [...tiQueryKeys.robots(), "detail", id ?? ""] as const,
  terms: () => [...tiQueryKeys.root, "terms"] as const,
  termList: (filters: TiListFilters = {}) => [...tiQueryKeys.terms(), "list", filters] as const,
  termDetail: (id?: TiId | null) => [...tiQueryKeys.terms(), "detail", id ?? ""] as const,
  stock: () => [...tiQueryKeys.root, "stock"] as const,
  stockItems: (filters: TiListFilters = {}) => [...tiQueryKeys.stock(), "items", filters] as const,
  stockItemDetail: (id?: TiId | null) => [...tiQueryKeys.stock(), "detail", id ?? ""] as const,
  passwords: () => [...tiQueryKeys.root, "passwords"] as const,
  passwordList: (filters: TiListFilters = {}) => [...tiQueryKeys.passwords(), "list", filters] as const,
  passwordDetail: (id?: TiId | null) => [...tiQueryKeys.passwords(), "detail", id ?? ""] as const,
  extensions: () => [...tiQueryKeys.root, "extensions"] as const,
  extensionList: (filters: TiListFilters = {}) => [...tiQueryKeys.extensions(), "list", filters] as const,
  extensionDetail: (id?: TiId | null) => [...tiQueryKeys.extensions(), "detail", id ?? ""] as const,
};
```

### Task 4: Criar Services E Hooks Stubs

**Files:**
- Create: `app/src/modules/ti/services/tiDashboardService.ts`
- Create: `app/src/modules/ti/services/tiRequestsService.ts`
- Create: `app/src/modules/ti/services/tiRobotsService.ts`
- Create: `app/src/modules/ti/services/tiInventoryService.ts`
- Create: `app/src/modules/ti/services/tiTermsService.ts`
- Create: `app/src/modules/ti/services/tiStockService.ts`
- Create: `app/src/modules/ti/services/tiPasswordsService.ts`
- Create: `app/src/modules/ti/services/tiExtensionsService.ts`
- Create: `app/src/modules/ti/services/index.ts`
- Create: `app/src/modules/ti/hooks/useTiDashboard.ts`
- Create: `app/src/modules/ti/hooks/useTiRequests.ts`
- Create: `app/src/modules/ti/hooks/useTiRobots.ts`
- Create: `app/src/modules/ti/hooks/useTiInventory.ts`
- Create: `app/src/modules/ti/hooks/useTiTerms.ts`
- Create: `app/src/modules/ti/hooks/useTiStock.ts`
- Create: `app/src/modules/ti/hooks/useTiPasswords.ts`
- Create: `app/src/modules/ti/hooks/useTiExtensions.ts`
- Create: `app/src/modules/ti/hooks/index.ts`

- [ ] Em cada service, importar `api` de `@shared/services/apiClient`, usar `TI_ENDPOINTS`,
  `buildTiListParams` e `unwrapTiEnvelope`.
- [ ] Na fundacao, implementar pelo menos metodos de lista/detalhe para cada subdominio com tipos
  largos. As PRs de cada pessoa refinam payloads e mutations.
- [ ] Em cada hook, criar queries basicas com `useFetch` e `tiQueryKeys`.
- [ ] Criar barrels:

```ts
export * from "./tiService.contract";
export * from "./tiDashboardService";
export * from "./tiRequestsService";
export * from "./tiRobotsService";
export * from "./tiInventoryService";
export * from "./tiTermsService";
export * from "./tiStockService";
export * from "./tiPasswordsService";
export * from "./tiExtensionsService";
```

```ts
export * from "./queryKeys";
export * from "./useTiDashboard";
export * from "./useTiRequests";
export * from "./useTiRobots";
export * from "./useTiInventory";
export * from "./useTiTerms";
export * from "./useTiStock";
export * from "./useTiPasswords";
export * from "./useTiExtensions";
```

### Task 5: Criar Shell De UI E Rota

**Files:**
- Create: `app/src/modules/ti/components/tiWorkspaceUi.ts`
- Create: `app/src/modules/ti/components/tiFormControls.tsx`
- Create: `app/src/modules/ti/components/TiNativeSelect.tsx`
- Create: `app/src/modules/ti/components/TiPage.tsx`
- Create: `app/src/modules/ti/components/TiDashboardTab.tsx`
- Create: `app/src/modules/ti/components/TiRequestsTab.tsx`
- Create: `app/src/modules/ti/components/TiRobotsTab.tsx`
- Create: `app/src/modules/ti/components/TiInventoryTab.tsx`
- Create: `app/src/modules/ti/components/TiTermsTab.tsx`
- Create: `app/src/modules/ti/components/TiStockTab.tsx`
- Create: `app/src/modules/ti/components/TiPasswordsTab.tsx`
- Create: `app/src/modules/ti/components/TiExtensionsTab.tsx`
- Modify: `app/src/modules/ti/index.ts`
- Modify: `app/src/pages/tecnologia/index.tsx`

- [ ] Criar `TiPage` com abas: Dashboard, Chamados, Inventario, Estoque, Termos, Senhas, Ramais,
  Robos.
- [ ] Usar `useModuleAccess("ti")` em `TiPage`.
- [ ] Cada `Ti*Tab` deve renderizar estado vazio operacional simples, sem mock de lista principal.
- [ ] Atualizar `app/src/pages/tecnologia/index.tsx` para importar `TiPage` de `@modules/ti`.
- [ ] Remover import de `../../shared/components/newLayout/Tecnologia` da pagina.
- [ ] Manter `<title>Tecnologia</title>`.

### Task 6: Criar Guardrails Da Fundacao

**Files:**
- Create: `app/src/modules/ti/run-ti-tests.mjs`
- Modify: `app/package.json`

- [ ] Criar harness semelhante ao `run-regularize-tests.mjs`.
- [ ] Cobrir:
  - `TI_ENDPOINTS` contem todos os paths da spec;
  - pagina `/tecnologia` importa `@modules/ti`;
  - pagina `/tecnologia` nao importa `shared/components/newLayout/Tecnologia`;
  - componentes nao importam `@shared/services/apiClient`;
  - hooks usam `tiQueryKeys`;
  - `TiPage.tsx` nao define arrays mockados principais.
- [ ] Adicionar no `app/package.json`:

```json
"test:ti": "node --experimental-strip-types src/modules/ti/run-ti-tests.mjs"
```

- [ ] Nao inserir `test:ti` no script agregado ainda; isso entra no hardening final, quando todas
  as PRs funcionais estiverem integradas.

### Task 7: Validar PR 1

- [ ] Rodar:

```bash
pnpm --filter @workspace/app run test:ti
pnpm --filter @workspace/app typecheck
```

- [ ] Fazer smoke visual minimo de `/tecnologia` em desktop, confirmando shell e abas vazias.
- [ ] Revisar diff:

```bash
git diff --stat
git diff --name-only
```

- [ ] Confirmar que o diff toca apenas `app/` e, se necessario, docs desta trilha.
- [ ] Commit sugerido:

```bash
git add app/src/modules/ti app/src/pages/tecnologia/index.tsx app/package.json
git commit -m "feat: add tecnologia ti frontend foundation"
```

---

## Pessoa 1 - Operacao De Atendimento E Automacao

Pessoa 1 deve criar branches a partir de `feature/tecnologia-ti-frontend-platform` depois da PR 1
integrada.

---

## PR 2: Chamados E Dashboard Operacional

**Branch:** `feat/tecnologia-ti-support-requests`
**Target:** `feature/tecnologia-ti-frontend-platform`
**Responsavel:** Pessoa 1.
**Depende de:** PR 1.
**Escopo:** chamados, categorias, mensagens, assign/status e primeira versao do dashboard usando
`/ti/dashboard`.

### Task 1: Baseline Pessoa 1

**Files:**
- Read: `app/src/modules/ti/services/tiService.contract.ts`
- Read: `app/src/modules/ti/hooks/queryKeys.ts`
- Read: `app/src/modules/ti/components/TiRequestsTab.tsx`
- Read: `app/src/modules/ti/components/TiDashboardTab.tsx`

- [ ] Confirmar branch:

```bash
git status --short --branch
```

Expected:

```text
## feat/tecnologia-ti-support-requests
```

- [ ] Confirmar que os arquivos de Pessoa 2 nao serao editados nesta PR.

### Task 2: Refinar Tipos, Service E Hooks De Chamados

**Files:**
- Modify: `app/src/modules/ti/types/requests.ts`
- Modify: `app/src/modules/ti/services/tiRequestsService.ts`
- Modify: `app/src/modules/ti/hooks/useTiRequests.ts`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`

- [ ] Definir tipos de chamado, categoria e mensagem.
- [ ] Implementar no service:
  - `listRequests`;
  - `createRequest`;
  - `getRequestById`;
  - `updateRequest`;
  - `assignRequest`;
  - `updateRequestStatus`;
  - `listRequestMessages`;
  - `createRequestMessage`;
  - `listRequestCategories`;
  - `createRequestCategory`;
  - `updateRequestCategory`.
- [ ] Implementar hooks de query e mutation.
- [ ] Invalidar `tiQueryKeys.requests()` e `tiQueryKeys.dashboard()` nas mutations de chamados.
- [ ] Atualizar guardrails para verificar endpoints de chamados e mutations em hooks.

### Task 3: Implementar Aba De Chamados

**Files:**
- Modify: `app/src/modules/ti/components/TiRequestsTab.tsx`
- Modify: `app/src/modules/ti/components/tiFormControls.tsx` se precisar de controles compartilhados

- [ ] Criar lista/tabela de chamados com filtros simples.
- [ ] Garantir que a area de filtros ocupe largura util da aba e nao deixe a busca espremida.
- [ ] Criar painel de detalhe.
- [ ] Criar botao `Novo chamado` abrindo `Dialog`/popup, seguindo o padrao das outras acoes.
- [ ] Criar formulario de criacao/edicao de chamado dentro de popup ou painel contextual.
- [ ] Criar botao `Categorias` e UI minima para listar, criar, editar, ativar/inativar categorias
  de chamados.
- [ ] Criar fluxo de mensagens do chamado selecionado.
- [ ] Criar acoes de atribuir responsavel e atualizar status.
- [ ] Mostrar loading, error, empty e retry dentro da aba.
- [ ] Tratar `403` em assign/status/mensagem sem derrubar a pagina.
- [ ] Conferir que selects usam `TiNativeSelect` e que setas nao sobrepoem texto.
- [ ] Conferir que o card empty/detalhe fica alinhado ao desenho da aba em desktop e mobile.

### Task 4: Implementar Dashboard Inicial

**Files:**
- Modify: `app/src/modules/ti/types/dashboard.ts`
- Modify: `app/src/modules/ti/services/tiDashboardService.ts`
- Modify: `app/src/modules/ti/hooks/useTiDashboard.ts`
- Modify: `app/src/modules/ti/components/TiDashboardTab.tsx`

- [ ] Consumir `GET /ti/dashboard`.
- [ ] Renderizar cards operacionais para chamados, inventario, estoque, termos e robos quando os
  campos existirem no retorno.
- [ ] Conferir que o dashboard cobre Tecnologia/TI como um todo, nao apenas Chamados.
- [ ] Nao recalcular dashboard por listas quando `/ti/dashboard` retornar resumo suficiente.
- [ ] Usar fallback visual seguro para campos ausentes, sem quebrar render.
- [ ] Nao criar graficos pesados nesta PR; manter metricas escaneaveis.
- [ ] Registrar no handoff qualquer metrica retornada pelo backend que nao tenha representacao na
  UI.

### Task 5: Validar PR 2

- [ ] Rodar:

```bash
pnpm --filter @workspace/app run test:ti
pnpm --filter @workspace/app typecheck
```

- [ ] Smoke manual:
  - abrir `/tecnologia`;
  - abrir aba Chamados;
  - listar chamados;
  - abrir detalhe;
  - criar mensagem;
  - atualizar status;
  - verificar dashboard carregando.
- [ ] Revisar diff e confirmar que nao tocou arquivos de Pessoa 2.
- [ ] Commit sugerido:

```bash
git add app/src/modules/ti
git commit -m "feat: add tecnologia support requests"
```

---

## PR 3: Robos E Dashboard De Automacao

**Branch:** `feat/tecnologia-ti-robots-dashboard`
**Target:** `feature/tecnologia-ti-frontend-platform`
**Responsavel:** Pessoa 1.
**Depende de:** PR 1. Pode rodar em paralelo com Pessoa 2.
**Escopo:** robos, execucoes e complemento do dashboard de automacao.

### Task 1: Refinar Tipos, Service E Hooks De Robos

**Files:**
- Modify: `app/src/modules/ti/types/robots.ts`
- Modify: `app/src/modules/ti/services/tiRobotsService.ts`
- Modify: `app/src/modules/ti/hooks/useTiRobots.ts`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`

- [ ] Definir tipos de robo e execucao.
- [ ] Implementar no service:
  - `listRobots`;
  - `createRobot`;
  - `getRobotById`;
  - `updateRobot`;
  - `createRobotRun`;
  - `listRobotRuns`.
- [ ] Implementar hooks de query e mutation.
- [ ] Invalidar `tiQueryKeys.robots()` e `tiQueryKeys.dashboard()` nas mutations de robos/runs.
- [ ] Atualizar guardrails para verificar endpoints de robos e runs.

### Task 2: Implementar Aba De Robos

**Files:**
- Modify: `app/src/modules/ti/components/TiRobotsTab.tsx`

- [ ] Criar lista de robos.
- [ ] Criar painel de detalhe com execucoes.
- [ ] Criar botao de novo robo e formulario de criacao/edicao em popup ou painel contextual.
- [ ] Criar acao de registrar execucao em popup ou fluxo contextual claro.
- [ ] Mostrar loading, error, empty e retry dentro da aba.
- [ ] Tratar erro de permissao em criacao/edicao/run.

### Task 3: Complementar Dashboard De Automacao

**Files:**
- Modify: `app/src/modules/ti/components/TiDashboardTab.tsx`

- [ ] Exibir metricas de robos ativos, execucoes recentes e falhas quando vierem de
  `/ti/dashboard`.
- [ ] Garantir que ausencia desses campos nao quebra a aba.
- [ ] Evitar tocar nos componentes de chamados alem do necessario.

### Task 4: Validar PR 3

- [ ] Rodar:

```bash
pnpm --filter @workspace/app run test:ti
pnpm --filter @workspace/app typecheck
```

- [ ] Smoke manual:
  - abrir aba Robos;
  - listar robos;
  - abrir detalhe;
  - registrar execucao;
  - confirmar dashboard sem erro.
- [ ] Revisar diff e confirmar que nao tocou arquivos de Pessoa 2.
- [ ] Commit sugerido:

```bash
git add app/src/modules/ti
git commit -m "feat: add tecnologia robots dashboard"
```

---

## Pessoa 2 - Operacao De Recursos E Responsabilidade

Pessoa 2 deve criar branches a partir de `feature/tecnologia-ti-frontend-platform` depois da PR 1
integrada.

---

## PR 4: Inventario E Termos

**Branch:** `feat/tecnologia-ti-assets-terms`
**Target:** `feature/tecnologia-ti-frontend-platform`
**Responsavel:** Pessoa 2.
**Depende de:** PR 1.
**Escopo:** inventario, categorias/locais de inventario, assign-user, return, termos e assinatura.

### Task 1: Baseline Pessoa 2

**Files:**
- Read: `app/src/modules/ti/services/tiService.contract.ts`
- Read: `app/src/modules/ti/hooks/queryKeys.ts`
- Read: `app/src/modules/ti/components/TiInventoryTab.tsx`
- Read: `app/src/modules/ti/components/TiTermsTab.tsx`

- [ ] Confirmar branch:

```bash
git status --short --branch
```

Expected:

```text
## feat/tecnologia-ti-assets-terms
```

- [ ] Confirmar que os arquivos de Pessoa 1 nao serao editados nesta PR.

### Task 2: Refinar Inventario

**Files:**
- Modify: `app/src/modules/ti/types/inventory.ts`
- Modify: `app/src/modules/ti/services/tiInventoryService.ts`
- Modify: `app/src/modules/ti/hooks/useTiInventory.ts`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`

- [ ] Definir tipos de ativo, categoria, local, assign e return.
- [ ] Implementar no service:
  - `listInventory`;
  - `createInventoryAsset`;
  - `getInventoryAssetById`;
  - `updateInventoryAsset`;
  - `assignInventoryAssetUser`;
  - `returnInventoryAsset`;
  - `listInventoryCategories`;
  - `createInventoryCategory`;
  - `updateInventoryCategory`;
  - `listInventoryLocations`;
  - `createInventoryLocation`;
  - `updateInventoryLocation`.
- [ ] Implementar hooks de query e mutation.
- [ ] Invalidar `tiQueryKeys.inventory()` e `tiQueryKeys.dashboard()` nas mutations.
- [ ] Atualizar guardrails para inventario, categorias, locais, assign e return.

### Task 3: Implementar Aba De Inventario

**Files:**
- Modify: `app/src/modules/ti/components/TiInventoryTab.tsx`

- [ ] Criar lista/tabela de ativos.
- [ ] Criar painel de detalhe.
- [ ] Criar botao de novo ativo e formulario de criacao/edicao em popup ou painel contextual.
- [ ] Criar acoes de atribuir usuario e registrar devolucao.
- [ ] Criar botoes e UI simples para categorias e locais de inventario, incluindo criar/editar ou
  ativar/inativar conforme contrato.
- [ ] Pedir confirmacao antes de atribuir usuario ou registrar devolucao.
- [ ] Mostrar loading, error, empty e retry dentro da aba.

### Task 4: Refinar Termos

**Files:**
- Modify: `app/src/modules/ti/types/terms.ts`
- Modify: `app/src/modules/ti/services/tiTermsService.ts`
- Modify: `app/src/modules/ti/hooks/useTiTerms.ts`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`

- [ ] Definir tipos de termo e assinatura.
- [ ] Implementar no service:
  - `listTerms`;
  - `createTerm`;
  - `getTermById`;
  - `updateTerm`;
  - `signTerm`.
- [ ] Implementar hooks de query e mutation.
- [ ] Invalidar `tiQueryKeys.terms()`, `tiQueryKeys.inventory()` e `tiQueryKeys.dashboard()` nas
  mutations de termo.
- [ ] Atualizar guardrails para termos e assinatura.

### Task 5: Implementar Aba De Termos

**Files:**
- Modify: `app/src/modules/ti/components/TiTermsTab.tsx`

- [ ] Criar lista/tabela de termos.
- [ ] Criar painel de detalhe.
- [ ] Criar botao de novo termo e formulario de criacao/edicao em popup ou painel contextual.
- [ ] Criar acao de assinar termo com confirmacao quando fizer sentido.
- [ ] Tratar assinatura disponivel para `canView` quando backend permitir.
- [ ] Mostrar loading, error, empty e retry dentro da aba.

### Task 6: Validar PR 4

- [ ] Rodar:

```bash
pnpm --filter @workspace/app run test:ti
pnpm --filter @workspace/app typecheck
```

- [ ] Smoke manual:
  - abrir aba Inventario;
  - listar ativo;
  - abrir detalhe;
  - atribuir usuario;
  - registrar devolucao;
  - abrir aba Termos;
  - assinar termo.
- [ ] Revisar diff e confirmar que nao tocou arquivos de Pessoa 1.
- [ ] Commit sugerido:

```bash
git add app/src/modules/ti
git commit -m "feat: add tecnologia assets terms"
```

---

## PR 5: Estoque, Senhas E Ramais

**Branch:** `feat/tecnologia-ti-stock-access`
**Target:** `feature/tecnologia-ti-frontend-platform`
**Responsavel:** Pessoa 2.
**Depende de:** PR 1. Pode rodar em paralelo com Pessoa 1.
**Escopo:** estoque, categorias/locais de estoque, entradas/saidas, senhas e ramais.

### Task 1: Refinar Estoque

**Files:**
- Modify: `app/src/modules/ti/types/stock.ts`
- Modify: `app/src/modules/ti/services/tiStockService.ts`
- Modify: `app/src/modules/ti/hooks/useTiStock.ts`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`

- [ ] Definir tipos de item, categoria, local, entrada e saida.
- [ ] Implementar no service:
  - `listStockItems`;
  - `createStockItem`;
  - `getStockItemById`;
  - `updateStockItem`;
  - `createStockEntry`;
  - `createStockExit`;
  - `listStockCategories`;
  - `createStockCategory`;
  - `updateStockCategory`;
  - `listStockLocations`;
  - `createStockLocation`;
  - `updateStockLocation`.
- [ ] Implementar hooks de query e mutation.
- [ ] Invalidar `tiQueryKeys.stock()` e `tiQueryKeys.dashboard()` nas mutations.
- [ ] Atualizar guardrails para estoque, entradas e saidas.

### Task 2: Implementar Aba De Estoque

**Files:**
- Modify: `app/src/modules/ti/components/TiStockTab.tsx`

- [ ] Criar lista/tabela de itens de estoque.
- [ ] Criar painel de detalhe.
- [ ] Criar botao de novo item e formulario de criacao/edicao em popup ou painel contextual.
- [ ] Criar acoes de entrada e saida em popup ou fluxo contextual claro.
- [ ] Criar botoes e UI simples para categorias e locais de estoque, incluindo criar/editar ou
  ativar/inativar conforme contrato.
- [ ] Pedir confirmacao antes de registrar saida.
- [ ] Mostrar loading, error, empty e retry dentro da aba.

### Task 3: Refinar Senhas

**Files:**
- Modify: `app/src/modules/ti/types/passwords.ts`
- Modify: `app/src/modules/ti/services/tiPasswordsService.ts`
- Modify: `app/src/modules/ti/hooks/useTiPasswords.ts`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`

- [ ] Definir tipos de senha separando lista e detalhe/reveal.
- [ ] Implementar no service:
  - `listPasswords`;
  - `createPassword`;
  - `getPasswordById`;
  - `updatePassword`.
- [ ] Implementar hooks de query e mutation.
- [ ] Detail/reveal deve usar `enabled` para impedir request sem id e sem acao explicita.
- [ ] Invalidar `tiQueryKeys.passwords()` nas mutations.
- [ ] Atualizar guardrails para garantir que lista de senhas nao renderiza segredo.

### Task 4: Implementar Aba De Senhas

**Files:**
- Modify: `app/src/modules/ti/components/TiPasswordsTab.tsx`

- [ ] Criar lista de senhas sem segredo visivel.
- [ ] Criar painel de detalhe/reveal acionado por botao.
- [ ] Criar botao de nova senha e formulario de criacao/edicao em popup ou painel contextual.
- [ ] Esconder/restringir reveal para quem nao tem permissao de escrita/admin se o backend negar.
- [ ] Ao fechar detalhe, voltar para estado mascarado e limpar selecao sensivel.
- [ ] Tratar `403` no reveal sem derrubar a pagina.

### Task 5: Refinar Ramais

**Files:**
- Modify: `app/src/modules/ti/types/extensions.ts`
- Modify: `app/src/modules/ti/services/tiExtensionsService.ts`
- Modify: `app/src/modules/ti/hooks/useTiExtensions.ts`
- Modify: `app/src/modules/ti/components/TiExtensionsTab.tsx`

- [ ] Definir tipos de ramal.
- [ ] Implementar no service:
  - `listExtensions`;
  - `createExtension`;
  - `getExtensionById`;
  - `updateExtension`.
- [ ] Implementar hooks de query e mutation.
- [ ] Invalidar `tiQueryKeys.extensions()` nas mutations.
- [ ] Criar lista, detalhe, botao de novo ramal e formulario de ramais em popup ou painel
  contextual.

### Task 6: Validar PR 5

- [ ] Rodar:

```bash
pnpm --filter @workspace/app run test:ti
pnpm --filter @workspace/app typecheck
```

- [ ] Smoke manual:
  - abrir aba Estoque;
  - registrar entrada;
  - registrar saida;
  - abrir aba Senhas;
  - confirmar lista sem segredo;
  - revelar senha por acao explicita;
  - abrir aba Ramais;
  - criar/editar ramal.
- [ ] Revisar diff e confirmar que nao tocou arquivos de Pessoa 1.
- [ ] Commit sugerido:

```bash
git add app/src/modules/ti
git commit -m "feat: add tecnologia stock access"
```

---

## PR 6: Hardening Final E Integracao

**Branch:** `feat/tecnologia-ti-final-hardening`
**Target:** `feature/tecnologia-ti-frontend-platform`
**Responsavel:** quem terminar primeiro ou dupla.
**Depende de:** PRs 2, 3, 4 e 5 integradas na ponte.
**Escopo:** ajustes finais de integracao, guardrails, responsivo, permissao e validacoes completas.

### Task 1: Baseline Final

**Files:**
- Read/Modify as needed: `app/src/modules/ti/**/*`
- Modify: `app/package.json`

- [ ] Confirmar branch:

```bash
git status --short --branch
```

Expected:

```text
## feat/tecnologia-ti-final-hardening
```

- [ ] Confirmar que todas as PRs funcionais foram integradas na ponte.
- [ ] Rodar:

```bash
pnpm --filter @workspace/app run test:ti
```

- [ ] Corrigir qualquer falha de guardrail antes de seguir.

### Task 2: Consolidar Permissoes E Acoes Sensiveis

**Files:**
- Modify: `app/src/modules/ti/components/TiPage.tsx`
- Modify as needed: `app/src/modules/ti/components/Ti*Tab.tsx`
- Modify: `app/src/modules/ti/run-ti-tests.mjs`

- [ ] Garantir que `TiPage` usa `useModuleAccess("ti")`.
- [ ] Garantir que acoes de criar/editar/assign/return/entrada/saida/run usam `canEdit` ou
  `isAdmin`, exceto assinatura de termo quando o backend permitir para o usuario.
- [ ] Garantir que botoes desabilitados nao disparam mutation.
- [ ] Adicionar guardrail para `useModuleAccess("ti")`.
- [ ] Adicionar guardrail para revelar senha somente por acao explicita.
- [ ] Auditar Dashboard, Chamados, Inventario, Estoque, Termos, Senhas, Ramais e Robos usando a
  matriz `endpoint -> service -> hook -> botao/fluxo -> permissao -> erro`.
- [ ] Registrar no handoff qualquer endpoint sem botao/fluxo ou qualquer botao sem endpoint real.

### Task 3: Responsivo E Acessibilidade

**Files:**
- Modify as needed: `app/src/modules/ti/components/Ti*Tab.tsx`
- Modify as needed: `app/src/modules/ti/components/tiFormControls.tsx`

- [ ] Conferir foco em tabs, botoes de acao e paineis.
- [ ] Garantir labels em inputs.
- [ ] Garantir tabelas rolaveis em mobile.
- [ ] Garantir que textos nao estouram botoes, cards ou tabelas.
- [ ] Garantir que estados empty/error sejam visiveis por aba.

### Task 4: Guardrails Finais

**Files:**
- Modify: `app/src/modules/ti/run-ti-tests.mjs`
- Modify: `app/package.json`

- [ ] Cobrir no `run-ti-tests.mjs`:
  - `TI_ENDPOINTS` contem todos os paths;
  - `/tecnologia` usa `@modules/ti`;
  - pagina nao importa mock antigo;
  - componentes nao importam `apiClient`;
  - hooks usam `tiQueryKeys`;
  - mutations ficam em hooks;
  - `TiPage` nao define arrays mockados principais;
  - senhas nao aparecem em lista;
  - reveal de senha depende de acao explicita;
  - `test:ti` roda no script agregado.
- [ ] Incluir `pnpm run test:ti` no script `test` do `app/package.json`.

### Task 5: Validacao Final

- [ ] Rodar:

```bash
pnpm --filter @workspace/app run test:ti
pnpm --filter @workspace/app run test:status-badge
pnpm --filter @workspace/app run test:react-query-cache
pnpm --filter @workspace/app typecheck
```

- [ ] Rodar teste agregado:

```bash
pnpm --filter @workspace/app test
```

- [ ] Se `test:react-query-cache` falhar apenas por area preexistente fora de TI, registrar no
  handoff e nao corrigir dentro desta PR sem decisao separada.
- [ ] Smoke visual desktop:
  - dashboard carrega;
  - chamados carrega;
  - robos carrega;
  - inventario carrega;
  - termos carrega;
  - estoque carrega;
  - senhas nao vazam segredo;
  - ramais carrega.
- [ ] Smoke visual mobile:
  - tabs rolaveis;
  - tabelas rolaveis;
  - botoes sem texto estourado;
  - paineis sem sobreposicao.
- [ ] Revisar diff:

```bash
git diff --stat
git diff --name-only
```

- [ ] Confirmar que nenhum backend foi alterado.
- [ ] Commit sugerido:

```bash
git add app/src/modules/ti app/src/pages/tecnologia/index.tsx app/package.json
git commit -m "fix: harden tecnologia ti frontend"
```

---

## Tratamento De Drift De Backend

Se alguma integracao encontrar problema real de contrato:

1. Registrar endpoint, metodo, payload enviado, resposta recebida e impacto na UI.
2. Confirmar se o problema ocorre pelo service frontend e por chamada direta autenticada.
3. Nao corrigir backend dentro da PR frontend.
4. Criar decisao separada para branch backend pequena, com teste proprio.
5. Voltar ao front quando a base contiver a correcao ou quando houver fallback aprovado.

Exemplos de drift:

- endpoint documentado nao existe;
- payload obrigatorio nao aceita formato usado pela UI;
- listagem de senhas retorna segredo em claro;
- reveal retorna `200` para usuario sem permissao;
- response nao segue envelope esperado;
- status de erro impede tratamento local consistente.

---

## Handoff

Plano dividido para duas pessoas com dominios interligados e baixo conflito de arquivos.

Primeiro passo operacional: criar `feat/tecnologia-ti-foundation` a partir de
`feature/tecnologia-ti-frontend-platform`.

Depois que a fundacao entrar na ponte:

- Pessoa 1 pode iniciar `feat/tecnologia-ti-support-requests` e
  `feat/tecnologia-ti-robots-dashboard`.
- Pessoa 2 pode iniciar `feat/tecnologia-ti-assets-terms` e `feat/tecnologia-ti-stock-access`.
- O hardening final so deve iniciar depois que as quatro PRs funcionais estiverem integradas.
