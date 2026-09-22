# Relatório — correção crítica do User Worker

## Escopo

Este ciclo ficou limitado a `workers/user-service/**`, ao forwarding/testes do
gateway em `services/gateway/src/proxy/httpProxy.ts`,
`services/gateway/src/proxy/httpProxy.test.ts` e aos testes de rota necessários
em `services/gateway/src/app.routes.test.ts`, além deste relatório. Não houve
alteração em Pessoal, migration de Reports, UI, `app/next-env.d.ts`, lockfile,
deploy ou push. Alterações concorrentes fora do escopo foram preservadas.

## Correções entregues

- Gateway: mutações `POST /user`, `PUT/DELETE /user/:id`, fotos e permissões
  agora estão na regra CSRF do proxy; o `x-csrf-token` recebido no request é
  o único valor encaminhado, e sua ausência gera `403`. O vínculo secreto de
  sessão continua sendo encaminhado somente ao User Worker, que valida
  `session_id`, `session_version`, hash CSRF, usuário e organização no banco.
- PUT: troca de senha incrementa `session_version` junto com a atualização
  otimista de `version`, invalidando sessões antigas. Downgrade de `type`
  normaliza a permissão, limpa módulos não aplicáveis e preserva somente os
  módulos self-service legados (`rh`/`ti` quando cabível); também revoga a
  versão da sessão. A checagem de último owner ativo ocorre dentro da
  transação serializável antes da mutação.
- Fotos: `Fotos` precisa ser privado; o Worker verifica o bucket, grava apenas
  o caminho do objeto e devolve URL assinada com TTL de 3600 segundos. URLs
  públicas legadas são convertidas para o caminho do objeto quando possível,
  sem devolver `/public/`; falhas de bucket ou assinatura retornam erro
  observável. A leitura só assina caminho pertencente ao usuário solicitado.
- Auditoria: binding ausente, token ausente, resposta não-2xx e falha de
  comunicação geram `console.warn` observável e testes; a mutação continua
  best-effort somente porque esse é o contrato legado atual. Não foi criado
  outbox transacional.
- Runtime: `withDb` não usa fallback `DATABASE_URL` no Worker e retorna `503`
  sem `HYPERDRIVE`. Não foi encontrado ID autorizado no repositório; por isso
  `wrangler.jsonc` contém guard explícito `BLOCKED`, sem inventar ID/credencial.
  O binding deverá ser adicionado na configuração de deploy quando provisionado.
- Hash: Argon2id e bcrypt legado continuam verificáveis no adapter Worker;
  login válido com bcrypt regrava condicionalmente o hash para Argon2id por
  `id + password`, sem invalidar sessões existentes.
- Contratos anteriores permanecem cobertos: `POST /user`,
  `POST /user/start-config`, departamento cross-tenant e usuários legados com
  `organization_id` nulo quando o departamento vincula à organização.

## TDD deste ciclo

RED antes da implementação:

- proxy: 12 falhas — 6 mutações User não encaminhavam o token real e 6 não
  rejeitavam CSRF ausente;
- Worker: 6 falhas — senha sem incremento de sessão, downgrade sem
  normalização, último owner aceito, foto pública, upload sem guard de bucket
  privado e bucket público aceito;
- entrypoint: 2 falhas — auditoria silenciosa e ausência do guard Hyperdrive;
- bcrypt: 1 falha — login legado não rehashava.

GREEN após os slices verticais:

- `pnpm --filter @workspace/user-worker test`: **41/41 testes passando**;
- `pnpm --filter @workspace/gateway exec vitest run --maxWorkers=1`:
  **521/521 testes passando em 25 arquivos**.

## Validação

- Worker `typecheck`: passou;
- Worker `build`: passou;
- Worker `check`: passou;
- gateway `typecheck`: passou;
- gateway `build`: passou;
- gateway `check`: passou;
- `pnpm graphify:context:services`: passou antes da edição;
- `pnpm graphify:update:services`: passou depois da edição; grafo atualizado
  (9.296 nós, 16.931 arestas; visualização HTML omitida pelo limite local de
  5.000 nós);
- `pnpm exec wrangler --version`: `4.135.0`;
- `pnpm exec wrangler deploy --dry-run --config workers/user-service/wrangler.jsonc`:
  passou, sem publicação, listando somente `AUDIT_SERVICE`; a ausência de
  Hyperdrive continua deliberadamente bloqueante para runtime de banco;
- `git diff --check`: passou.

## Lacunas reais restantes

- Não existe ID/configuração de Hyperdrive autorizado no workspace. O dry-run
  valida o bundle, mas não prova deploy funcional de banco; provisionamento e
  binding de produção continuam bloqueados até autorização externa.
- Não houve smoke autenticado contra PostgreSQL/Supabase real, bucket Supabase
  real ou `AUDIT_SERVICE` remoto; os testes usam seams HTTP/Prisma/bindings
  fakes.
- Auditoria continua best-effort: agora falhas são observáveis, mas a
  transação de mutação não é revertida quando o serviço de auditoria falha,
  conforme o legado.
- Nenhum deploy, publicação ou push foi executado.

## Commits

- Commit de código: `a885c7b1 fix(user-worker): close critical parity blockers`.
- Commit separado deste relatório: será registrado após este update final.

Histórico anterior relacionado: `ade440f4`, `ad4cf112`, `c3d0eab4`,
`620cfbc7c`, `1750e6eef`.
