# Ciclo TDD — paridade restante do contabil-service

Data: 2026-09-22
Escopo autorizado: `workers/contabil-service/**` e este relatório
Referências: plano `docs/superpowers/plans/2026-09-21-cloudflare-migration.md` e o brief de service remainder disponível no workspace.

## Limites e método

- Graphify foi usado primeiro: `pnpm graphify:context:services -- "...paridade restante do contabil-service..."`, seguido de atualização do grafo após a edição.
- O serviço canônico em `services/contabil-service` foi usado somente como referência de contrato/comportamento; nenhum arquivo em `services/**` foi alterado.
- Não foram tocados Commercial, gateway, UI/app-next, outros Workers, lockfile ou `app/next-env.d.ts`.
- A alteração preexistente em `app/next-env.d.ts` e alterações preexistentes fora do escopo foram preservadas; não houve deploy, push, force-push, migração ou alteração remota.

## Correções TDD

Cada achado novo teve teste RED antes da implementação mínima GREEN.

### Timestamps e dados físicos

- Os modelos Worker `TriageMonthly`, `TriageBankStatement` e `TriageClosing` agora declaram `created_at` com `@default(now())` e `updated_at` com `@updatedAt`, alinhados ao schema/migrations físicas PostgreSQL, onde ambos são `NOT NULL`.
- Os creates/upserts enviam argumentos reais com os dois timestamps; updates e archive/restore também atualizam `updated_at` explicitamente.
- O teste `envia timestamps obrigatórios nos creates e upserts físicos da triagem` inspeciona os argumentos dos mocks de Prisma, não apenas o resultado serializado.

### Reporting

- A implementação Worker foi alinhada ao `InternalReportingService` canônico: query passa por `executeReportingQuery`, com allowlist de fonte/campos, filtros, grupos, ordenação, agregações, limites e paginação.
- A carga é buscada sempre com `where.organization_id`, e query usa snapshot `RepeatableRead` antes da execução.
- O teste `aplica filtro impossível no reporting em vez de devolver a página bruta` comprova que uma competência inexistente retorna `rows: []`, em vez de ignorar o filtro. O contrato de campos publicados e aliases continua validado pelo schema/grant HMAC.

### Autorização

- Bearer, cookie e auth encaminhada continuam passando pelo mesmo autenticador/CSRF/sessão; as rotas `/contabil` agora exigem `claims.modules.contabil` compatível antes de executar o serviço.
- `requireContabilWrite` exige simultaneamente permissão global de escrita e módulo contábil `>= 2`; permissão global alta não concede bypass quando `contabil = 0`.
- Os services de controles e fechamento também aplicam a proteção de módulo nas operações de escrita, evitando bypass por chamada direta.
- O teste parametrizado cobre os três transportes com `permission = 3` e `modules.contabil = 0`, esperando `403` sem invocar o service.

### RLS, tenant e concorrência

- A criação de mensal fiscal/triagem abre transação `Serializable`, executa `SET LOCAL ROLE "giro_user_runtime"` e `set_config('app.organization_id', ..., true)` antes de qualquer consulta a `triageCompetence`/configuração.
- Leitura, catálogo/snapshot, lock e create usam o mesmo transaction client e `organization_id`; reconsulta de corrida também restabelece o contexto RLS antes da leitura.
- O teste `estabelece RLS antes de consultar a competência fiscal na mesma transação` verifica ordem dos eventos e opção `Serializable`.

### Auditoria

- O recorder Worker deixou de ser best-effort silencioso. Binding/token ausentes resultam em `503`; HTTP não-2xx, falha de transporte e timeout produzem erro observável.
- Há timeout via `AbortSignal.timeout`, retry limitado para falhas transitórias (`408/425/429/5xx` e transporte), backoff injetável nos testes, `504` para timeout e logs estruturados de retry/falha.
- Os quatro testes de `audit.test.ts` cobrem retry HTTP, exaustão `503`, timeout `504` e configuração ausente.

### Guard de banco

O guard existente foi preservado: sem binding `HYPERDRIVE.connectionString` e sem `DATABASE_URL`, o Worker responde `503` explícito antes de criar Prisma; nenhum DSN, ID de produção ou secret foi inventado. Há teste de rota para esse caso.

## Validações

- `pnpm --filter @workspace/contabil-worker test` — GREEN, 4 arquivos e 22 testes.
- `pnpm --filter @workspace/contabil-worker typecheck` — GREEN.
- `pnpm --filter @workspace/contabil-worker build` — GREEN.
- `pnpm --filter @workspace/contabil-worker check` — GREEN.
- `pnpm --filter @workspace/contabil-worker exec prisma validate --schema prisma/schema.prisma` — GREEN.
- `pnpm exec prisma validate --schema infra/prisma/schema.prisma` — GREEN.
- `pnpm graphify:update:services` — GREEN; grafo local atualizado sem versionar `services/graphify-out/`.
- `pnpm exec wrangler deploy --dry-run --config workers/contabil-service/wrangler.jsonc` — GREEN, bundle 6368.01 KiB / 1991.34 KiB gzip; nenhum deploy executado.
- `git diff --check` — executado no gate final sobre o escopo Worker/relatório e verificação separada do arquivo preexistente app-next.

Warnings de `resolutions` em `services/src/package.json` e aviso de atualização do Prisma são externos a este escopo e não foram alterados.

## Gaps operacionais

- `workers/contabil-service/wrangler.jsonc` declara `AUDIT_SERVICE`, `TRIAGEM_SERVICE` e `USER_SERVICE`, mas não declara `HYPERDRIVE`. O runtime mantém o guard 503; Hyperdrive precisa ser provisionado antes de qualquer execução real com PostgreSQL.
- `DATABASE_URL`, `JWT_SECRET`, tokens de service bindings, tokens de auditoria e secrets de reporting não são configurados no arquivo Wrangler. Devem ser provisionados pelo ambiente/secret manager, sem valores fictícios.
- Não houve validação contra PostgreSQL/Supabase/Hyperdrive/bindings remotos, smoke autenticado de preview ou deploy. Os testes usam doubles locais de Hono/Prisma/Service Binding.

## Commit

O código e este relatório estão registrados no commit local desta entrega, sem push e sem deploy.
