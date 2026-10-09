# contabil-service

Microserviço de domínio contábil: checklist operacional por cliente e competência (**controls**), **responsibles** e **relationships** do cliente. Todas as rotas de negócio ficam sob o prefixo `/contabil` e exigem autenticação (JWT ou headers encaminhados pelo gateway).

## Porta local

Por padrão: **3038** (`PORT` em [`src/config/env.ts`](src/config/env.ts)).

## Variáveis de ambiente

Definição e defaults em [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL` — PostgreSQL (Prisma)
- `DATABASE_POOL_MAX` — teto do pool por processo (default `1`)
- `JWT_SECRET` — validação do Bearer nas rotas autenticadas
- `PORT` — porta HTTP (default `3038`)
- `AUDIT_ENABLED`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN` — auditoria via `integrations/audit.ts`
- `INTERNAL_SERVICE_TOKEN` — token esperado no header interno quando o gateway encaminha usuário/organização (opcional; se omitido, usa o mesmo valor que `AUDIT_SERVICE_TOKEN`)
- `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` — autenticação e grants HMAC curtos do Reports para `/internal/reporting`
- `TRIAGEM_SERVICE_URL`, `TRIAGEM_INTERNAL_TOKEN`, `TRIAGEM_REQUEST_TIMEOUT_MS` — cliente interno somente leitura do resumo da Triagem
- `ENABLE_API_DOCS` — documentação OpenAPI em `/docs` (em produção o default é desligado)

## Gateway

No gateway, configure o upstream:

- `CONTABIL_SERVICE_URL` — URL base do serviço (ex.: `http://localhost:3038`)

Prefixo público no gateway: **`/contabil`**.

Exemplos de paths públicos (via gateway, com `Authorization: Bearer …`):

- `GET http://localhost:3010/contabil/controls?client_id=<uuid>&competence=<YYYY-MM>`
- `GET http://localhost:3010/contabil/controls/list?competence=<YYYY-MM>`
- `POST http://localhost:3010/contabil/controls`
- `POST http://localhost:3010/contabil/controls/year` (exige `confirmed: true`)
- `PATCH http://localhost:3010/contabil/controls/<id>/items` (conclui os 17 itens)
- `DELETE http://localhost:3010/contabil/controls` e `POST http://localhost:3010/contabil/controls/restore`
- `PATCH http://localhost:3010/contabil/controls/<id>`
- `POST http://localhost:3010/contabil/responsibles`
- `GET http://localhost:3010/contabil/responsibles/client/<clientId>`
- `PUT http://localhost:3010/contabil/responsibles/<id>`
- `DELETE http://localhost:3010/contabil/responsibles/<id>`
- `POST http://localhost:3010/contabil/relationships`
- `GET http://localhost:3010/contabil/relationships/client/<clientId>`
- `PUT http://localhost:3010/contabil/relationships/<id>`
- `DELETE http://localhost:3010/contabil/relationships/<id>`
- `GET|POST http://localhost:3010/triagem/monthly`
- `GET http://localhost:3010/triagem/fiscal-portfolio?competence=<YYYY-MM>`
- `GET|PUT|DELETE http://localhost:3010/triagem/statements`
- `GET|PUT|DELETE http://localhost:3010/triagem/closing`

As atualizações fiscais de itens também aceitam `justification`, `delivery_method` e `state_site`;
esses valores são validados no catálogo da organização ou no snapshot da competência.

Infraestrutura direto no serviço: `GET http://localhost:3038/health` e `GET http://localhost:3038/ready`.
`/internal/reporting/*` é contrato interno direto; não passa pelo gateway.

## Desenvolvimento

```bash
pnpm --filter @workspace/contabil-service dev
```

## Conversão Noah

`POST /contabil/noah?filename=comprovantes.zip` recebe bytes `application/zip` e exige
permissão de edição no Contábil. Retorna 201 com identificador, rejeições por arquivo,
quantidades, ator, instante e hashes SHA-256 da origem e do CSV. O resultado é imutável
e persistido em `contabil.noah_conversions`; o ZIP/HTML só permanece em memória durante
a requisição. `GET /contabil/noah/:id/csv` exige leitura e consulta somente a organização
autenticada. O gateway encaminha o upload binário e o download pelo mesmo prefixo.

Limites: ZIP de 5 MiB, 100 entradas, 1 MiB por HTML, 10 MiB expandidos e 10.000 pagamentos.
Não extrai no filesystem, não executa HTML e rejeita caminhos inseguros, symlinks,
arquivos corrompidos e pagamentos inválidos. O CSV usa UTF-8, ponto e vírgula e as quatro
colunas `FORNECEDOR;DATA;VALOR;ARQUIVO`; células que poderiam executar fórmulas recebem
um apóstrofo inicial. Nenhum lançamento, Controle ou checklist é alterado.

Regras de extração: `classes/Contabil.php` do legado (tabela `TBLResultado`, colunas
1/6/7 e alternativas 5/6). Validação usa casos sintéticos; compatibilidade com ZIPs
reais permanece não validada conforme #1716. A migration
`20261009214500_contabil_noah_conversions` deve ser aplicada pelo processo de publicação.

### Comandos locais

```bash
pnpm --filter @workspace/contabil-service dev
```

Gerar cliente Prisma: `pnpm --filter @workspace/contabil-service prisma:generate`.

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.
