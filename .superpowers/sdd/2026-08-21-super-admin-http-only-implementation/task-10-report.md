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

review formatter final:
check conjunto de shared, user, organization, audit e gateway
RED: 6 erros mecânicos no user-service e 1 no gateway
GREEN: 204 arquivos verificados nos cinco pacotes, zero erro
```

## Gates aprovados

- `corepack pnpm install --frozen-lockfile --ignore-scripts`: lockfile atual, pnpm 10.26.0.
- `node scripts/supply-chain-integrity.mjs`: 4.300 arquivos, zero finding.
- `node scripts/pnpm-security-policy.mjs --root .`: zero finding.
- `corepack pnpm audit --audit-level moderate`: nenhuma vulnerabilidade conhecida.
- `corepack pnpm typecheck`: 22/22 pacotes.
- Typecheck escopado a `shared` e aos quatro serviços: aprovado.
- Checks completos de `shared`, user-service, organization-service, audit-service e gateway:
  aprovados após formatação/organização de imports estritamente mecânica em sete arquivos.
- Testes escopados a `shared` e aos quatro serviços: aprovados fora do sandbox; a primeira
  tentativa foi bloqueada pela descoberta de configuração do esbuild no perfil do Windows.
- Suítes completas pós-formatação: user-service 148/148 e gateway 281/281.
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

## Prova de navegador do controlador

- O app Next real foi reconstruído e iniciado em modo produção com a topologia same-origin `/api` e
  CSP intacta. Como o host não possui Docker, PostgreSQL ou arquivos `.env`, um gateway HTTP local
  mínimo forneceu apenas respostas e dados fictícios; as implementações reais dos serviços seguem
  cobertas pelas suítes de integração acima. Esta evidência visual não é apresentada como E2E de
  banco.
- Fluxo Playwright: login de plataforma `200`, organizações `200`, usuários do tenant `200`,
  auditoria global `200` e logout `200`. Os únicos `401` foram as sondagens esperadas de `/user/me`
  e `/platform/me` antes da autenticação; não houve `403`, `500` ou `502` inesperado.
- O navegador confirmou `cw.session` com `httpOnly: true` e `SameSite=Lax`; `document.cookie`
  retornou somente `cw.csrf`. Nenhum token apareceu em localStorage ou sessionStorage. O logout
  enviou `x-csrf-token`, retornou ao login e removeu ambos os cookies.
- A bancada HTTP local não marca cookies como `Secure`; os atributos de produção continuam
  verificados pelas suítes de cookie/gateway e pelo código configurado para produção.
- Screenshots com dados exclusivamente fictícios:
  `docs/evidence/issue-869/super-admin-login.png` e
  `docs/evidence/issue-869/super-admin-console.png`.

## Hardening pós-revisão final

- O token gateway → user-service tornou-se exclusivo, obrigatório em produção e diferente do
  `AUDIT_SERVICE_TOKEN`; o login direto exige esse token e possui uma segunda barreira local de
  rate limit.
- Gateway, web e reverse proxy só publicam portas no loopback nos manifests VPS/slots. Cookies
  inseguros falham no bootstrap de produção e a documentação proíbe login de plataforma em HTTP.
- O bootstrap normaliza/valida e-mail, exige senha de pelo menos 16 caracteres e rejeita padrões
  comuns, repetidos, sequenciais e exclusivamente numéricos.
- O OpenAPI agregado não expõe o token interno e mantém `POST /platform/session` público, enquanto
  refresh/logout continuam protegidos.
- O limitador em memória remove a chave mais antiga em O(1). A busca de rota de auditoria usa GIN
  trigram criado com `CONCURRENTLY`, e o recorder aborta chamadas indisponíveis após 5 segundos.
- Gates frescos: shared 56/56, gateway 284/284, user-service 161/161,
  organization-service 22/22, audit-service 23/23 (+1 opt-in skip), Compose/Nginx 10/10,
  regressão/supply-chain 15/15, scanner 4.304 arquivos/0 achados, política pnpm 0 achados e
  `pnpm audit` sem vulnerabilidades conhecidas.

A limitação da prova visual permanece explícita: este host não possui Docker, PostgreSQL, WSL ou
arquivos de ambiente. Instalar infraestrutura ou executar código externo só para a screenshot
ampliaria a superfície de supply chain; por isso a integração real fica coberta pelas suítes dos
serviços/contratos e o navegador usa apenas o mock efêmero documentado, sem ser chamado de E2E de
banco.
