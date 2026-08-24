# Tarefa 6 — Gateway default-deny, antiforja, rate limit e CSRF

## Entrega

- O gateway publica `POST /platform/session` e protege refresh, logout, identidade, organizações,
  usuários globais e o roteamento de auditoria com política explícita `platformOnly`.
- Sessões de plataforma usam somente cookie HttpOnly. Bearer de navegador é recusado, identidade
  organizacional não entra em `/platform/**` e identidade de plataforma não entra em rotas
  organizacionais.
- Todos os headers forjáveis de identidade são removidos. O proxy reconstrói apenas `userId`,
  `auth_kind=platform` e `platform_role=super_admin` derivados dos claims verificados; não publica
  organização, permission, type ou modules de uma identidade de plataforma.
- Downstreams protegidos do user-service e organization-service exigem simultaneamente identidade
  derivada, token interno do gateway e sessão persistida válida. Headers `x-auth-*` isolados nunca
  autorizam acesso.
- O encaminhamento de cookies usa allowlist de método, path e nome: apenas `cw.session` nas leituras
  que precisam revalidar a sessão e `cw.session` + `cw.csrf` no refresh/logout. Cookies irrelevantes
  e cookies de plataforma fora dessa allowlist não chegam ao upstream.
- `Set-Cookie` de upstream só é aceito em criação, rotação ou encerramento de sessão de usuário ou
  plataforma e só para `cw.session`/`cw.csrf`. O gateway não expõe
  `/platform/session/validate`; a validação direta permanece exclusivamente server-side com token
  interno.
- Login de usuário, bootstrap e login de plataforma têm rate limit exato, sem consumir o orçamento
  de refresh. O gateway só confia em um hop no deploy de produção e em nenhum proxy no fluxo
  local/teste; o Nginx substitui `X-Forwarded-For` pelo IP remoto, e o armazenamento em memória do
  limiter é limitado a 10.000 chaves, expurga expirados sob pressão e remove a chave mais antiga
  quando necessário. Refresh/logout exigem double-submit CSRF.
- O bypass de `PUT /user/:id` para o próprio usuário só vale para principal organizacional com
  organização válida. Principal de plataforma recebe 403 antes de alcançar o user-service.
- Auditoria de requests da plataforma persiste `organizationId: null`, `userId: null` e metadata
  com `auth_kind=platform` e `platform_user_id`, evitando foreign key indevida para usuário
  organizacional.
- OpenAPI agregado usa somente `cookieAuth` nas rotas de plataforma e omite a validação interna.

## Ampliação integradora autorizada

O ruling de segurança exigiu alterações mínimas em arquivos produzidos pelas Tarefas 3 e 5:

- `user-service`: refresh, logout, `/platform/me` e usuários globais agora exigem o token interno e
  a identidade derivada antes de revalidar cookie/JWT/sessão persistida.
- `organization-service`: a consulta global exige a mesma barreira e confere que o usuário
  encaminhado coincide com o JWT; `AUDIT_SERVICE_TOKEN` tornou-se configuração obrigatória e, em
  produção, precisa ser não-default e ter ao menos 32 caracteres. Desenvolvimento continua
  aceitando o valor local padrão.
- Smoke: removidas as isenções temporárias das rotas públicas de plataforma. O runner cobre login,
  credencial inválida, refresh, CSRF ausente, identidade, organizações, usuários, logout e negativas
  401. As únicas isenções de sessão mantidas são as validações internas diretas justificadas.
- Deploy/docs: documentados o token interno do organization-service e a fronteira gateway-only.

Não foram adicionados fallback legado, contexto de suporte, bypass, dependência ou mutação global.

## RED / GREEN

- RED gateway: 20 falhas esperadas cobriram seleção do validador, Bearer de plataforma, antiforja,
  roteamento, default-deny/policy coverage, atividade, CSRF, rate limit, `Set-Cookie` e auditoria.
- RED user-service: 5 falhas esperadas provaram que headers forjados ainda alcançavam rotas
  protegidas sem token interno.
- RED organization-service: 3 falhas esperadas provaram a mesma lacuna no downstream global.
- RED da revisão: pathname inseguro/trailing slash/método errado falhou no registry e nas allowlists;
  XFF forjado contornou o login limiter; o mapa ignorou o limite de chaves; principal de plataforma
  alcançou o proxy no self-PUT; e a organization-service aceitou tokens default/curto em produção.
- GREEN completo final: gateway 281/281, user-service 148/148, organization-service 22/22 e shared
  54/54.

## Validações

- Typecheck: gateway, user-service, organization-service e shared aprovados.
- Biome escopado: todos os 34 arquivos de código modificados pela Tarefa 6 e sua revisão aprovados;
  organization-service completo, 23 arquivos, aprovado.
- Harness completo: 63/63, incluindo o contrato de substituição de `X-Forwarded-For` nos dois
  listeners gerados do Nginx.
- `git diff --check`: aprovado.
- Smoke dry-run da plataforma: 13 operações, incluindo negativas 401/403, sem handler ausente.
- Graphify services atualizado: 6.147 nós, 9.531 arestas e 382 comunidades.
- Ambiente local em Node 24 emitiu aviso porque o workspace declara Node 22; não houve falha de
  teste ou typecheck decorrente disso.

## Débitos basais fora do diff

- `pnpm smoke:coverage` continua falhando somente por `services/src` ausente do registry e por
  `DELETE /fiscal/ncm`, `DELETE /fiscal/icms` e `DELETE /fiscal/ipi` sem operação no manifesto.
  Nenhuma rota da plataforma permanece ausente e nenhuma isenção temporária foi criada.
- O check completo do gateway mantém um erro de formatação em arquivo não alterado por esta tarefa:
  `src/test/routeClassification.test.ts`.
- O check completo do user-service mantém seis erros de formatação/imports em arquivos não
  alterados por esta tarefa: `permission.routes.ts`, `user.routes.ts`, `permission.schemas.ts`,
  `bootstrapPlatformAdmin.ts`, `permissionService.ts` e `bootstrapPlatformAdmin.test.ts`.
- O check completo do shared mantém dois erros de formatação/imports em arquivos não alterados por
  esta tarefa: `src/auth/token.ts` e `tests/module-permissions.test.ts`.

## Limite com a Tarefa 7

Conforme o plano e o ruling 6 → 7, a Tarefa 6 registra e protege o roteamento
`GET /platform/audit/requests`, mas o audit-service ainda responde 401 ao contexto global. A
autorização e a busca global sem filtro organizacional pertencem à Tarefa 7 e exigem commit e
revisão separados. Nenhum arquivo do audit-service foi alterado nesta tarefa.

## Commits

- `aba35c46 feat(gateway): enforce platform default deny`
- `27c2d37f fix(gateway): normalize session cookie allowlists`
- `99305ba0 fix(gateway): harden proxy rate limiting`
- `451c4b7f fix(gateway): restrict self updates to organization users`
- `85ef3d3b fix(organization): validate audit token in production`
