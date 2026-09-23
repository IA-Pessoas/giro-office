# Relatório — correção crítica do User Worker

## Escopo

Este ciclo ficou limitado a `workers/user-service/**`, ao forwarding/testes do
gateway em `services/gateway/src/proxy/httpProxy.ts`,
`services/gateway/src/proxy/httpProxy.test.ts` e aos testes de rota necessários
em `services/gateway/src/app.routes.test.ts`, além deste relatório. Não houve
alteração em Pessoal, migration de Reports, UI, `app/next-env.d.ts`, lockfile,
deploy ou push. Alterações concorrentes fora do escopo foram preservadas.

Neste novo ciclo focado no re-review de `a885c7b1`, não houve alteração de
fonte no Gateway; a suíte do Gateway foi executada para confirmar a paridade do
contrato já entregue.

## Correções entregues

- Gateway: mutações `POST /user`, `PUT/DELETE /user/:id`, fotos e permissões
  agora estão na regra CSRF do proxy; o `x-csrf-token` recebido no request é
  o único valor encaminhado, e sua ausência gera `403`. O vínculo secreto de
  sessão continua sendo encaminhado somente ao User Worker, que valida
  `session_id`, `session_version`, hash CSRF, usuário e organização no banco.
- PUT: troca de senha incrementa `session_version` junto com a atualização
  otimista de `version`, invalidando sessões antigas. Downgrade de `type`
  normaliza a permissão, zera todos os módulos não aplicáveis e preserva
  somente os módulos self-service legados (`rh`/`ti`) e, para `admin`, o
  módulo do departamento; também revoga a versão da sessão. A checagem de
  último owner ativo ocorre dentro da transação serializável antes da mutação.
- Re-review de ownership: desativação, PUT/downgrade e transferência exigem
  `$transaction` com `isolationLevel: "Serializable"` quando executados no
  Worker. A contagem de owners e o UPDATE otimista estão no cliente
  transacional; ausência do mecanismo não cai para uma mutação insegura e
  retorna `503`.
- Transferência: o usuário que perde ownership tem sua linha de permissões
  normalizada em todos os módulos ativos, com `rh`/`ti` e módulo departamental
  somente quando o novo estado `admin` ativo os permite. Em transferência com
  desativação, todos os módulos são zerados. A permissão e a invalidação da
  sessão participam da mesma transação.
- Permissões: `PUT /user/permission/:userId` e a variante de plataforma agora
  atualizam módulos e incrementam `session_version` no mesmo callback
  serializável. Falha no segundo UPDATE propaga erro e deixa o rollback a
  cargo do Prisma, sem responder sucesso parcial.
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
- novo ciclo: 4 falhas — foto aceitava token ausente/forjado, desativação
  contava owners fora da transação, transferência preservava módulos não
  óbvios e permissões/session_version eram atualizadas fora de transação.

GREEN após os slices verticais:

- `pnpm --filter @workspace/user-worker test`: **45/45 testes passando**;
- `pnpm --filter @workspace/gateway test -- --reporter=dot`:
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
- `pnpm --filter @workspace/user-worker exec wrangler deploy --dry-run --config wrangler.jsonc`:
  passou, sem publicação, listando somente `AUDIT_SERVICE`; a ausência de
  Hyperdrive continua deliberadamente bloqueante para runtime de banco;
- `git diff --check`: passou.

## Lacunas reais restantes

- Não existe ID/configuração de Hyperdrive autorizado no workspace. O dry-run
  valida o bundle, mas não prova deploy funcional de banco; provisionamento e
  binding de produção continuam bloqueados até autorização externa.
- A garantia de concorrência foi validada por testes com cliente transacional
  separado e opção `Serializable`; não houve teste de integração contra um
  PostgreSQL real sob concorrência.
- Não houve smoke autenticado contra PostgreSQL/Supabase real, bucket Supabase
  real ou `AUDIT_SERVICE` remoto; os testes usam seams HTTP/Prisma/bindings
  fakes.
- Auditoria continua best-effort: agora falhas são observáveis, mas a
  transação de mutação não é revertida quando o serviço de auditoria falha,
  conforme o legado.
- Nenhum deploy, publicação ou push foi executado.

## Commits

- Commit de código: `a885c7b1 fix(user-worker): close critical parity blockers`.
- Commit de código deste ciclo: `19c27872 fix(user-worker): close ownership transaction gaps`.
- Commit separado deste relatório: será registrado após este update final.

Histórico anterior relacionado: `ade440f4`, `ad4cf112`, `c3d0eab4`,
`620cfbc7c`, `1750e6eef`.
