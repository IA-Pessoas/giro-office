# Inventário de contratos de permissões modulares 0–3

Inventário da issue [#563](https://github.com/IA-Pessoas/giro-office/issues/563), filha de
[#562](https://github.com/IA-Pessoas/giro-office/issues/562) e relacionado à matriz de
[#551](https://github.com/IA-Pessoas/giro-office/issues/551).

## Escopo e método

- **Snapshot analisado:** `365db4830de1858a3572004472a44d269b123602` (`origin/develop` em
  2026-07-27).
- **Fonte da verdade:** issue #563, issue-pai #562, matriz #551 e código real do snapshot.
- **Estado do tracker:** #563 estava aberta, sem comentários e sem blockers; bloqueia #564, #565 e
  #566, enquanto #567 é a validação/rollout relacionado. Esses vínculos foram consultados antes da
  implementação.
- **Busca:** `infra/prisma`, `services`, `shared`, `packages/api`, `app` e `scripts`, com foco em
  `Permission`, `modules`, `permission`, JWT, headers, sessão, auditoria e nos módulos aposentados.
- **Limite desta issue:** este arquivo registra o estado atual, consumidores, contratos, gaps e
  dependências. Não altera migration, significado de permissão, backend ou frontend.
- **Graphify:** a primeira tentativa dos contextos falhou por ausência de dependências/grafos no
  worktree; após instalar o que estava disponível, os grafos de UI e services foram atualizados por
  AST local. A descoberta manual continuou sendo a fonte dos fatos deste documento.

## Decisões que o inventário deve preservar

A matriz de autorização de #551 e #562 continua sendo a decisão de produto para as issues
seguintes:

| Nível alvo | Significado | Regra funcional a preservar |
| ---: | --- | --- |
| `0` | Sem acesso | Nenhum módulo ou ação modular, salvo self-service explicitamente modelado. |
| `1` | Visualizador | Leitura permitida; nenhuma mutação fora das exceções definidas pelo domínio. |
| `2` | Usuário | Leitura e mutações de usuário; sem administração de módulo. |
| `3` | Administrador do módulo | Administração do módulo conforme sua política. |
| `owner` | Bypass global | Única exceção global e único ator autorizado a gerir permissões de terceiros. |

As regras transversais são: o nível modular persistido é a fonte de verdade para não-`owner`,
departamento e `user.permission` não elevam acesso implicitamente, a organização ativa isola a
avaliação e concessões automáticas precisam persistir o nível correspondente.

## Matriz de contratos e consumidores

| Camada | Arquivo/contrato | Módulo/campo | Valores atuais | Leitura/escrita | Política atual | Testes existentes | Alteração dependente |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Banco/Prisma | `infra/prisma/schema.prisma`, model `Permission` | `certificado`, `comercial`, `contabil`, `financeiro`, `fiscal`, `integracao`, `marketing`, `parcelamento`, `pessoal`, `regularize`, `rh`, `ti`, `triagem`, além de `atendimento`, `pec`, `wiki` | Todas as 16 colunas são `Int?`; `null` ainda representa ausência | Prisma lê e escreve as colunas; `organization_id` participa da identidade da permissão | Não há limite `0..3` no model | Não há teste de constraint da tabela no snapshot | #564 deve definir a lista final, `null → 0`, `+1` para valores antigos e constraint/default |
| Banco/migration | `infra/prisma/migrations/20250416190709_permissions/migration.sql` | Criação da tabela `permissions` | Colunas inteiras anuláveis; inclui os três módulos aposentados | Criação inicial somente | Sem default ou check de faixa | Harnesses de migration existentes não cobrem esta transformação | #564 deve criar migration idempotente e ensaiar contagens/rollback |
| Seed | `infra/prisma/seed.ts` | Todos os campos do objeto `permissionsData` | Seed usa `0`, `1`, `2`, `3` e popula também `atendimento`, `pec`, `wiki` | Escreve linhas por usuário e organização | Dados de seed ainda não refletem a remoção dos módulos | Seed não é uma asserção de contrato | #564 deve remover campos aposentados e tornar `0` explícito nos ativos |
| Serviço legado | `services/src/src/services/UserService.ts`, `services/src/src/routes/users.routes.ts` | Todos os campos, incluindo `atendimento`, `pec`, `wiki` | Aceita, grava, retorna e compara `null` | `POST /permission`, `GET /permission`, `POST/PATCH` de usuário e `GET/PUT` de permissionamento legado | Usa `null` como sem acesso; busca o primeiro registro sem exigir organização em vários caminhos | Não há cobertura equivalente à suíte do `user-service` atual | #565 deve confirmar se esse runtime ainda é servido; se for, alinhar ou retirar o contrato legado |
| Serviço atual | `services/user-service/src/schemas/permission.schemas.ts` | Body de atualização e query `modulo` | Aceita `null` ou inteiro `0..3`; rejeita chaves aposentadas | Valida `GET/PUT /user/permission/:userId` e módulos de criação/edição | Chaves aposentadas são rejeitadas; `null` ainda é válido | `permission.routes.test.ts`, `user.routes.test.ts` | #565 deve rejeitar `null` e aceitar somente chaves/níveis finais |
| Serviço atual | `services/user-service/src/services/permissionService.ts` | `MODULE_FIELDS` e `PERMISSION_PUBLIC_SELECT` | Campos ativos retornam `number | null`; registro novo nasce sem valores explícitos | Lê por `user_id` + `organization_id` quando fornecida e atualiza campos conhecidos | `modulo` com `null` gera `403`; não há auditoria/invalidação nesta classe | `permissionService.test.ts`, `permission.routes.test.ts` | #565 deve persistir `0..3`, restringir autorização ao `owner` e emitir auditoria/invalidação |
| Serviço atual | `services/user-service/src/services/authService.ts` | `MODULE_PERMISSION_KEYS`, login e `LoginResult.modules` | Chave ausente vira `null`; JWT contém `number | null`; registro da organização ativa é escolhido | `POST /user/session` lê `permissions` filtrando `organization_id` | `authService.test.ts`, `auth.routes.test.ts` | #565 deve normalizar omitido para `0`, não propagar `null` e definir a estratégia de revogação |
| Contrato HTTP | `services/user-service/src/routes/auth.routes.ts`, `permission.routes.ts`, `user.routes.ts` | `/user/session`, `/user/me`, `/user/permission/:userId`, `/user`, `/user/:id` | Payloads atuais misturam `null`, níveis `0..3` e `user.permission` global | Rotas de sessão, leitura/edição de usuários e leitura/edição modular | Gateway e `requireManageUsersAuth` fazem parte da barreira; o service também valida entrada | Testes de rota do `user-service` | #565 deve alinhar rotas, service, OpenAPI e auditoria |
| OpenAPI/docs | `services/user-service/src/openapi/spec.ts`, `services/user-service/API.md`, gateway OpenAPI | Schema `modules`, exemplos e resposta de permissões | OpenAPI usa `additionalProperties: integer|null`; docs têm exemplos históricos divergentes | Produz documentação pública e contrato agregado | A documentação não é uma validação runtime | Testes de OpenAPI por service e gateway | #565 deve remover `null`, módulos aposentados e ambiguidades dos exemplos |
| Shared JWT | `shared/src/auth/token.ts`, `shared/src/auth/types.ts` | Claims `modules`, `permission`, `type`, `organization_id` | `modules` aceita qualquer número ou `null`; `permission` só é validado como `number` | Lê token Bearer e entrega `AuthContext` | Não valida faixa, conjunto de chaves, organização ou revogação | `shared/tests/auth-policy.test.ts` cobre políticas, não o contrato 0–3 completo | #565 deve centralizar tipo/normalização e invalidar sessão alterada |
| Shared policy | `shared/src/auth/policy.ts` | `hasRequiredPermission`, `modulePermission`, `anyModulePermission` | Global admin legado é `permission >= 2` sem `type`; owner explícito também bypassa | Usado pelo gateway/políticas compartilhadas | Permissões modulares são comparadas por mínimo; bypass legado ainda existe | `shared/tests/auth-policy.test.ts` | #565 deve preservar somente o bypass `owner` conforme #551/#562 |
| Gateway headers/proxy | `shared/src/http/headers.ts`, `services/gateway/src/proxy/httpProxy.ts` | `x-auth-user-id`, `x-auth-organization-id`, `x-auth-permission`, `x-auth-type`, `x-auth-modules` | Header modular serializa `number|null`; fallback global legado usa mínimo `2` | Gateway remove headers fornecidos pelo cliente e reenvia claims autenticados aos upstreams | `permissionModule` prefere nível modular, mas owner/admin legado pode cair no global | `services/gateway/src/app.routes.test.ts`, `routeUtils.test.ts` | #565 deve limitar headers a `0..3`, organização ativa e owner explícito |
| Gateway policy | `services/gateway/src/security/policies.ts`, `shared/src/auth/policy.ts` | Rotas `/client`, `/pessoal`, `/rh` e gestão de usuários | Mínimo modular atual é `1`; `/client` aceita qualquer de `comercial`, `contabil`, `financeiro`, `fiscal`, `integracao`, `pessoal`, `regularize` | Política é aplicada antes do proxy; URLs não autorizadas não chegam ao upstream | Gestão aceita owner, admin global legado ou RH `>=2`; módulo aposentado `atendimento` já foi removido desta lista | `app.routes.test.ts`, `auth-policy.test.ts` | #565 deve revisar cada rota/ação contra a matriz final e #551 |
| Upstreams | Middlewares `isAuthenticated` e `require*Permission` dos services atuais | `request.permission`, `request.modules`, `rh_permission`, `certificadoPermission` e contexto TI | Vários parsers aceitam `null`, ausência ou `Number(...)`; serviços TI/RH usam mínimos próprios | Recebem JWT ou headers internos; alguns serviços ainda interpretam `permission` global | A autoridade está fragmentada entre gateway, service e políticas específicas | Testes unitários/rotas por service, sem matriz transversal completa | #565 deve catalogar e alinhar todos os leitores sem trocar `user.permission` global |
| Frontend auth | `app/src/modules/auth/utils/moduleAccess.ts`, `sessionToken.ts`, `permissions.ts`, `canSSRAdmin.ts` | `MODULE_KEYS`, `AccessLevel`, `APP_ROUTE_MODULE_MAP`, token e guards | `0=view`, `1=edit`, `2=admin`; token inválido/ausente vira `null`; departamento e módulo adicional podem conceder | Calcula menus, módulos, ações e SSR; `AppShell` bloqueia URL direta com estado de acesso negado | `isGlobalAdmin` dá admin global; departamento pode somar acesso modular; `owner` é tratado em pontos distintos | `app/src/modules/auth/run-auth-tests.mjs` e testes de módulos | #566 deve usar `0=none`, `1=view`, `2=user`, `3=admin`, owner único bypass e snapshot por organização |
| Frontend estado | `app/src/context/AuthContext.tsx`, `app/src/modules/auth/store/accessStore.ts`, hooks de acesso | Snapshot de usuário, organização, módulo e loading | `modules?: Record<string, number|null>`; mudança de usuário/organização depende do sync/reset atual | Store deriva mapa de acesso e `AppShell` oculta módulos/ações | A origem pode ser token/`/user/me`; não há marcação de sessão revogada observável no contrato | `run-auth-tests.mjs`, testes de páginas/módulos | #566 deve descartar snapshot anterior na troca de organização e tratar sessão obsoleta |
| Frontend usuários | `app/src/modules/users/constants/permissionConfig.ts`, `types/index.ts`, `utils/permissionUtils.ts`, `utils/createUserPayload.ts`, `services/permissionService.ts` | Seletor, tipos e payloads modulares | Opções atuais são `null`, `0`, `1`, `2`; `PermissionLevel = 0|1|2`; extras normalizados para `null` | Criação/edição de usuário e `PUT /user/permission/:userId` | UI já omite aposentados, mas ainda envia `null` para conhecido/extra; edição depende de regras de RH/owner | `app/src/modules/users/run-users-tests.mjs` | #566 deve exibir exatamente quatro opções `0..3`, enviar `0` e manter somente owner para gestão |
| Frontend superfícies | `app/src/shared/components/newLayout/AppShell.tsx` e shells de `certificado`, `fiscal`, `pessoal`, `rh`, `ti`, `integracao`, `contabil` | Menus, rotas, `canView`, `canEdit`, `isAdmin` | Componentes usam níveis atuais e vários checks de `permission === 2` | Oculta módulos/ações e mostra acesso negado em URL direta em fluxos já migrados | A UI é defesa auxiliar; backend continua autoridade | Suites `run-*-tests.mjs` e testes de rota | #566 deve alinhar ações 0/1/2/3 e validar URL direta para cada módulo protegido |
| Auditoria | `infra/prisma/schema.prisma` (`Logs`, `AuditRequest`), `shared/src/audit/*`, `services/gateway/src/middlewares/audit.ts`, `services/audit-service/*` | Organização, usuário, `permission`, request, `action`, `referring`, `changes` | Auditoria de request tem campos opcionais; `changes_json` existe, mas o middleware do gateway registra principalmente request/activity | Gateway enfileira auditoria por request; `Logs` é o modelo de alterações legado | Não foi localizado no snapshot um fluxo dedicado que capture anterior/novo para alteração modular | Testes de audit service/gateway e `activityCatalog*` | #565/#567 devem confirmar auditoria persistente com organização, afetado, owner autor e diff |
| Testes/fixtures | `services/user-service/src/test/*`, `services/gateway/src/*test*`, `shared/tests/*`, `app/src/modules/*/run-*-tests.mjs` | Níveis, owner, organização, módulos aposentados e rotas | Há casos de `null`, `0`, `1`, `2`, rejeição de aposentados e bypasses históricos; não há prova completa de `3` alvo e revogação | Testes de service, rota, política, proxy e source-level frontend | Cobertura é fragmentada por camada | Lista detalhada na seção “Gaps de testes” | #567 deve consolidar a matriz ponta a ponta e evidência operacional |

## Módulos ativos

O registro de claims do `user-service` e `MODULE_KEYS` do frontend identificam os mesmos 13
módulos ativos abaixo. Isso não significa que todos tenham a mesma superfície: a tela de gestão de
usuários conhece oito, e a navegação desabilita ou não expõe alguns módulos sem fluxo atual.

| Módulo ativo | Registro backend/JWT | Gestão de usuários no frontend | Navegação/consumidor observado | Estado para #564–#566 |
| --- | --- | --- | --- | --- |
| `certificado` | Sim | Sim | `/certificados`, `certificate-service` | Migrar e alinhar níveis/ações |
| `comercial` | Sim | Não | Não há módulo funcional equivalente na configuração de usuários; aparece em política `/client` | Confirmar como ativo contratual ou remover da lista final |
| `contabil` | Sim | Sim | `/contabil`, `contabil-service` | Migrar e alinhar níveis/ações |
| `financeiro` | Sim | Não | Usado na política agregada de `/client`; não há configuração de usuário correspondente | Confirmar consumidor e decisão de permanência |
| `fiscal` | Sim | Sim | `/fiscal`, `fiscal-service` | Migrar e alinhar níveis/ações |
| `integracao` | Sim | Sim | `/clients`, `/projects`, `/tasks`, clients/projects/tasks services | Preservar matriz específica de #551 |
| `marketing` | Sim | Não | Está marcado como indisponível em `moduleAccess` | Confirmar ausência de superfície funcional |
| `parcelamento` | Sim | Não | Existe página/módulo no app e service, mas não está no seletor de usuários | Confirmar regra de administração e níveis |
| `pessoal` | Sim | Sim | `/departamento-pessoal`, `pessoal-service` | Migrar e alinhar níveis/ações |
| `regularize` | Sim | Sim | `/regularize`, `regularize-service` | Migrar e alinhar níveis/ações |
| `rh` | Sim | Sim | `/rh`, `rh-service`; self-service automático | Preservar concessão explícita e owner/RH gates |
| `ti` | Sim | Sim | `/tecnologia`, `ti-service`; self-service automático | Preservar concessão explícita e owner/TI gates |
| `triagem` | Sim | Não | Está marcado como indisponível em `moduleAccess`; há página legada | Confirmar ausência de consumidor funcional |

Os valores de `user.permission`, `user.type` e `PermissionSpecific`/`PermissionProject` não são
módulos desta lista. Eles devem continuar fora da migração de significado, embora seus consumidores
precisem ser testados para não virarem bypass modular.

## Consumidores de módulos removidos

A busca encontrou os três nomes em persistência, código legado, contratos de rejeição e testes. A
classificação abaixo diferencia consumidor funcional de evidência de remoção/guardrail.

| Módulo | Consumidor encontrado | Classificação | Evidência e dependência |
| --- | --- | --- | --- |
| `atendimento` | `infra/prisma/schema.prisma`, migration `20250416190709_permissions/migration.sql`, `infra/prisma/seed.ts` | Persistência/fixture | Campo ainda existe, é anulável e é populado pelo seed; #564 não pode remover sem migration aprovada. |
| `pec` | Mesmos arquivos de Prisma/seed; `app/src/modules/clients/types/index.ts` | Persistência/tipo legado | O tipo `Perms` ainda expõe a chave; precisa ser removido junto com o contrato que o usa. |
| `wiki` | Mesmos arquivos de Prisma/seed; `app/src/modules/clients/types/index.ts` | Persistência/tipo legado | O tipo `Perms` ainda expõe a chave; não foi encontrado módulo de navegação funcional correspondente. |
| Todos | `services/src/src/services/UserService.ts`, controllers e routes legados | Consumidor funcional legado | Cria, atualiza, seleciona e testa `null` para os três; inclui `GET /permission` legado. O status de execução desse serviço deve ser confirmado antes de remover banco/contrato. |
| Todos | `app/src/pages/home/index.tsx` | Consumidor funcional legado | `PermsItem` contém os três e a página consulta `/permission`; o fluxo usa `integracao`, mas o payload ainda carrega as chaves antigas. |
| Todos | `services/user-service/src/schemas/permission.schemas.ts`, `app/src/modules/users/constants/permissionConfig.ts` e testes | Guardrail de remoção | Não são consumidores funcionais: rejeitam/filtram chaves aposentadas e comprovam que a UI atual não as reenvia. Devem permanecer como testes de rejeição após #565/#566. |
| `PEC` textual | `services/task-service/src/constants/integracaoTask.ts`, `app/src/modules/integracao/types/integracaoTask.ts` e telas de tarefas | Falso positivo de busca | `PEC` é tipo/classificação de tarefa da Integração, não chave de `Permission`; não remover como parte de #563. |
| Todos | `services/src/Fluxos.drawio` | Documentação legada | Contém nomes de colunas e rótulos históricos; atualizar ou marcar como legado no trabalho que retirar o schema, sem tratar o diagrama como contrato runtime. |

**Conclusão:** não é possível afirmar ausência de consumidores funcionais apenas com o estado atual.
O serviço legado e a página home ainda precisam de decisão/remoção coordenada. Portanto, #564 deve
permanecer bloqueada para esses pontos até a confirmação operacional exigida por #563.

## Rotas e políticas que usam global, departamento ou bypass

| Superfície | Arquivo/rota | Bypass atual observado | Risco para a normalização |
| --- | --- | --- | --- |
| Gateway gestão de usuários | `GET/POST /user`, `GET/PATCH/DELETE /user/:id`, fotos e `GET/PUT /user/permission/:userId` | `manageUsers` aceita `owner`, admin global legado (`type` ausente + `permission >= 2`) ou RH modular `>= 2` | A matriz exige owner para atribuir/alterar níveis; RH pode continuar operando usuários conforme regra específica, mas não ganhar bypass global implicitamente. |
| Gateway `/client` | Qualquer método em `/client` | Qualquer módulo da lista `clientRelatedModules` com mínimo `1`, além de global admin | Deve passar a avaliar a chave modular persistida na organização ativa; `atendimento` já não está na lista. |
| Gateway `/pessoal` | Qualquer método em `/pessoal` | `pessoal >= 1`, além de global admin | `0` precisa negar mesmo com departamento/permissão global para a regra alvo. |
| Gateway `/rh` | Qualquer método em `/rh` | `rh >= 1`, além de global admin | Self-service e administração de RH precisam de matriz explícita, não de fallback global. |
| Frontend module access | `app/src/modules/auth/utils/moduleAccess.ts` e `AppShell.tsx` | `isGlobalAdmin` dá `admin`; departamento pode resolver módulo e o maior nível entre global/extra | O frontend deve ocultar, mas não pode criar concessão que o backend não reconhece. |
| Frontend RH/TI | `useRhPermissions`, `canSSRAdmin`, componentes TI | Usa `user.permission` global, `rh` modular ou `ti` conforme fluxo | Separar permissionamento global de nível modular durante #566; self-service só permanece se persistir nível. |
| Services downstream | `requireCertificatePermission`, `requireTiPermission`, contexto RH/TI e apps com `request.permission` | Vários mínimos locais e alguns checks de `permission` global | #565 deve mapear cada rota/ação; este inventário não troca os mínimos. |
| Integração legado | `services/src/src/services/integracao/*` | Checks diretos de `user.permission === 2` | Deve ser substituído apenas no escopo de #551/#578/#582, não nesta issue. |

## JWT, headers e sessão

### Contrato atual

1. `POST /user/session` assina JWT com `user_id`, `sub`, `organization_id`, `permission`, `type` e
   `modules`; o registro de módulos é selecionado pela organização ativa.
2. `shared/src/auth/token.ts` e os middlewares aceitam `modules` como `Record<string, number|null>`
   sem validar faixa nem conjunto de chaves.
3. O gateway encaminha os claims em `x-auth-user-id`, `x-auth-organization-id`, `x-auth-permission`,
   `x-auth-type` e `x-auth-modules`, removendo versões fornecidas pelo cliente.
4. O `user-service` aceita headers internos quando o token interno coincide com o segredo configurado;
   sem headers internos, valida o Bearer JWT diretamente.
5. O frontend decodifica `modules` no token em `sessionToken.ts`, mantém o snapshot em Zustand e usa
   `AuthContext`/`AppShell` para navegação e guards.

### Gap de invalidação imediata

Não foi localizado no snapshot um mecanismo de revogação por usuário, `jti`, versão de sessão,
blacklist ou consulta de versão após alteração modular. O token possui expiração de um dia e a UI
possui resets/invalidações de queries, mas isso não invalida um JWT já emitido. O mecanismo de
invalidação imediata exigido por #562, #565, #566 e #567 está, portanto, **registrado como gap** e
deve ser desenhado/implementado em #565, validado em #567.

## Alteração de permissões e auditoria

### Endpoints e writers

- **Atualização modular atual:** `PUT /user/permission/:userId` → `permissionService.update` →
  `prisma.permission.updateMany`.
- **Criação modular atual:** criação de usuário chama `PermissionService.create` e, quando há patch,
  `PermissionService.update`.
- **Atualização indireta:** `PATCH /user/:id` pode alterar `type`, `permission`, departamento e
  `modules`, aplicando defaults/self-service em `userService.update`.
- **Contrato legado:** `POST/GET /permission` e `UserService.updatePermission` também escrevem e
  retornam os campos antigos.

### Auditoria atual e gap

- `AuditRequest`/`AuditRequestService` têm campos para organização, usuário, `action`, `referring`,
  `referring_id` e `changes_json`.
- O middleware do gateway registra a requisição, resultado, organização/usuário e atividade
  classificada, mas o payload padrão observado não captura o diff anterior/novo da permissão.
- O modelo legado `Logs` possui `changes`, organização e usuário, mas não foi encontrado, nos writers
  de permissionamento atuais, um registro explícito com autor `owner`, afetado e diff modular.

Assim, a auditoria completa exigida pela issue-pai é um **gap de contrato**, não uma implementação
antecipada nesta issue. #565 deve definir o writer e #567 deve provar persistência e isolamento.

## Gaps de testes por camada

| Camada | Cobertura existente | Gap que bloqueia a validação 0–3 |
| --- | --- | --- |
| Prisma/migration | Migrations e harnesses gerais | Não prova transformação `null/0/1/2 → 0/1/2/3`, check/default, contagens ou não reaplicação. |
| `user-service` | Services/routes cobrem rejeição de aposentados, alguns `null`, RH/TI e organização | Não prova que `null` deixe de entrar/sair, nível `3` em todos os contratos, owner exclusivo, auditoria e sessão revogada. |
| Shared/gateway | Políticas e proxy cobrem owner/admin legado, headers e algumas rotas | Não prova que `permission >= 2` sem `type` deixe de ser bypass, nem a matriz por rota/ação e organização. |
| Downstream services | Há testes locais de TI, RH, Fiscal, Certificado, Regularize e outros | Não há matriz consolidada de leitores de `modules`/`permission` e valores 0–3. |
| Frontend auth | `run-auth-tests.mjs`, store/hooks e guards têm casos de departamento, owner e módulos aposentados | Não prova níveis `0..3` com fonte persistida, troca de organização sem vazamento, sessão revogada e URLs diretas por módulo. |
| Frontend users | `run-users-tests.mjs` cobre ausência de aposentados e payloads atuais | Não prova opções exatamente `0..3`, envio de `0`, owner-only e ausência de `null`. |
| Auditoria | Testes de catálogo, requests e activity | Não prova evento de alteração modular com organização, afetado, owner autor e diff anterior/novo. |
| Manual QA/smoke | Há smoke e suites de módulos | Não há ensaio documentado da janela coordenada com backup, contagens, publicação compatível e rollback pré-reabertura. |

## Riscos de implantação parcial

1. **Migration antes do backend/frontend:** tokens e parsers antigos podem interpretar `0` como
   visualizador em vez de sem acesso, ou retornar `null` para colunas que passaram a ser obrigatórias.
2. **Backend antes do frontend:** o seletor atual continua enviando `null/0/1/2`, e a UI pode ocultar
   um módulo que o backend considera acessível ou mostrar ação proibida.
3. **Frontend antes do backend:** a UI pode aparentar negar acesso, mas URLs e requests antigos ainda
   podem passar por fallback global/departamento.
4. **Remoção de `atendimento`, `pec`, `wiki` sem confirmar o legado:** `services/src`, seed, tipos e
   página home podem falhar ou recriar colunas/payloads.
5. **Sem revogação:** um JWT emitido antes da alteração modular continua autorizando até expirar.
6. **Sem auditoria dedicada:** a alteração pode ser aplicada sem evidência de organização, autor,
   usuário afetado e diff, impedindo investigação e rollback lógico.
7. **Organização errada:** consultas que não filtram `organization_id` podem carregar permissões de
   outra organização, especialmente nos caminhos legados.

O rollout deve seguir a ordem da #562: bloquear escritas, validar backup, registrar contagens,
aplicar migration, publicar backend e frontend compatíveis, executar smoke/matriz, validar contagens
e só então reabrir. Falha antes da reabertura usa restauração do backup; depois de novas escritas,
usa roll-forward.

## Plano objetivo por sub-issue

| Issue | Arquivos/contratos que devem partir deste inventário | Entregável verificável |
| --- | --- | --- |
| [#564](https://github.com/IA-Pessoas/giro-office/issues/564) | `infra/prisma/schema.prisma`, migrations, `infra/prisma/seed.ts`, generated clients e consultas de contagem | Migration idempotente com lista ativa aprovada, `null → 0`, deslocamento `+1`, default/check `0..3`, remoção confirmada dos três módulos e ensaio de backup/restauração. |
| [#565](https://github.com/IA-Pessoas/giro-office/issues/565) | `services/user-service`, `shared/src/auth`, `services/gateway`, middlewares downstream, OpenAPI/docs e auditoria | Contratos somente `0..3`, owner-only para gestão, sem bypass implícito, organização ativa, headers/JWT alinhados, sessão revogada antes da próxima request e auditoria completa. |
| [#566](https://github.com/IA-Pessoas/giro-office/issues/566) | `app/src/modules/auth`, `app/src/modules/users`, `AppShell`, shells/guards/menus e páginas protegidas | Seletor exato `0/1/2/3`, payload sem `null`, módulos/ações ocultos, URL direta com acesso negado, owner-only e reset de snapshot por organização/sessão. |
| [#567](https://github.com/IA-Pessoas/giro-office/issues/567) | Suítes user-service/gateway/shared/app, smoke, migration harness e runbook de rollout | Matriz automatizada 0–3 + owner, isolamento, ausência de bypass, sessão revogada, auditoria, módulos removidos, contagens/constraints e ensaio operacional documentado. |

## Critérios de saída deste inventário

- [x] Caminhos atuais com `null/0/1/2` foram registrados por camada.
- [x] Os 13 módulos ativos do registro atual foram listados e as superfícies divergentes foram
      apontadas.
- [x] Consumidores encontrados de `atendimento`, `pec` e `wiki` foram classificados entre
      persistência, legado, guardrail, falso positivo ou documentação.
- [x] A fronteira entre `user.permission`, `user.type`, modular, departamento e específica foi
      explicitada.
- [x] JWT, headers, organização ativa e o gap de invalidação imediata foram registrados.
- [x] Endpoints de alteração e o gap de auditoria com diff anterior/novo foram registrados.
- [x] Há uma lista objetiva de arquivos, testes e entregáveis para #564, #565, #566 e #567.
- [x] Nenhuma migration, mudança de significado ou alteração runtime foi feita nesta issue.
