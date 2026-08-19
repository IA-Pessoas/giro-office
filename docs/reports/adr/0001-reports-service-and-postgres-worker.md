# ADR 0001: Reports-service e worker PostgreSQL

## Status

Aceita.

## Contexto

Relatórios precisam de execução assíncrona, recuperação após falha e limites
previsíveis de extração e armazenamento.

## Decisão

O `reports-service` terá HTTP e worker separados. PostgreSQL será a fila
durável dos jobs. O worker fará o claim com `FOR UPDATE SKIP LOCKED`, registrará
um token de lease e recuperará jobs cujo lease tenha expirado.

Cada definição aceita no máximo 2 fontes, 25 colunas selecionáveis e uma única
junção declarada como `Inner` ou `Left`. A prévia contém no máximo 100 linhas.
Cada snapshot aceita no máximo 50.000 linhas e 20 MiB. Cada worker executa no
máximo 2 jobs concorrentes, com lease de 120 segundos e timeout de extração de
10 segundos por adaptador. A retenção padrão de snapshots é de 30 dias.

Antes de extrair, o serviço deve recusar a execução quando fonte, campo,
relação ou estimativa exceder qualquer limite. Essa recusa não executa consulta
parcial.

## Consequências

O estado da fila e a recuperação de jobs permanecem transacionais no
PostgreSQL. Limites inválidos falham antes de acessar fontes de domínio.
