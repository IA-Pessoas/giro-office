# Auditoria do Gateway Worker após contabil, fiscal, triagem e parcelamento

Branch local `cf/gateway-audit`, base `cloudflare-migration` @ `34958e27`. Worktree `.worktrees/cf-gateway-audit`.

## Contexto e método

- Graphify: `pnpm graphify:context:services` respondeu "sem grafo local em services/graphify-out/graph.json". Usei descoberta manual com `rg`/leitura direta.
- Fontes de verdade do Node: `services/gateway/src/config/serviceRegistry.ts` (prefixos e ordem de montagem), `security/policies.ts` (policies), `middlewares/authorize.ts` (modo `enforce` por padrão), `middlewares/csrfProtection.ts` e `proxy/httpProxy.ts` (`resolveForwardedPermission`, headers).
- TDD: `src/serviceRoutes.test.ts` escrito primeiro. RED: 32 de 56 falhando (roteamento `/triagem`, permissão por módulo, 403, 503 do legado e CSRF). Depois veio o GREEN mínimo em `app.ts` e `auth.ts`.

## Arquivos tocados

- `workers/gateway/src/app.ts`: tabela de rotas, policies e contagem do `/ready` por binding distinto.
- `workers/gateway/src/auth.ts`: permissão encaminhada por módulo e CSRF de cookie.
- `workers/gateway/src/app.test.ts`: uma linha, `/triagem` → `/triagem/overview` no teste de pilotos. Pela paridade, `/triagem` puro agora vai ao contabil.
- `workers/gateway/src/serviceRoutes.test.ts`: novo, suíte de integração gateway → Service Binding dublado.
- `wrangler.jsonc` e `env.ts`: sem mudança.

## Achados

| Item | Antes | Correção | Teste |
| --- | --- | --- | --- |
| 1. Roteamento `/triagem` | Todo `/triagem` ia para `TRIAGEM_SERVICE`. `monthly`, `statements`, `closing` e `editability` do Worker contábil ficavam inalcançáveis. | Mesma ordem do Node: `/triagem/{overview,competencies,catalogs,external-links,urgent-requests}` → `TRIAGEM_SERVICE`. Qualquer outro `/triagem`, inclusive o puro e subpaths desconhecidos, → `CONTABIL_SERVICE` (`triagem-legacy-service`). | 16 casos de rota, com fronteira de prefixo `/triagem/overviewx`, path, query e método preservados |
| 2a. Permissão encaminhada | `x-auth-permission` global para todos | Com `module`, segue `resolveForwardedPermission`: owner=3, sem claim `modules`=0, senão `modules.<x>`. Módulos: fiscal=`fiscal`, contabil=`contabil`, triagem-service=`triagem`, parcelamento=`parcelamento`. O legado `/triagem` → contabil fica sem módulo e encaminha a global, como no Node. | 5 casos de permissão + 4 de owner sem `modules` |
| 2b. Policies | Nenhuma | `canAccessRoute` de `@workspace/shared/auth`. GET usa o nível 1 e os demais métodos (HEAD incluso) o nível 2 em fiscal, contabil e parcelamento. `/triagem/*` exige `anyModule[contabil,triagem] ≥ 1` em qualquer método. Ator de plataforma é negado. | 9 negações, 6 permissões mínimas, 1 de plataforma |
| 3. Bindings | `FISCAL`, `CONTABIL`, `TRIAGEM` e `PARCELAMENTO` → `giro-<x>-service`. Batem com o `name` do `wrangler.jsonc` de cada Worker. Nenhum bloco `env` em nenhum dos lados, sem URL e sem ID. | Nenhuma | `wrangler deploy --dry-run` lista os 17 bindings |
| 4a. Binding ausente | 503 "Serviço não configurado no gateway." já existia | Mantido. Cobre também o legado `/triagem/monthly` sem `CONTABIL_SERVICE`. | 5 casos |
| 4b. Policy negada | Não havia | 403 com o envelope do Node: `{success:false,error:"Acesso negado para esta rota.",code:"FORBIDDEN",requestId}` | `toEqual` do envelope completo |
| 4c. Erro upstream | Já propagava status e corpo | Mantido | 409/422/500/503 com corpo intacto e `x-request-id` |
| 5. CSRF de cookie | Aceitava o token do **cookie** `cw.csrf` sozinho, sem header. O cookie viaja sozinho com a requisição, então isso anula a proteção double-submit. A mensagem também diferia. | Paridade com `csrfProtection`: exige header `x-csrf-token` **e** cookie, iguais e presos ao `csrf_hash` da sessão. Resposta 403 "Requisição não autorizada.". Bearer segue isento. | 1 aceite, 4 rejeições (RED mostrou 200 no caso só-cookie), 1 Bearer |

## Validações

- `pnpm --filter @workspace/gateway-worker test`: 2 arquivos, 74 testes verdes. Antes eram 18.
- `typecheck`, `build` e `check` (Biome) do gateway: ok.
- `wrangler deploy --dry-run --config workers/gateway/wrangler.jsonc`: ok, 17 Service Bindings, sem deploy.
- `git diff --check`: ok.
- Setup: `pnpm install --frozen-lockfile` (`ERR_PNPM_IGNORED_BUILDS` esperado, lockfile intacto), build de `@workspace/shared`/`@workspace/runtime` e `prisma:generate` do `workers/audit-service` com `DATABASE_URL` fictícia. O teste existente importa o Audit Worker.

## Divergências registradas fora do escopo (não corrigidas)

1. **Policies dos demais serviços** não são aplicadas no Worker: client (matriz própria, incluindo integracao), project/task (integracao, financeiro), commercial (`comercial`), pessoal, rh (matriz extensa), department e ti (`ti`), regularize, certificate (`certificado`), user (`manageUsers`/`ownerOnly`), `/platform/*` (`platformOnly`), reports/organizations/audit (autenticado). No Node, rota sem policy é negada em `enforce`. No Worker, qualquer path sob um prefixo é encaminhado.
2. **`permissionModule` dos demais serviços** (`rh`, `regularize`, `ti`, `certificado`, `pessoal`, `comercial`): o Worker encaminha a permissão global.
3. **Headers do cliente:** o Node remove `authorization`, `cookie` e `x-csrf-token` antes do upstream e só os recoloca por regra (`forwardValidatedAuthorization` em rh, cookies de sessão em user/platform). O Worker repassa todos os headers do cliente.
4. **Headers de identidade:** o Worker sempre envia `x-auth-modules`. O Node só envia quando a claim existe. O Worker envia `session_id`/`csrf_hash` a todos, o Node só ao user-service. Para ator de plataforma, o Worker envia `organization-id` vazio, `permission` e `type`, que o Node omite.
5. **Token interno por serviço:** o Node usa tokens distintos (user, client, ti, regularize, certificate) e nenhum para rh/pessoal/parcelamento/reports. O Worker usa um único `INTERNAL_SERVICE_TOKEN` para todos.
6. **CSRF por Origin/Referer:** o Node valida uma allowlist `allowedOrigins`, que o Worker não tem (faltaria uma var de ambiente).
7. **Normalização de path:** o Node casa sem diferenciar maiúsculas e rejeita separadores codificados (`%2F`, `%5C`) e dot-segments. O Worker casa com diferenciação de maiúsculas (`/Fiscal` → 404), e `/triagem/overview%2F…` cai no legado contabil em vez de 403. Os dois lados do `/triagem` têm a mesma policy, então não há bypass de permissão.
8. **Ordem de erros:** o Worker responde 404/503 de rota ou binding antes de autenticar. O Node responde 401 primeiro e 403 para rota não classificada.
9. **Superfícies ausentes no Worker:** `/task`, `/dashboard`, `/platform/*` (incluindo `stripPathPrefix` do audit), `/socket.io`, rotas bloqueadas (`disabledRoutes`, `/regularize/internal`, `/platform/session/validate`), rotas públicas de sessão, rate limit.
10. **Auditoria de negações:** o Worker só audita requests encaminhados. 401, 403 de CSRF e 403 de policy não geram registro. A paridade com o middleware de auditoria do Node não foi verificada aqui.
11. **Relatório do parcelamento:** diz que o gateway Node "não nega" por módulo. `policies.ts` tem `parcelamento` GET≥1 / demais ≥2, e `authorize` roda em `enforce` por padrão. O gate agora fica no gateway Worker.

## Riscos

- Usuários sem `modules.<x>` (ou com permissão global alta e módulo 0) passam a receber 403 no gateway em fiscal, contabil, triagem e parcelamento. É o comportamento do Node e deve ser o esperado em staging.
- Os Workers fiscal, contabil, triagem e parcelamento passam a receber a permissão do módulo em `x-auth-permission`. Os quatro leem `x-auth-permission` e `x-auth-modules` nos seus `auth.ts` e agora recebem o mesmo valor que o Node mandava. O uso exato de cada um não foi reauditado aqui.
- `/triagem` puro e subpaths desconhecidos agora vão ao contabil, como no Node. A descrição da tarefa ("o resto para triagem") difere do Node nesse ponto, e prevaleceu o Node.
- Clientes que mandavam só o cookie CSRF em mutações por cookie passam a receber 403. O frontend já precisa mandar o header para o Node.
- Não houve teste com bindings reais nem smoke em preview. Os upstreams são dublês de Service Binding.
