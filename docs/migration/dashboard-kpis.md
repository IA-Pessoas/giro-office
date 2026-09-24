# KPIs do dashboard: regras e consulta de referência (#1384)

O dashboard (`GET /api/dashboard/stats`) é montado pelo `DashboardStatsService`
(`services/gateway/src/services/dashboardStatsService.ts`). O gateway do Worker reaproveita o
mesmo serviço, sem cache. A consulta [dashboard-kpi-reference.sql](../../scripts/qa/dashboard-kpi-reference.sql)
reescreve cada KPI numérico, uma consulta por KPI, para conferir os números. As listas de status
são copiadas do serviço: a referência pega erro de agregação, não de regra (as regras estão na
tabela abaixo para revisão de produto).

Cobertos: `totalClients`, `clientsByService.*`, `tasks.*`, `projects.*`, `notifications.total` e
`pending`, `financial.*` (a série mês a mês), `commercial.activeProspects`, `closedThisMonth`,
`byStatus[*]` e `billing.*`, e `departments[*]` (abertas, concluídas e urgentes). Fora da
referência: listas e textos (`recentClients`, `pendingTasks`, `activities`, `insights`), as séries
`monthlyTrends` e `performance`, e `updatedAt`.

## Como validar em produção

```sh
psql "$DATABASE_URL" -X -v org=<organization_id> -f scripts/qa/dashboard-kpi-reference.sql
```

Compare cada linha com o campo de mesmo caminho em `data` da resposta de `/api/dashboard/stats`,
chamada logo em seguida. Os KPIs de "hoje" e "este mês" usam `current_date` do banco; o mês
corrente de `financial.paidCertificateReceipts` sai do relógio do runtime (UTC no Worker). Evite
comparar na virada do mês.

## Validação local (24/09/2026)

Banco com o schema Prisma real e uma semente que cobre cada regra: clientes ativos, excluídos,
inativos e de outra organização; tarefas abertas, de hoje, atrasadas, urgentes, concluídas,
`Migrado` e `Não Contratado`; projetos por status; certificados pagos dentro e fora da janela e
não pagos; prospecções e cobranças. **Os 44 valores do serviço bateram com a referência**,
campo a campo (inclusive cada mês da série e cada departamento).

## Regras e observações

| KPI | Regra | Observação |
| --- | --- | --- |
| `totalClients`, `clientsByService.*` | `status` = "ativo" (qualquer caixa), sem `deletion_date`; por serviço, a flag `true` | A carteira contábil depende da flag `contabil` (#1376) |
| `tasks.pending` | Status fora de concluída/fechado, "não contratado" e `Migrado` | Tarefas com status `Migrado` **não contam**. Hoje há zero tarefas e projetos migrados (#1444) |
| `tasks.today` / `urgent` | Abertas com previsão hoje / atrasadas ou urgência alta, crítica ou urgente | |
| `tasks.completedToday` | Concluída/fechado com `end_date` hoje | |
| `projects.active` | Status fora de fechado, inativo, distrato, recusado, rejeitado e não contratado | |
| `projects.inProgress` | "em andamento", "andamento" **e "paralisado"** | O rótulo sugere só os em andamento |
| `projects.delayed` | Status "paralisado" | Não usa prazo: é paralisado, não atrasado |
| `projects.waiting` | "análise/agendamento" ou "envio de proposta" | |
| `notifications.total` / `pending` | Soma de certificado, pessoal e regularize; pendente = não lidas, com certificado sempre pendente | `notifications.urgent` é fixo em 0 |
| `financial.unpaidCertificates` | Certificados PJ e PF com `was_paid` diferente de `true`, **de todos os tempos** | Inclui certificados vencidos e antigos, por isso o número é alto |
| `financial.paidCertificateReceipts` | Soma de `payment_amount` pago no mês corrente | |
| `financial.monthlyPaidCertificateReceipts` | Mesma soma, mês a mês, nos últimos 7 meses | Ver "Gráfico de recebimentos" |
| `commercial.*` | Prospecções não arquivadas; cobranças por `hiring_status` | |
| `departments[].openTasks` | Mesma regra de `tasks.pending`, por departamento | |
| `updatedAt` ("Última atualização") | Maior data entre clientes, tarefas, notificações, certificados, prospecções e cobranças, ignorando datas futuras | É a última mudança nos dados, não o horário da carga |

As observações acima são semântica atual, não divergência entre serviço e referência. Mudar
algum rótulo ou regra é decisão de produto.

## Gráfico de recebimentos

O serviço devolve os mesmos valores em toda carga: não há cache nem fallback que zere a série.
O componente só monta os gráficos quando os dados já chegaram, então o único estado transitório
era a animação de entrada do Recharts: a série nasce em zero e cresce por cerca de 1,5 s, e uma
captura logo na primeira carga mostrava o gráfico zerado. A animação foi desligada em todos os
gráficos do dashboard (recebimentos, projetos e desempenho). A conferir após o deploy: os
gráficos aparecem já preenchidos na 1ª carga.

## Projetos e tarefas zerados

Esperado: a carga legada de `integracao.projects` e `integracao.tasks` não foi feita
(`docs/migration/v4.1/ESTADO-GERAL-MIGRACAO.md`). O dono decidiu migrar depois; o trabalho segue
em #1444.
