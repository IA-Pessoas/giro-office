# Tarefa 10 — CI isolada e regressões versionadas

Data: 2026-08-24

## Entrega

- Workflow dedicado a `pull_request` somente para `feature/super-admin-v2-develop`.
- Node.js 22, pnpm 10.26.0 verificado pelo Corepack e instalação com
  `--frozen-lockfile --ignore-scripts`.
- Gates de supply chain, `shared`, gateway, user-service, organization-service,
  audit-service, smoke coverage, Prisma e app.
- Regressão que percorre apenas fontes executáveis de browser do Super Admin e suas
  integrações diretas. Testes, runners `.mjs`, symlinks e artefatos de build não entram na
  leitura.
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

## Gates aprovados

- `corepack pnpm install --frozen-lockfile --ignore-scripts`: lockfile atual, pnpm 10.26.0.
- `node scripts/supply-chain-integrity.mjs`: 4.298 arquivos, zero finding.
- `node scripts/pnpm-security-policy.mjs --root .`: zero finding.
- `corepack pnpm audit --audit-level moderate`: nenhuma vulnerabilidade conhecida.
- `corepack pnpm typecheck`: 22/22 pacotes.
- Typecheck escopado a `shared` e aos quatro serviços: aprovado.
- Testes escopados a `shared` e aos quatro serviços: aprovados fora do sandbox; a primeira
  tentativa foi bloqueada pela descoberta de configuração do esbuild no perfil do Windows.
- Regressões do app: session security 6/6, platform session 3/3 e Super Admin 9/9.
- Typecheck e build de produção do app: aprovados; `/super-admin` e `/super-admin/login`
  constam nas rotas geradas.
- Schema Prisma: válido por execução direta do binário local.
- Biome escopado aos dois scripts alterados: aprovado.
- Graphify UI e services atualizados; os artefatos permanecem ignorados.

## Falhas basais preservadas

- `corepack pnpm check`: 68 erros, 35 warnings e 3 infos preexistentes, principalmente em
  `docs/migration/v4`; também há formatação pendente em `shared/src/auth/token.ts` e imports em
  `shared/tests/module-permissions.test.ts`.
- `corepack pnpm smoke:coverage`: `services/src` ausente do registry e operações fiscais
  `DELETE /fiscal/ncm`, `DELETE /fiscal/icms` e `DELETE /fiscal/ipi` ausentes do manifesto.
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
