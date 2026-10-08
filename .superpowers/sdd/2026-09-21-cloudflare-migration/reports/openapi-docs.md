# Porte de `/docs` e `/openapi.json` — contabil, fiscal, triagem, parcelamento

Branch `cf/openapi-docs`, base `cloudflare-migration` @ `34958e27`. Não houve deploy nem push.

Graphify: `services/graphify-out` não existe neste worktree. A descoberta foi manual, com `rg` e leitura direta.

## Referência Node

Os quatro serviços Node chamam `mountOpenApiDocs` (`shared/src/http/swaggerUi.ts`, que usa `swagger-ui-express`):

- `GET /openapi.json` devolve a spec de `build<X>ServiceOpenApiSpec(env)`;
- `GET /docs` devolve a Swagger UI com `swaggerOptions.url = "/openapi.json"`;
- o gate é `ENABLE_API_DOCS` quando a variável está definida. Sem ela, fica ligado quando `NODE_ENV !== "production"`.

## Resultado por serviço

| Serviço | Commit | Gate no Worker | Paths | Fonte da spec | Bundle antes → depois (dry-run) |
|---|---|---|---|---|---|
| contabil | `47fefd89` | `ENABLE_API_DOCS` ∈ {`true`,`1`} e `NODE_ENV !== "production"`, avaliado por request | `/openapi.json`, `/docs` | `services/contabil-service/src/openapi/spec.ts` (import relativo) | 6368.89 → 6413.78 KiB (gzip 1991.50 → 1997.04) |
| fiscal | `e78d19ab` | igual; o gate já existia, avaliado na criação do app | `/openapi.json` (já existia), `/docs` (novo) | `@workspace/fiscal-service/src/openapi/spec.js` | 6313.34 → 6314.17 KiB (gzip 1981.64 → 1982.10) |
| triagem | `22730807` | igual, avaliado por request | `/openapi.json`, `/docs` | `@workspace/triagem-service/src/openapi/spec.js` | 8384.51 → 8417.60 KiB (gzip 2342.99 → 2346.73) |
| parcelamento | `3bbc0411` | igual, avaliado por request | `/openapi.json`, `/docs` | `@workspace/parcelamento-service/src/openapi/spec.js` | 6307.57 → 6332.21 KiB (gzip 1981.04 → 1984.86) |

- As specs Node são reutilizadas sem cópia. Elas só importam tipos de `config/env` (apagados na compilação), constantes e `@workspace/shared`, então não arrastam `process.env` nem `pg`. O builder recebe `{ port: 8787 }`, como o fiscal já fazia, porque só usa `env.port` em `servers`.
- Os títulos são os mesmos do Node: `contabil-service — OpenAPI`, `fiscal-service — OpenAPI`, `triagem-service - OpenAPI` e `Parcelamento Service - OpenAPI`.
- Com o gate desligado, as duas rotas caem em `c.notFound()`, que é o mesmo 404 de uma rota inexistente.
- O bundle cresce entre 1 e 45 KiB sem compressão (menos de 6 KiB com gzip). O crescimento vem da própria spec. O fiscal quase não muda porque já empacotava a spec.

## Testes (TDD)

Os testes RED falharam antes da implementação, nos casos de `/openapi.json` e `/docs` servidos. Os casos de 404 já passavam, como esperado. Cobertura por serviço:

- flag ligada fora de produção: `/openapi.json` responde 200 e a spec tem um path de domínio (`/contabil/controls/list`, `/fiscal/ncm-search`, `/triagem/overview`, `/parcelamento/installments`); `/docs` responde 200 com `text/html`, o `<title>` do Node e `url: "/openapi.json"`;
- flag ausente, flag `false` e `NODE_ENV=production` com a flag `true` (o fiscal cobre produção e flag ausente): as duas rotas respondem 404.

## Validações

Os quatro Workers passaram em `pnpm test`, `typecheck`, `build` e `check`. `wrangler deploy --dry-run` e `git diff --check` também passaram.

| Worker | Resultado dos testes |
|---|---|
| contabil | 32/32 |
| fiscal | 28/28 |
| triagem | 17/17 |
| parcelamento | 35/35 |

Para preparar o ambiente: `pnpm install --frozen-lockfile` (com o `ERR_PNPM_IGNORED_BUILDS` esperado), build de `@workspace/shared` e `@workspace/runtime`, e `prisma:generate` nos services e nos Workers com uma `DATABASE_URL` fictícia de codegen. O lockfile e os `package.json` não mudaram.

## Divergências e lacunas

1. **Gate mais restrito que o do Node.** No Node, os docs ficam ligados por padrão fora de produção quando `ENABLE_API_DOCS` está ausente. Nos Workers é preciso ligar explicitamente, e em produção os docs ficam desligados mesmo com a flag. Motivo: os `wrangler.jsonc` não definem `NODE_ENV`. Com a regra do Node, o Worker publicado exporia a spec em produção. Adotei o padrão que já existia no fiscal Worker e declarei `ENABLE_API_DOCS` e `NODE_ENV` como opcionais no `env.ts` de contabil, triagem e parcelamento.
2. **Assets da Swagger UI via CDN.** Nenhum Worker tem dependência de Swagger UI instalada: não há `@hono/swagger-ui`, e `swagger-ui-dist` só entra como dependência transitiva de `@workspace/shared`, via `swagger-ui-express`. O Node serve a mesma página, mas com os assets locais. O Worker serve um HTML mínimo que carrega `swagger-ui-dist@5.32.2` do jsDelivr. É a mesma versão do lockfile, com SRI (`sha384`) calculado a partir do pacote local. A página depende do CDN e exige que o navegador acesse `cdn.jsdelivr.net`. Nenhum Worker define CSP.
3. **HTML duplicado nos quatro Workers.** O escopo não permitia mexer em `workers/runtime`. O ponto está marcado com `ponytail:` e deve ir para `@workspace/runtime` quando outro Worker servir `/docs`.
4. **Paths absolutos.** `/docs` só responde sem barra final, porque o Hono é estrito. A UI aponta para `/openapi.json` absoluto, como no Node. Atrás de um prefixo de gateway, os dois ambientes têm a mesma limitação.
5. **`servers` na spec.** Continua `http://localhost:8787`, herdado do builder Node com a porta fixa usada pelo fiscal. Não reflete a URL do Worker.
