# pessoal-service

Microservico de Pessoal. O gateway encaminhara esse servico pelo prefixo publico **`/pessoal`**.

## Porta local

Por defeito: **3042** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL`
- `DATABASE_POOL_MAX` (default `1`)
- `JWT_SECRET`
- `AUDIT_SERVICE_URL`
- `AUDIT_SERVICE_TOKEN`
- `INTERNAL_SERVICE_TOKEN` (obrigatorio em producao; em dev/test usa `AUDIT_SERVICE_TOKEN` como fallback)
- `REPORTS_GRANT_SECRET` (segredo compartilhado com o reports-service para grants de reporting)
- `PESSOAL_PASSWORD_ENCRYPTION_KEY`
- `PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION`
- `PESSOAL_DOMAIN_AUDIT_ENABLED`
- `SERVICE_ALLOWED_ORIGINS`
- `ENABLE_API_DOCS`

## Gateway

- URL upstream: `PESSOAL_SERVICE_URL` (ex.: `http://localhost:3042`)
- Prefixo publico: `/pessoal`

Exemplos de paths publicos planejados:

- `/pessoal/ldd`
- `/pessoal/ldd/import/preview` (POST, edição de Pessoal): lê as linhas `CP-` de um PDF LDD/INSS em base64 (até 700 KB) e devolve a prévia, sem gravar
- `/pessoal/ldd/import` (POST, edição de Pessoal): grava as linhas revisadas como LDD `INSS`, somando por competência e vencimento ao saldo existente; o mesmo PDF (hash) não é aplicado duas vezes ao cliente (409)
- `/pessoal/situations`
- `/pessoal/unions`
- `/pessoal/groups`
- `/pessoal/payroll`
- `/pessoal/obrigations`
- `/pessoal/passwords`

## Grupos da folha

`/pessoal/groups` mantém o catálogo por organização. Leitura requer permissão Pessoal 1;
criação, edição, arquivamento e reativação requerem Pessoal 2. O grupo sistêmico `Sem Movimento`
é criado sob demanda com a política `NO_OBLIGATIONS`. Arquivamento preserva vínculos históricos de
folha; apenas grupos ativos podem receber uma nova atribuição. Toda folha usa `group_id` canônico;
o contrato textual anterior não é aceito. Uma folha ligada a grupo arquivado continua legível como
histórico, mas precisa receber um grupo ativo antes de ser alterada.

## Rotinas internas

- `POST /internal/pessoal/union-notifications/run`
- `POST /internal/pessoal/group-assignments/audit-outbox/reconcile`
- `GET /internal/reporting/catalog`
- `POST /internal/reporting/extract`

O catálogo interno publica `pessoal.ldd`, `pessoal.payroll`, `pessoal.situations`,
`pessoal.obligations` e `pessoal.unions`. Os identificadores de cliente, responsável e sindicato
ficam exclusivamente em `keys`; as chaves internas de situações e configuração de folha também
ficam fora dos campos públicos. A extração só aceita campos publicados e usa a organização contida
no grant HMAC de curta duração.

O servico nao agenda cron no processo Node. As rotinas de notificacoes de sindicatos e de
reconciliacao da outbox de auditoria devem ser acionadas por um scheduler externo, como
Supabase/Vercel, usando `x-internal-service-token`.
Em VPS, configure `INTERNAL_SERVICE_TOKEN` em `.env.vps.pessoal-service` e use o mesmo valor nesse header. O fallback para `AUDIT_SERVICE_TOKEN` fica restrito a dev/test.

## Desenvolvimento

```bash
pnpm --filter @workspace/pessoal-service dev
```

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.
