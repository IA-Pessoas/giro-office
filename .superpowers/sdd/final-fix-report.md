# Relatório — correções finais do feed semântico

## Mudanças realizadas

- Normalizei caminhos removendo barras finais, preservando `/`.
- Marquei `GET /project/metrics` como técnico e criei a decisão de negócio para
  `POST /project/progress`.
- Criei a matriz de regressão, com ações e descrições exatas, para os métodos de
  arquivo de certificados PJ e PF.
- Restrinigi o CRUD genérico à coleção, a `/list` e a um único identificador
  conhecido. `POST /task/nova-acao` agora é `unknown`.
- Após a restrição, percorri a cobertura da OpenAPI e adicionei decisões explícitas
  para as 34 operações públicas restantes, sem fallback por módulo.
- Mantive o predicado SQL do dashboard antes de `order by`/`limit 5`, acrescentei
  `outcome` e `activity_visible` à projeção e filtrei as linhas novamente no mapper.
- Adicionei cobertura para auditoria de `GET /task/list` autenticado com upstream
  retornando 500.

## Evidência RED/GREEN

RED, antes do código de produção:

```text
corepack pnpm --filter @workspace/gateway exec vitest run \
  src/test/activityCatalog.test.ts src/test/activityCatalogCoverage.test.ts \
  src/app.routes.test.ts src/services/dashboardStatsService.test.ts

11 falhas: barra final, project metrics/progress, arquivo PJ/PF,
POST /task/nova-acao e filtro defensivo do dashboard.
```

Após restringir o CRUD, a cobertura agregada retornou 34 operações `unknown`; elas
foram usadas para orientar as decisões explícitas. GREEN:

```text
corepack pnpm --filter @workspace/gateway exec vitest run \
  src/test/activityCatalog.test.ts src/test/activityCatalogCoverage.test.ts \
  src/app.routes.test.ts src/services/dashboardStatsService.test.ts

4 arquivos, 110 testes aprovados.
```

## Validação final

```text
corepack pnpm --filter @workspace/gateway exec vitest run
6 arquivos, 119 testes aprovados.

corepack pnpm --filter @workspace/gateway exec tsc --noEmit
aprovado.

corepack pnpm exec biome check \
  services/gateway/src/audit/activityCatalog.ts \
  services/gateway/src/services/dashboardStatsService.ts \
  services/gateway/src/test/activityCatalog.test.ts \
  services/gateway/src/services/dashboardStatsService.test.ts \
  services/gateway/src/app.routes.test.ts
Checked 5 files; nenhuma correção necessária.
```

Observação de ambiente: a suíte completa exigiu execução fora do sandbox para abrir
listeners HTTP efêmeros. Para o typecheck, foram criados links locais e ignorados
para `node_modules` já existentes no checkout principal; nenhum arquivo de código,
lockfile ou dependência foi alterado.

## Arquivos alterados

- `services/gateway/src/audit/activityCatalog.ts`
- `services/gateway/src/services/dashboardStatsService.ts`
- `services/gateway/src/test/activityCatalog.test.ts`
- `services/gateway/src/services/dashboardStatsService.test.ts`
- `services/gateway/src/app.routes.test.ts`
- `.superpowers/sdd/final-fix-report.md`

## Autorrevisão

- A consulta SQL continua filtrando antes da ordenação e do limite.
- A função de elegibilidade inclui legado sem marca e apenas `true/success`; exclui
  `true/error`, `true/aborted` e qualquer `false`.
- As descrições não interpolam IDs, query, tokens ou body.
- `git diff --check` não reportou erros de whitespace.
- A cobertura da OpenAPI exige zero operações `unknown` e está verde.

## Preocupações remanescentes

Nenhuma funcional. As decisões explícitas acompanham o conjunto atual da OpenAPI;
novas subrotas públicas continuarão aparecendo como `unknown` na cobertura até
receberem uma decisão semântica.
