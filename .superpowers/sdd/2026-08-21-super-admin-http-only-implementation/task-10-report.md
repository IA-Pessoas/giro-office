# Tarefa 10 — CI isolada e regressões versionadas

Data: 2026-08-24

## Entrega

- Workflow dedicado a `pull_request` somente para `feature/super-admin-v2-develop`.
- `checkout` e `setup-node` fixados nos SHAs completos já confiados pelo repositório.
- Node.js 22, pnpm 10.26.0 verificado pelo Corepack e instalação com
  `--frozen-lockfile --ignore-scripts`.
- Build explícito de `shared` e check, typecheck, build e testes de `packages/api` antes do app,
  além dos gates de gateway, user-service, organization-service, audit-service, smoke coverage e
  Prisma.
- Regressão que percorre apenas fontes executáveis de browser do Super Admin e suas
  integrações diretas, incluindo `packages/api/src/client.ts` e extensões JS/TS executáveis.
  Testes, runners, symlinks, legado e artefatos de build não entram na leitura. O detector cobre
  atribuições, propriedades, setters de `Authorization` e expressões reais de `Bearer`, sem casar
  menções em prosa e sem depender de capitalização.
- O parser de eventos reconhece chaves YAML simples ou citadas, tanto em bloco quanto inline, e
  rejeita qualquer evento adicional a `pull_request`.
- Registry completo para `services/src` e smoke pareado dos três DELETE fiscais, preservando os
  contratos atuais de sucesso 200 e baixa permissão 403.
- Nenhuma dependência adicionada e nenhum serviço iniciado.

## TDD

RED confirmado com:

```text
node --test scripts/super-admin-session-regression.test.mjs
1 pass, 1 fail — expected the isolated Super Admin workflow to exist
```

GREEN confirmado com:

```text
node --test scripts/super-admin-session-regression.test.mjs scripts/supply-chain-security.test.mjs scripts/supply-chain-integrity.test.mjs
11 pass, 0 fail
```

Follow-up RED/GREEN confirmado com:

```text
node --test scripts/super-admin-session-regression.test.mjs scripts/supply-chain-security.test.mjs
RED: 6 pass, 4 fail
GREEN: 10 pass, 0 fail

corepack pnpm smoke:coverage
RED: services/src + 3 operações DELETE fiscais ausentes
GREEN: 359/361 operações OpenAPI mapeadas com expectativas pareadas

node --test scripts/all-services-smoke.test.mjs
RED: 4 pass, 1 fail — DELETE fiscal antes das operações dependentes
GREEN: 5 pass, 0 fail

review final:
node --test scripts/super-admin-session-regression.test.mjs
RED: 3 pass, 2 fail — casing lowercase e chaves YAML citadas
GREEN: 5 pass, 0 fail

corepack pnpm --filter @workspace/shared check
RED: 2 erros Biome nos dois arquivos autorizados
GREEN: 62 arquivos verificados, zero erro
```

## Gates aprovados

- `corepack pnpm install --frozen-lockfile --ignore-scripts`: lockfile atual, pnpm 10.26.0.
- `node scripts/supply-chain-integrity.mjs`: 4.300 arquivos, zero finding.
- `node scripts/pnpm-security-policy.mjs --root .`: zero finding.
- `corepack pnpm audit --audit-level moderate`: nenhuma vulnerabilidade conhecida.
- `corepack pnpm typecheck`: 22/22 pacotes.
- Typecheck escopado a `shared` e aos quatro serviços: aprovado.
- Testes escopados a `shared` e aos quatro serviços: aprovados fora do sandbox; a primeira
  tentativa foi bloqueada pela descoberta de configuração do esbuild no perfil do Windows.
- Regressões do app: session security 6/6, platform session 3/3 e Super Admin 9/9.
- Typecheck e build de produção do app: aprovados; `/super-admin` e `/super-admin/login`
  constam nas rotas geradas.
- `shared` aprovado em check, typecheck, build e 54/54 testes; `packages/api` aprovado em check,
  typecheck, build e 5/5 testes do client HTTP-only.
- Fiscal-service aprovado em typecheck, build e 71/71 testes, incluindo os contratos DELETE e a
  proteção de permissão administrativa existentes.
- Dry-run fiscal em modo fail-fast: 37 operações registradas, incluindo sucesso 200 e baixa
  permissão 403 para cada DELETE; nenhum serviço iniciado.
- Smoke coverage: 359/361 operações OpenAPI mapeadas com expectativas pareadas.
- Harness/compose security: 16/16 testes aprovados após a inclusão do legacy-api no registry.
- Schema Prisma: válido por execução direta do binário local.
- Biome escopado aos scripts alterados: aprovado.
- Graphify UI e services atualizados; os artefatos permanecem ignorados.

## Falhas basais preservadas

- `corepack pnpm check` global ainda contém dívida fora do escopo, principalmente em
  `docs/migration/v4`; o check escopado de `shared` está verde sem supressões.
- `corepack pnpm test`: falha em quatro expectativas de `rh-service` que recebem um argumento
  `undefined` adicional; o build de `services/src` também falha por cliente Prisma legado ausente
  e erros TypeScript. Os testes de política raiz passaram 67/67 antes dessas falhas.
- No Windows local, o comando exato `pnpm --filter @workspace/infra exec prisma` não localizou o
  shim do binário. O binário direto validou o schema; no workflow Linux o gate recebe uma
  `DATABASE_URL` local fictícia apenas para carregar `prisma.config.ts`, sem conexão de rede.
- Ambiente local: Node.js 24.13.1. O workflow fixa Node.js 22 como exigido.

As dívidas acima não foram alteradas porque não pertencem ao diff da Tarefa 10.

## Fora deste commit

Browser autenticado, inspeção de cookies/rede/console, screenshots, revisão final e publicação
ficam com o controlador. Nenhuma imagem foi fabricada.
