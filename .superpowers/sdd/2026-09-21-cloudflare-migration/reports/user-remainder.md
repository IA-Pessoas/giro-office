# Relatório — restante de User no Worker

## Escopo

Implementação limitada a `workers/user-service/**`, comparando as rotas de User, autenticação de plataforma, usuários de plataforma e reporting interno do serviço Express. Não houve alteração em `services/**`, gateway, UI ou `app/next-env.d.ts`; alterações concorrentes fora de User foram preservadas.

## Rotas migradas

- `POST /user/session`, `POST /user/session/refresh`, `DELETE /user/session`, `GET /user/session/validate` e `GET /user/me`.
- Listagem, detalhe, permissões, atualização, desativação e fotos de usuários da organização (`/user` e `/user/:id...`), com escopo por organização, CSRF em mutações e revogação por `session_version`.
- `POST /platform/session`, `POST /platform/session/refresh`, `DELETE /platform/session`, `GET /platform/me` e `POST /platform/session/validate`.
- Usuários da plataforma: ownership transfer, criação, detalhe, permissões, departamentos, listagem, atualização, desativação e reativação.
- `POST /internal/reporting/access-context`, exigindo `REPORTS_INTERNAL_TOKEN` dedicado.

As sessões mantêm cookies de sessão/CSRF, claims, rotação de CSRF, expiração, revogação no banco e invalidação por versão. As rotas protegidas de plataforma exigem token interno, identidade encaminhada `platform`, papel `super_admin` e id do ator. Quando o gateway encaminha identidade junto com cookies, o cookie do navegador continua tendo precedência para validar a sessão e a revogação no banco.

O schema Prisma mínimo foi ajustado somente para refletir tabelas existentes necessárias ao contrato: relação `Organization`–`Department`/`User` e `PlatformUser.password`. Não foi criada migration, tabela D1 ou campo fora do schema de origem.

## TDD

RED observado antes dos ajustes de produção:

- rodada de rotas de login/autorização: 15 testes, 12 passando e 3 falhando — login de organização ausente, login de plataforma sem a proteção esperada e cookie de plataforma aceito sem gateway;
- token de reporting dedicado: 15 testes, 1 falhando (`403` com `REPORTS_INTERNAL_TOKEN` configurado);
- sessão de plataforma atrás do gateway: 18 testes, 1 falhando (`401` no refresh porque o Worker priorizava os headers encaminhados e não validava o cookie).
- fotos no Worker: 17 testes, 2 falhando com `404` antes dos handlers de leitura/upload/remoção;
- suspensão de organização: 19 testes, 1 falhando com `200` antes da validação do status da organização;
- login para organização suspensa: 20 testes, 1 falhando com `200` antes da validação do vínculo ativo.

GREEN observado:

- `pnpm --filter @workspace/user-worker test`: **20/20 testes passando**;
- refactor de imports/formatação com Biome e nova execução de check: **passou**.

## Validação

- `pnpm --filter @workspace/user-worker typecheck`: **passou**;
- `pnpm --filter @workspace/user-worker build`: **passou**;
- `pnpm --filter @workspace/user-worker check`: **passou**;
- `pnpm exec wrangler deploy --dry-run --config workers/user-service/wrangler.jsonc`: **passou**, upload estimado de 5852.08 KiB (1916.45 KiB gzip), apenas `AUDIT_SERVICE`, sem publicação;
- `pnpm graphify:update:services`: **passou**;
- `git diff --check`: **passou**;
- `git grep` de `service-role`, `service_role` e `SUPABASE_SERVICE_ROLE_KEY` em `workers/user-service`: **nenhuma ocorrência**; fotos dependem apenas de adapter explícito e não levam segredo ao bundle;
- `pnpm test` na raiz: scripts passaram, mas a suíte completa foi bloqueada antes das suítes pelo `@workspace/client-service#prisma:generate`, que não consegue resolver `DATABASE_URL`. Isso é limitação de configuração externa e não foi tratado como sucesso do workspace.

## Lacunas registradas

- O Worker não possui adapter compatível com os hashes Argon2id primários e bcrypt legado do serviço Node. O login e a criação/alteração de senha não usam fallback inseguro: sem `verifyPassword`/hash adapter injetado, o login responde `501`; a rota de criação de usuário de plataforma e alterações de senha permanecem explicitamente sem sucesso. Os testes usam apenas adapter injetado.
- `POST /user` (criação organizacional) e `/user/start-config` não foram mascarados com resposta 200, pois exigem o mesmo adapter de hash e, no segundo caso, contrato de bootstrap não comprovado no schema mínimo.
- Fotos têm leitura por URL pública e handlers de upload/remoção via adapter `storage` explícito. O entrypoint de produção não injeta esse adapter; sem ele as mutações respondem `503`. Não foi incluído `service-role` nem segredo equivalente no bundle.
- Não houve teste autenticado contra PostgreSQL/Supabase real nem smoke do binding `AUDIT_SERVICE`. Também não houve deploy.

## Commit

- `ade440f4 feat(user-worker): migrate remaining user routes`
- `ad4cf112 fix(user-worker): preserve organization auth checks`

Nenhum deploy ou push foi executado.
