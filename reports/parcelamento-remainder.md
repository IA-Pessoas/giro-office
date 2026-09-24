# Paridade restante do parcelamento-service

Data: 2026-09-22
Base: `cloudflare-migration` em `17f96e89f`
Escopo de código: `workers/parcelamento-service/**`
Escopo de relatório: `reports/parcelamento-remainder.md`

## Resultado

O Worker já continha a porta das superfícies restantes do serviço Node. Esta rodada fechou duas diferenças comportamentais encontradas na comparação do Express com o Worker:

- queries repetidas agora preservam a forma de array usada pelo parser do Express e são rejeitadas pelo schema quando o campo espera valor escalar;
- erros que geram `requestId` agora devolvem o mesmo identificador no header e no envelope JSON.

Commit de código e testes: `ba2aed71886621be136e6239d01c8e89b01a9436` (`fix(parcelamento-worker): preserve query and error parity`).

## Comparação de superfície

| Área | Rotas verificadas | Paridade preservada |
| --- | --- | --- |
| Installments | `GET/POST /parcelamento/installments`; `GET/PATCH /parcelamento/installments/:id` | tenant, paginação, filtros, validação, conflitos `409`, recálculo financeiro e auditoria |
| Competências | `GET/POST /parcelamento/installments/:installmentId/competencies`; `PATCH /parcelamento/installment-competencies/:id` | vínculo do parcelamento, tenant, valores pagos/vencidos, transições de status, conflitos e auditoria |
| Panorama | `GET/POST /parcelamento/panoramas`; `GET/PATCH /parcelamento/panoramas/:id`; `POST /parcelamento/panoramas/competences/:competence/generate` | tenant, paginação, competência, geração, validação e auditoria |
| Reporting | `GET /internal/reporting/catalog`; `POST /internal/reporting/extract` | auth interna, catálogo, filtros/paginação, exportação e envelopes de erro |

Também foram conferidos o middleware de autenticação, sessão/cookie, CSRF, claims e escopo de organização; propagação de `x-request-id`; erros e conflitos; auditoria via `AUDIT_SERVICE`; acesso ao Prisma físico; e bindings `AUDIT_SERVICE`/`USER_SERVICE`. Não foi introduzido D1, URL de produção ou credencial hardcoded.

## TDD

### RED

1. Teste `inclui o request id gerado no envelope de erro`: falhou porque o response 503 não continha `requestId` no corpo.
2. Teste `rejeita query key repetida como o Express rejeita arrays no schema`: falhou porque `Object.fromEntries` colapsava `page=1&page=2` para um único valor e a rota seguia com 200.

### GREEN

1. O `onError` passou a serializar o `requestId` gerado no envelope e no header.
2. O parser de query passou a usar `URLSearchParams.getAll`, mantendo arrays para chaves repetidas e deixando o schema produzir 400.

Resultado final do teste direcionado: 26 testes aprovados.
Resultado final da suíte do Worker: 2 arquivos, 31 testes aprovados.

## Validações executadas

- `pnpm --filter @workspace/parcelamento-worker test`: aprovado, 31/31.
- `pnpm --filter @workspace/parcelamento-worker typecheck`: aprovado.
- `pnpm --filter @workspace/parcelamento-worker build`: aprovado.
- `pnpm --filter @workspace/parcelamento-worker check`: aprovado, 14 arquivos.
- `pnpm --filter @workspace/parcelamento-worker exec prisma validate --schema prisma/schema.prisma`: aprovado.
- `pnpm exec prisma validate --schema infra/prisma/schema.prisma`: aprovado.
- `pnpm graphify:context:services -- "auditar paridade restante do parcelamento-service Worker"`: executado antes da alteração.
- `pnpm graphify:update:services`: aprovado; grafo reconstruído com 9.305 nós, 16.952 arestas e 384 comunidades pós-processadas. O HTML foi omitido pelo limite normal do Graphify para grafos maiores que 5.000 nós.
- `pnpm exec wrangler deploy --dry-run --config workers/parcelamento-service/wrangler.jsonc`: aprovado; bundle 6.307,57 KiB, gzip 1.981,04 KiB; bindings `AUDIT_SERVICE` e `USER_SERVICE` identificados.
- `git diff --check`: aprovado.
- `pnpm test:scripts`: aprovado, 127 testes.

## Limites e gaps externos

- A suíte raiz `pnpm test` não concluiu: o task `@workspace/infra:prisma:generate` foi bloqueado por `DATABASE_URL` ausente (`PrismaConfigEnvError`). Nenhum valor foi inventado.
- Não houve teste autenticado contra PostgreSQL/Hyperdrive real, smoke de preview, deploy ou verificação de produção.
- O `wrangler.jsonc` não declara `HYPERDRIVE`; não foi possível criar um binding sem o identificador externo autorizado.
- OpenAPI/CORS, secrets e comportamento de chaves repetidas fora das rotas cobertas permanecem dependentes da configuração/integração externa já registrada no plano.

Não houve deploy nem push.
