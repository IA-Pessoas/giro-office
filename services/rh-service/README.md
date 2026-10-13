# rh-service

Funcionalidades de RH, incluindo ponto, banco de horas, folhas de ponto, chamados e score.
Montado no gateway no prefixo **`/rh`**.

## Porta local

Por defeito: **3034** (`PORT`).

## Variaveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `DATABASE_POOL_MAX` (inteiro positivo, default 1), `JWT_SECRET`, `REPORTS_INTERNAL_TOKEN`, `REPORTS_GRANT_SECRET` e `RH_REQUEST_MESSAGE_BUCKET` (default `rh-request-messages`).

## Gateway

- URL upstream: `RH_SERVICE_URL` (ex.: `http://localhost:3034`).
- O micro expoe rotas sob o prefixo `/rh`.
- Exemplos publicos: `GET /rh/time-bank/summary`, `GET /rh/timesheets/{id}`,
  `GET /rh/score/quarters/{id}`.
- `POST /rh/requests` aceita criacao sem `assigned_to_user_id`; nesse caso o backend atribui automaticamente um responsavel RH elegivel antes de persistir.
- `GET /rh/operational-users` lista colaboradores ativos da organizacao com payload minimo para seletores operacionais de RH.
- O CCE/5 Estrelas usa `GET` e `PUT /rh/cce/floors` para consultar/configurar 0–4 pisos, `GET` e `POST /rh/cce/cycles` para consultar/criar um ciclo mensal e `PATCH /rh/cce/weeks/{id}` para registrar uma avaliação semanal. Leituras exigem acesso ao RH; alterações exigem permissão de gestão e validam a organização no servidor.
- O Projeto de Vida oferece `GET` e `POST /rh/life-projects` por ano, `PATCH /rh/life-projects/{id}` para histórias e rotas `/objectives` para metas. Colaboradores editam o próprio plano; gestores consultam somente a equipe permitida e o RH administrativo gerencia a organização. Há um projeto por colaborador e ano.
- `POST /rh/messages` aceita JSON ou multipart com um PDF, PNG ou JPEG privado de até 10 MB; `GET /rh/messages` só devolve URL assinada aos participantes autorizados.
- `GET /rh/notifications` e `PUT /rh/notifications/read` fornecem a campainha global por usuário, organização e solicitação.

## Reporting interno

`GET /internal/reporting/catalog` e `POST /internal/reporting/extract` são rotas internas chamadas
diretamente pelo reports-service. Elas não passam pelo gateway público, exigem token interno e
grant HMAC curto, filtram sempre por `organization_id` do grant e publicam somente os campos
seguros de `rh.requests` e `rh.holidays`. IDs de solicitante e responsável ficam disponíveis
apenas como chaves de autorização no catálogo, nunca como colunas de saída; `rh.holidays` não
publica chaves nem relações e expõe somente nome e data.

## Desenvolvimento

```bash
pnpm --filter @workspace/rh-service dev
```

## Critérios de relatórios

`POST /internal/reporting/extract` aceita `query` opcional com filtros tipados, grupos AND/OR, ordenação, agrupamento e agregações. O corpo completo e todos os campos utilizados pertencem ao grant assinado. A origem aplica o escopo organizacional e processa o conjunto completo em snapshot consistente antes do limite de saída; excesso de 50.000 registros/20 MiB retorna 422, sem resultado parcial. Payloads sem `query` preservam o contrato legado. Consulte a [matriz e semântica dos critérios](../reports-service/docs/criteria-origins.md) e o OpenAPI do serviço.
