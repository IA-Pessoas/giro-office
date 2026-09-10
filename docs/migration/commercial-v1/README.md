# Backfill Comercial V1

Este procedimento importa somente equivalências comerciais comprovadas para uma organização:

- `tb_integracao.prospeccao_comercial` para `commercial.prospecting`, mantendo o vínculo canônico
  com `clients` e comparando a projeção comercial já persistida no Cliente;
- registros explícitos de cobrança (`legacy.taskBillings`) para `commercial.task_billing`, ligados à
  Tarefa canônica e reconciliados contra os campos projetados em `integracao.tasks`;
- configurações explícitas com `name` e `contract_value` para `proposal.config`.

Os IDs de Cliente, Tarefa, Projeto, prospecção, cobrança e configuração usam o mesmo namespace determinístico
da carga V2. O plano sempre recebe uma `organizationId`; qualquer destino de outro tenant é
quarentenado e nenhum SQL é gerado para ele.

## Validação prévia

O arquivo de entrada é um snapshot sanitizado com as seções `legacy` e `current`. O modo `validate`
não conecta ao banco e grava apenas contagens, hashes, decisões e quarentena:

```sh
node scripts/commercial-backfill-reconciliation.mjs validate \
  --input scripts/fixtures/commercial-backfill/valid-input.json \
  --report /tmp/commercial-backfill-report.json
```

O corte só pode ser aprovado quando `approval.readyForCutover=true` e a quarentena estiver vazia.
Históricos como `tb_comercial.cobrancas_descricao`, `tb_integracao.cobrancas_novas` e
`tb_integracao.cobrancas_solucoes` não possuem destino atual fiel e devem entrar em
`legacy.unsupported`, sem payload bruto no relatório. O campo textual legado
`tb_integracao.tarefas.cobranca` também não é convertido automaticamente em `hiring_status`:
sem uma linha explícita em `legacy.taskBillings`, ele entra em quarentena.

## Aplicação

Depois de revisar o relatório e obter autorização explícita para o corte:

```sh
MIGRATION_DATABASE_URL='postgresql://...?sslmode=verify-full' node scripts/commercial-backfill-reconciliation.mjs apply \
  --input /caminho/snapshot.json \
  --validated-report /tmp/commercial-backfill-report.json \
  --report /caminho/commercial-backfill-apply-report.json \
  --approve-cutover
```

O modo mutável exige o relatório prévio com o mesmo digest, tenant, corte e aprovação, usa consultas
parametrizadas, transação única e predicados por organização. Updates de prospecção e cobrança só
afetam linhas com timestamp até o corte; decisões posteriores são preservadas e tornam o plano
bloqueado. Inserts usam identidade determinística e `ON CONFLICT DO NOTHING`, tornando a reexecução
idempotente. A conexão exige TLS com validação de certificado; quando a CA não estiver no trust store
do host, informe também `MIGRATION_DATABASE_SSL_CA`.

## Evidência reconciliada

O relatório registra contagens de origem e destino, vínculos de Cliente/Tarefa/Projeto, resultado da
projeção no Cliente, digest do snapshot e cada quarentena com origem, ID sanitizado, campo e motivo.
Não registra linhas brutas, credenciais ou valores auxiliares sem destino comprovado.
