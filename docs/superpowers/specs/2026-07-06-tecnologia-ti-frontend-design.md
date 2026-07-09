# Tecnologia TI Frontend Platform Design

**Data:** 2026-07-06
**Status:** spec frontend-only para branch ponte.
**Branch ponte:** `feature/tecnologia-ti-frontend-platform`.
**Superficie do usuario:** `/tecnologia`, mantendo menu e nome "Tecnologia".
**Modulo de acesso:** `ti`.
**Contrato backend:** endpoints existentes do TI Service em `/ti/*`.

---

## 1. Contexto Confirmado

A area visivel para o usuario continua sendo Tecnologia. O novo trabalho nao cria uma superficie
paralela `/ti`; ele substitui a tela mockada atual de Tecnologia por uma experiencia operacional
consumindo os endpoints reais do TI Service.

Arquivos atuais relevantes:

| Area | Arquivos |
|---|---|
| Pagina atual | `app/src/pages/tecnologia/index.tsx` |
| Tela mockada atual | `app/src/shared/components/newLayout/Tecnologia.tsx` |
| Menu principal | `app/src/shared/components/newLayout/AppShell.tsx` |
| Mapa de permissao | `app/src/modules/auth/utils/moduleAccess.ts` |
| Cliente HTTP | `app/src/shared/services/apiClient.ts` e padroes atuais de services |
| Exemplos de dominio | `app/src/modules/regularize`, `app/src/modules/certificates` |

O mapeamento de acesso ja usa `"/tecnologia": "ti"` e o menu ja aponta Tecnologia para
`moduleKey: "ti"`. A implementacao deve preservar esse contrato visual e de permissao.

Graphify UI nao possui grafo local neste workspace no momento. A navegacao desta spec foi feita
pelo fallback manual previsto no `AGENTS.md`, usando regras Codex, `rg` e leitura dos arquivos
reais.

---

## 2. Problema Atual

A tela atual de Tecnologia ainda e uma experiencia mockada:

- os dados principais ficam em arrays locais dentro de `Tecnologia.tsx`;
- a pagina mistura dashboard, usuarios, inventario, estoque, termos, chamados e robos em uma tela
  grande;
- nao existe dominio frontend `app/src/modules/ti`;
- chamadas ao TI Service ainda nao estao encapsuladas em contract/service/hooks;
- ha risco de implementar Chamados e Dashboard apenas como lista/resumo, deixando de fora acoes,
  botoes e fluxos auxiliares ja previstos no contrato, como categorias, mensagens, atribuicao,
  status, execucoes e metricas operacionais;
- senhas, termos e estoque exigem guardrails para nao vazar dado sensivel ou permitir acoes
  destrutivas sem confirmacao clara;
- o trabalho sera dividido entre duas pessoas, entao a arquitetura precisa reduzir conflitos de
  arquivos.

---

## 3. Objetivo

Substituir a tela mockada de Tecnologia por um frontend operacional, mantendo a rota
`/tecnologia`, o nome "Tecnologia" e a permissao `ti`, consumindo os endpoints reais do TI Service
em `/ti/*`.

Resultados esperados:

1. Novo dominio `app/src/modules/ti`.
2. Contract frontend com todos os endpoints `/ti/*` centralizados.
3. Services HTTP separados por subdominio.
4. Hooks React Query com query keys estaveis.
5. Pagina `/tecnologia` usando `@modules/ti`, sem depender de
   `shared/components/newLayout/Tecnologia`.
6. Tela operacional com abas para dashboard, inventario, chamados, senhas, ramais, termos, estoque
   e robos.
7. Guardrails estaticos em `run-ti-tests.mjs`.
8. Divisao de trabalho clara entre duas pessoas, com uma fundacao comum antes das trilhas
   paralelas.
9. Cobertura funcional explicita por subdominio: toda aba deve expor os botoes e fluxos dos
   endpoints que o contrato disponibiliza, ou registrar decisao de adiamento/drift no handoff.
10. Cobertura visual completa de Tecnologia/TI: Dashboard, Chamados e todas as demais abas devem
   ser revisadas contra endpoints, botoes, popups, estados e permissoes antes de serem consideradas
   prontas.

---

## 4. Fora Do Escopo

- Criar ou alterar backend, gateway, Prisma, OpenAPI ou smoke backend.
- Criar rota publica `/ti` nesta entrega.
- Alterar o modelo de permissao do modulo `ti`.
- Refatorar outras areas que apenas citam "Tecnologia" como texto.
- Implementar automacoes reais no frontend alem de registrar execucoes pelos endpoints existentes.
- Resolver divergencias de contrato no frontend sem registrar drift.

Se a integracao frontend provar que algum endpoint nao existe, retorna envelope inesperado, vaza
segredo em lista ou nega tratamento consistente de erro, registrar drift de contrato e parar antes
de alterar backend dentro desta trilha.

---

## 5. Estrategia De Branches

Branch ponte atual:

```text
feature/tecnologia-ti-frontend-platform
```

Base esperada: `develop`.

Fluxo recomendado:

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

- A spec entra diretamente na branch ponte.
- A fundacao deve ser integrada antes das trilhas paralelas.
- As duas trilhas paralelas devem partir da ponte ja com a fundacao integrada.
- PRs desta trilha devem tocar `app/` e `docs/superpowers/*`.
- Se alguma PR tocar `services/`, `gateway/`, `infra/`, Prisma ou smoke backend, parar e revisar
  escopo.

---

## 6. Divisao Para Duas Pessoas

### Fundacao comum

Branch:

```text
feat/tecnologia-ti-foundation
```

Responsavel: quem abrir a primeira PR, antes da divisao paralela.

Escopo:

- criar `app/src/modules/ti`;
- criar contract com todos os endpoints;
- criar tipos base e envelopes;
- criar query keys base;
- criar services read-only e mutations sem UI completa quando necessario para tipagem;
- criar `TiPage` com shell de abas e estados vazios;
- atualizar `app/src/pages/tecnologia/index.tsx` para importar `@modules/ti`;
- criar `run-ti-tests.mjs` com guardrails iniciais;
- adicionar script `test:ti` no `app/package.json`.

### Pessoa 1: Atendimento, dashboard e automacao

Branch:

```text
feat/tecnologia-ti-support-requests
feat/tecnologia-ti-robots-dashboard
```

Ownership principal:

- `app/src/modules/ti/services/tiRequestsService.ts`
- `app/src/modules/ti/services/tiRobotsService.ts`
- `app/src/modules/ti/services/tiDashboardService.ts`
- `app/src/modules/ti/hooks/useTiRequests.ts`
- `app/src/modules/ti/hooks/useTiRobots.ts`
- `app/src/modules/ti/hooks/useTiDashboard.ts`
- `app/src/modules/ti/components/TiDashboardTab.tsx`
- `app/src/modules/ti/components/TiRequestsTab.tsx`
- `app/src/modules/ti/components/TiRobotsTab.tsx`
- tipos em `app/src/modules/ti/types/requests.ts`, `robots.ts` e `dashboard.ts`.

Escopo funcional:

- dashboard consolidado;
- chamados;
- categorias de chamados;
- mensagens;
- atribuicao de responsavel;
- atualizacao de status;
- robos;
- registro e listagem de execucoes.

### Pessoa 2: Ativos, estoque, termos, senhas e ramais

Branch:

```text
feat/tecnologia-ti-assets-terms
feat/tecnologia-ti-stock-access
```

Ownership principal:

- `app/src/modules/ti/services/tiInventoryService.ts`
- `app/src/modules/ti/services/tiStockService.ts`
- `app/src/modules/ti/services/tiTermsService.ts`
- `app/src/modules/ti/services/tiPasswordsService.ts`
- `app/src/modules/ti/services/tiExtensionsService.ts`
- `app/src/modules/ti/hooks/useTiInventory.ts`
- `app/src/modules/ti/hooks/useTiStock.ts`
- `app/src/modules/ti/hooks/useTiTerms.ts`
- `app/src/modules/ti/hooks/useTiPasswords.ts`
- `app/src/modules/ti/hooks/useTiExtensions.ts`
- `app/src/modules/ti/components/TiInventoryTab.tsx`
- `app/src/modules/ti/components/TiStockTab.tsx`
- `app/src/modules/ti/components/TiTermsTab.tsx`
- `app/src/modules/ti/components/TiPasswordsTab.tsx`
- `app/src/modules/ti/components/TiExtensionsTab.tsx`
- tipos em `app/src/modules/ti/types/inventory.ts`, `stock.ts`, `terms.ts`, `passwords.ts` e
  `extensions.ts`.

Escopo funcional:

- inventario;
- categorias e locais de inventario;
- atribuicao de usuario ao ativo;
- devolucao de ativo;
- termos de responsabilidade;
- assinatura de termo;
- estoque TI;
- categorias e locais de estoque;
- entradas e saidas de estoque.
- senhas de TI sem segredo em lista;
- ramais.

### Hardening final

Branch:

```text
feat/tecnologia-ti-final-hardening
```

Responsavel: quem terminar primeiro uma trilha paralela ou uma dupla em pareamento curto.

Escopo:

- guardrails finais de segredo;
- permissao de escrita/reveal;
- auditoria de cobertura endpoint -> UI para todas as abas;
- responsivo e acessibilidade;
- `test:ti`, `test:status-badge`, `test:react-query-cache`, `test` e `typecheck`;
- smoke visual de `/tecnologia`.

---

## 7. Contrato Consumido Pelo Frontend

Todos os paths devem ficar em `tiService.contract.ts`. Componentes nao podem conter strings de
endpoint.

### 7.1 Inventario

| Grupo | Metodo | Path | Uso frontend |
|---|---|---|---|
| Inventory | GET | `/ti/inventory/list` | Listar ativos |
| Inventory | POST | `/ti/inventory` | Criar ativo |
| Inventory | GET | `/ti/inventory/{id}` | Detalhar ativo |
| Inventory | PATCH | `/ti/inventory/{id}` | Atualizar ativo |
| Inventory | PATCH | `/ti/inventory/{id}/assign-user` | Atribuir usuario |
| Inventory | PATCH | `/ti/inventory/{id}/return` | Registrar devolucao |

### 7.2 Categorias e locais de inventario

| Grupo | Metodo | Path | Uso frontend |
|---|---|---|---|
| Inventory Categories | GET | `/ti/inventory-categories/list` | Listar categorias |
| Inventory Categories | POST | `/ti/inventory-categories` | Criar categoria |
| Inventory Categories | PATCH | `/ti/inventory-categories/{id}` | Atualizar categoria |
| Inventory Locations | GET | `/ti/inventory-locations/list` | Listar locais |
| Inventory Locations | POST | `/ti/inventory-locations` | Criar local |
| Inventory Locations | PATCH | `/ti/inventory-locations/{id}` | Atualizar local |

### 7.3 Chamados

| Grupo | Metodo | Path | Uso frontend |
|---|---|---|---|
| Requests | GET | `/ti/requests/list` | Listar chamados |
| Requests | POST | `/ti/requests` | Criar chamado |
| Requests | GET | `/ti/requests/{id}` | Detalhar chamado |
| Requests | PATCH | `/ti/requests/{id}` | Atualizar chamado |
| Requests | PATCH | `/ti/requests/{id}/assign` | Atribuir responsavel |
| Requests | PATCH | `/ti/requests/{id}/status` | Atualizar status |
| Request Messages | GET | `/ti/requests/{id}/messages` | Listar mensagens |
| Request Messages | POST | `/ti/requests/{id}/messages` | Criar mensagem |

### 7.4 Categorias de chamados

| Grupo | Metodo | Path | Uso frontend |
|---|---|---|---|
| Request Categories | GET | `/ti/request-categories/list` | Listar categorias |
| Request Categories | POST | `/ti/request-categories` | Criar categoria |
| Request Categories | PATCH | `/ti/request-categories/{id}` | Atualizar categoria |

### 7.5 Senhas e ramais

| Grupo | Metodo | Path | Uso frontend |
|---|---|---|---|
| Passwords | GET | `/ti/passwords/list` | Listar senhas sem revelar segredo |
| Passwords | POST | `/ti/passwords` | Criar senha |
| Passwords | GET | `/ti/passwords/{id}` | Detalhar/revelar senha apos acao explicita |
| Passwords | PATCH | `/ti/passwords/{id}` | Atualizar senha |
| Extensions | GET | `/ti/extensions/list` | Listar ramais |
| Extensions | POST | `/ti/extensions` | Criar ramal |
| Extensions | GET | `/ti/extensions/{id}` | Detalhar ramal |
| Extensions | PATCH | `/ti/extensions/{id}` | Atualizar ramal |

### 7.6 Termos

| Grupo | Metodo | Path | Uso frontend |
|---|---|---|---|
| Terms | GET | `/ti/terms/list` | Listar termos |
| Terms | POST | `/ti/terms` | Criar termo |
| Terms | GET | `/ti/terms/{id}` | Detalhar termo |
| Terms | PATCH | `/ti/terms/{id}` | Atualizar termo |
| Terms | PATCH | `/ti/terms/{id}/sign` | Assinar termo |

### 7.7 Estoque

| Grupo | Metodo | Path | Uso frontend |
|---|---|---|---|
| Stock Items | GET | `/ti/stock/items/list` | Listar itens |
| Stock Items | POST | `/ti/stock/items` | Criar item |
| Stock Items | GET | `/ti/stock/items/{id}` | Detalhar item |
| Stock Items | PATCH | `/ti/stock/items/{id}` | Atualizar item |
| Stock Entries | POST | `/ti/stock/items/{id}/entries` | Registrar entrada |
| Stock Exits | POST | `/ti/stock/items/{id}/exits` | Registrar saida |
| Stock Categories | GET | `/ti/stock/categories/list` | Listar categorias |
| Stock Categories | POST | `/ti/stock/categories` | Criar categoria |
| Stock Categories | PATCH | `/ti/stock/categories/{id}` | Atualizar categoria |
| Stock Locations | GET | `/ti/stock/locations/list` | Listar locais |
| Stock Locations | POST | `/ti/stock/locations` | Criar local |
| Stock Locations | PATCH | `/ti/stock/locations/{id}` | Atualizar local |

### 7.8 Robos e dashboard

| Grupo | Metodo | Path | Uso frontend |
|---|---|---|---|
| Robots | GET | `/ti/robots/list` | Listar robos |
| Robots | POST | `/ti/robots` | Criar robo |
| Robots | GET | `/ti/robots/{id}` | Detalhar robo |
| Robots | PATCH | `/ti/robots/{id}` | Atualizar robo |
| Robot Runs | POST | `/ti/robots/{id}/runs` | Registrar execucao |
| Robot Runs | GET | `/ti/robots/{id}/runs/list` | Listar execucoes |
| Dashboard | GET | `/ti/dashboard` | Buscar resumo consolidado |

---

## 8. Arquitetura Frontend

Mapa esperado:

```txt
app/src/pages/tecnologia/index.tsx
  -> TiPage

app/src/modules/ti/
  index.ts
  run-ti-tests.mjs
  types/
    common.ts
    dashboard.ts
    inventory.ts
    requests.ts
    passwords.ts
    extensions.ts
    terms.ts
    stock.ts
    robots.ts
    index.ts
  services/
    tiService.contract.ts
    tiDashboardService.ts
    tiInventoryService.ts
    tiRequestsService.ts
    tiPasswordsService.ts
    tiExtensionsService.ts
    tiTermsService.ts
    tiStockService.ts
    tiRobotsService.ts
    index.ts
  hooks/
    queryKeys.ts
    useTiDashboard.ts
    useTiInventory.ts
    useTiRequests.ts
    useTiPasswords.ts
    useTiExtensions.ts
    useTiTerms.ts
    useTiStock.ts
    useTiRobots.ts
    index.ts
  components/
    TiPage.tsx
    TiDashboardTab.tsx
    TiInventoryTab.tsx
    TiRequestsTab.tsx
    TiPasswordsTab.tsx
    TiExtensionsTab.tsx
    TiTermsTab.tsx
    TiStockTab.tsx
    TiRobotsTab.tsx
    TiNativeSelect.tsx
    tiFormControls.tsx
    tiWorkspaceUi.ts
```

Responsabilidades:

| Arquivo | Responsabilidade |
|---|---|
| `tiService.contract.ts` | Endpoints, builders de params/payloads, unwrap de envelope |
| `types/*` | Tipos por subdominio para reduzir conflitos entre pessoas |
| `services/*` | Chamadas HTTP por subdominio |
| `queryKeys.ts` | Root `["ti"]` e keys por subdominio |
| `hooks/useTi*.ts` | Queries e mutations por subdominio |
| `TiPage.tsx` | Shell, abas, permissao e composicao |
| `Ti*Tab.tsx` | UI de cada subdominio |
| `tiFormControls.tsx` | Controles de formulario compartilhados do dominio |
| `tiWorkspaceUi.ts` | Tokens/classes compartilhados da tela |
| `run-ti-tests.mjs` | Guardrails estaticos |

Regras:

- Componentes nao importam `apiClient` diretamente.
- Hooks usam `tiQueryKeys`.
- Mutations ficam em hooks, nao em componentes.
- Endpoints ficam centralizados no contract.
- `TiPage.tsx` deve ser composicao fina; regras de aba ficam em componentes e hooks.
- Nao criar arrays mockados principais na tela final.
- Reaproveitar `StatusBadge` para status operacionais quando o padrao existir.
- Evitar `style={...}` em componentes de feature; se necessario, encapsular no componente base do
  dominio.

---

## 8.1 Gate De Cobertura Funcional

Nenhuma aba de Tecnologia/TI deve ser aceita apenas por listar dados. Para cada subdominio, a PR
deve fazer uma matriz simples:

```text
endpoint -> service -> hook/query ou mutation -> botao/fluxo visivel -> permissao -> estado de erro
```

Regras desse gate:

- Todo `POST` e `PATCH` exposto no contrato precisa ter botao ou fluxo de UI, salvo decisao
  registrada no handoff.
- Todo cadastro auxiliar usado por select, filtro ou formulario precisa ter gestao minima quando o
  backend expuser `POST`/`PATCH`. Isso inclui categorias de chamados, categorias/locais de
  inventario e categorias/locais de estoque.
- Botoes que criam, editam ou gerenciam cadastros devem abrir `Dialog`/popup seguindo o padrao das
  outras telas operacionais, nao formularios soltos que empurrem a grade principal.
- Selects nativos do modulo devem usar o componente padronizado do dominio, com seta alinhada e
  padding suficiente para nao sobrepor o texto.
- Dashboard nao pode ser tratado como enfeite: deve consumir `/ti/dashboard`, mostrar estados
  reais de loading/erro/vazio e cobrir todos os grupos que o retorno disponibilizar.
- Chamados precisam cobrir lista, detalhe, criacao, edicao, categorias, mensagens, atribuicao,
  status, filtros e estados vazios. Se qualquer item ficar pendente, deve aparecer explicitamente
  no handoff da PR.
- A revisao final deve procurar botoes faltantes, acoes sem permissao, forms fora do padrao,
  popups ausentes, filtros desalinhados e cards que quebrem a composicao responsiva.

---

## 9. Permissoes E Seguranca

O frontend usa `useModuleAccess("ti")`.

| Nivel | UI |
|---|---|
| Sem acesso | Nao renderiza experiencia operacional; AppShell ja deve bloquear rota/menu |
| `canView` | Pode ver dashboard, listas e detalhes permitidos |
| `canEdit` ou `isAdmin` | Pode criar, editar, atribuir, devolver, registrar entrada/saida, criar run e gerenciar cadastros |

Regras sensiveis:

- Senhas nunca aparecem em listas.
- `GET /ti/passwords/{id}` so deve rodar apos acao explicita de detalhe/reveal.
- Segredo revelado nao deve ficar em estado global persistente.
- Ao fechar o painel de senha, voltar para estado mascarado e limpar selecao sensivel quando
  possivel.
- Erro `403` em reveal, assinatura, assign, devolucao, entrada ou saida deve aparecer no item/aba,
  sem derrubar a pagina inteira.
- Assinatura de termo pode ser exibida para usuario com `canView` quando o registro vier como
  acionavel para ele; o backend continua sendo a fonte de verdade.
- Acoes de estoque e inventario devem pedir confirmacao quando alterarem posse, quantidade ou
  status operacional.

---

## 10. UX Esperada

A tela deve ser operacional, densa e voltada a trabalho diario, nao landing page.

Abas principais:

- Dashboard
- Chamados
- Inventario
- Estoque
- Termos
- Senhas
- Ramais
- Robos

Comportamento:

- Header com titulo "Tecnologia" e acoes contextuais por aba.
- Filtros simples por status, categoria, local, responsavel, usuario e busca textual quando o
  backend aceitar.
- Tabelas escaneaveis com rolagem horizontal em mobile.
- Painel lateral ou area de detalhe por item selecionado.
- Loading, error, empty e retry por aba.
- Erro em uma aba nao derruba as demais.
- Dashboard usa `/ti/dashboard` como fonte primaria, sem recalcular tudo por listas quando houver
  resumo consolidado.
- Formularios aparecem em modais ou paineis, com labels reais e validacao local minima.
- Textos e botoes devem caber em desktop e mobile.

---

## 11. Dados E Cache

Query keys:

```ts
export const tiQueryKeys = {
  root: ["ti"] as const,
  dashboard: () => [...tiQueryKeys.root, "dashboard"] as const,
  inventory: () => [...tiQueryKeys.root, "inventory"] as const,
  requests: () => [...tiQueryKeys.root, "requests"] as const,
  passwords: () => [...tiQueryKeys.root, "passwords"] as const,
  extensions: () => [...tiQueryKeys.root, "extensions"] as const,
  terms: () => [...tiQueryKeys.root, "terms"] as const,
  stock: () => [...tiQueryKeys.root, "stock"] as const,
  robots: () => [...tiQueryKeys.root, "robots"] as const,
};
```

Invalidacao:

- Mutations de inventario invalidam `tiQueryKeys.inventory()` e `tiQueryKeys.dashboard()`.
- Mutations de chamados invalidam `tiQueryKeys.requests()` e `tiQueryKeys.dashboard()`.
- Mutations de senhas invalidam `tiQueryKeys.passwords()`; reveal/detail nao invalida lista.
- Mutations de ramais invalidam `tiQueryKeys.extensions()`.
- Mutations de termos invalidam `tiQueryKeys.terms()`, `tiQueryKeys.inventory()` quando houver
  vinculo com ativo e `tiQueryKeys.dashboard()`.
- Mutations de estoque invalidam `tiQueryKeys.stock()` e `tiQueryKeys.dashboard()`.
- Mutations de robos e runs invalidam `tiQueryKeys.robots()` e `tiQueryKeys.dashboard()`.

O contrato de response deve usar helper de unwrap que aceite envelope `{ success, data }` e tambem
retorno direto quando algum endpoint legado ja vier sem envelope, registrando drift se isso quebrar
a consistencia esperada.

---

## 12. Guardrails

Criar `app/src/modules/ti/run-ti-tests.mjs` e script `test:ti`.

Cobrir pelo menos:

- `TI_ENDPOINTS` contem todos os paths listados nesta spec.
- `app/src/pages/tecnologia/index.tsx` importa `@modules/ti`.
- `app/src/pages/tecnologia/index.tsx` nao importa mais
  `shared/components/newLayout/Tecnologia`.
- O modulo `ti` e o unico local da feature importando `@shared/services/apiClient`.
- Componentes em `app/src/modules/ti/components` nao fazem chamadas `api.*`.
- Hooks usam `tiQueryKeys`.
- Mutations ficam em hooks.
- `TiPage.tsx` nao define arrays mockados principais.
- Listas de senhas nao renderizam campo de segredo.
- Reveal de senha depende de acao explicita e nao de listagem.
- `test:ti` roda no script agregado do app antes da PR final.

---

## 13. Validacao Esperada

Frontend:

```bash
pnpm --filter @workspace/app run test:ti
pnpm --filter @workspace/app run test:status-badge
pnpm --filter @workspace/app run test:react-query-cache
pnpm --filter @workspace/app test
pnpm --filter @workspace/app typecheck
```

Smoke visual:

- abrir `/tecnologia` em desktop;
- abrir `/tecnologia` em mobile;
- confirmar que a tela nova usa dados via hooks;
- confirmar que nao ha mocks principais;
- confirmar que usuario sem escrita nao ve acoes de gestao;
- confirmar que erro `403` em uma acao nao quebra a pagina;
- confirmar que senha nao aparece em lista e so aparece apos acao explicita;
- confirmar que atribuir ativo, devolver ativo, assinar termo, entrada/saida de estoque e run de
  robo invalidam a UI correta.

Backend:

- nao rodar como validacao padrao desta trilha;
- rodar apenas se alguma PR alterar arquivos fora de `app/` ou docs.

---

## 14. Criterios De Aceite

- `/tecnologia` continua sendo a rota principal.
- Menu continua exibindo "Tecnologia" com `moduleKey: "ti"`.
- `app/src/pages/tecnologia/index.tsx` usa `@modules/ti`.
- A tela mockada antiga deixa de ser a experiencia principal.
- `app/src/modules/ti` concentra tipos, services, hooks e componentes.
- Todos os endpoints `/ti/*` consumidos pelo frontend estao centralizados no contract.
- As duas trilhas paralelas conseguem trabalhar com baixo conflito de arquivos.
- Dashboard, chamados, inventario, estoque, termos, senhas, ramais e robos possuem estados de
  loading, erro e vazio.
- Acoes sensiveis respeitam permissao frontend e mantem backend como fonte de verdade.
- Guardrails impedem retorno de mocks principais, API direta em componente e vazamento de senha em
  lista.
- Nenhuma PR frontend altera backend sem decisao explicita.

---

## 15. Decisao Atual

Esta spec e o plano de execucao devem acompanhar a branch ponte
`feature/tecnologia-ti-frontend-platform`.

O plano operacional fica em:

```text
docs/superpowers/plans/2026-07-06-tecnologia-ti-frontend.md
```

Ao encontrar fluxo, botao, endpoint ou permissao faltante durante a implementacao, atualizar esta
spec e o plano antes de passar o handoff para outra pessoa.
