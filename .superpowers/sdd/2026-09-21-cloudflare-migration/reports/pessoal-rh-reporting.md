# Pessoal e RH: `/internal/reporting/*` nos Workers

Branch `cf/pessoal-rh-reporting`, a partir de `origin/cloudflare-migration` (47ad9088).

## O que entrou

| Worker | Rotas | Implementação |
| --- | --- | --- |
| `workers/pessoal-service` | `GET /internal/reporting/catalog`, `POST /internal/reporting/extract` | `src/reporting.ts` (verificação do grant + registro das rotas) |
| `workers/rh-service` | as mesmas | `src/routes/reporting.ts` (padrão `register*Routes(app, deps)`) |

- A extração, o catálogo, o schema do corpo e o schema do grant são os mesmos módulos do Node
  (`@workspace/{pessoal,rh}-service/src/reporting/*` e `schemas/internalReporting.schemas.ts`).
  Por isso a paginação em lotes de 1000 até o limite global (916003c9), o snapshot com `query`
  e a projeção de campos ficam iguais ao Node.
- Grant: a mesma verificação dos Workers fiscal, contábil e parcelamento. O HMAC usa `crypto.subtle`,
  a comparação é em tempo constante e o grant tem que estar na forma canônica. O Worker confere
  a audiência, a operação, a fonte, os campos, o `request_id`, o `body_sha256` e o TTL. A organização
  vem só do grant: o corpo é `strict`, então um `organization_id` no corpo dá 400.
- Token: `REPORTS_INTERNAL_TOKEN` em `x-internal-service-token`. Sem ele ou sem `REPORTS_GRANT_SECRET`, a rota responde 503.
  Os dois foram declarados em `src/env.ts`. Nenhum secret foi criado nem alterado.
- As rotas ficam fora do middleware do gateway (`/pessoal/*`, `/rh/*`), porque quem chama é o reports por Service Binding.
- Só no RH: a allowlist de campos roda antes do grant (403), como no Node, e há replay guard em
  `reports.grant_uses`. O grant é consumido depois da verificação, então uma requisição recusada
  não abre conexão com o banco.

## Schemas Prisma dos Workers

- rh: adicionado `ReportGrantUse`, copiado do canônico. Ele não tem `@updatedAt`, e `schemaParity.test.ts` continua verde.
- pessoal: adicionadas as relações que o extract seleciona. Em `Payroll`: `responsible` e `union`, iguais ao canônico. Em `ObrigationsPessoal`: `client` e `responsible`, também iguais ao canônico. Também entraram as relações inversas em `Client`, `User` e `UnionPessoal`. Só relações de modelo: nenhuma coluna nova.
- **Divergência consciente:** `Payroll.client` (`Client?`) não existe no canônico. O
  `InternalReportingService` do Node seleciona `client: { select: { name } }` em `payroll`,
  então no Node o campo `client_name` da folha deve falhar com erro de validação do Prisma, que
  vira 503 no reports. No Worker a relação existe e o campo funciona. Corrigir o canônico
  (ou o serviço Node) fica como pendência fora deste escopo.

## Diferença em relação ao Node

- O pessoal Node compara o token com `INTERNAL_SERVICE_TOKEN`, e o reports envia `REPORTS_INTERNAL_TOKEN`.
  Então no Node os dois valores precisam ser iguais. O Worker compara com `REPORTS_INTERNAL_TOKEN`,
  como os demais Workers de origem, e recusa o token do gateway (há teste para isso).

## Testes

- `workers/pessoal-service/src/reporting.test.ts`, `workers/rh-service/src/routes/reporting.test.ts`:
  - catálogo com grant válido;
  - extract escopado pela organização do grant;
  - 403 para token ausente, errado ou do gateway;
  - 403 para grant com assinatura errada, payload trocado, expirado, de outra audiência, de outro corpo ou de outro `request_id`;
  - 400 para `organization_id` no corpo;
  - 503 sem secrets;
  - no RH: replay (403 no segundo uso) e campo não publicado (403).
- Ponta a ponta: o `PessoalPayrollAdapter` e o `RhHolidayAdapter` reais do reports-service Node,
  com a env montada por `toReportsServiceEnv` e o `fetch` roteado por `routeSourceFetch` do reports
  Worker, chamam o app do Worker de origem pelo binding (`https://<svc>-service.binding`). Assim os
  testes cobrem headers, grant, corpo e formato da resposta. No pessoal, a extração passa pelo `InternalReportingService` real do Node, com um Prisma falso.
- Os testes de schema confirmam que o schema do Worker declara as relações e a tabela usadas pela extração.

## Validação

| Worker | test | typecheck | check | `wrangler deploy --dry-run` |
| --- | --- | --- | --- | --- |
| pessoal-service | 31/31 | ok | ok | ok (5134 KiB) |
| rh-service | 106/106 | ok | ok | ok (7857 KiB) |
| reports-service (sem mudanças) | 30/30 | ok | ok | não rodado (não mudou) |

Os bundles gerados não contêm `WebAssembly.compile` nem `WebAssembly.instantiate`.

## Pendências

- Nenhum deploy foi feito. Depois do deploy de pessoal e rh, conferir com uma prévia real de relatório de cada fonte.
- O verificador de grant já vinha copiado em vários Workers de origem, e estes dois somam mais duas cópias. Mover para
  `@workspace/runtime` quando alguém mexer no protocolo (está marcado com `ponytail:`).
- A correção de `Payroll.client` no canônico e no Node ficou fora deste escopo (ver acima).
