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

Cada renovação do lease é atômica e condicionada ao token de lease vigente. A
conclusão também é uma única operação atômica, condicionada ao mesmo token, que
publica o snapshot, atualiza o status do job e encerra o lease. Se a condição
falhar, o worker perdeu a posse e não pode publicar nem alterar o job. A
publicação do snapshot é idempotente por job e nunca cria duplicata nem conclui
o mesmo job duas vezes.

Cada definição aceita no máximo 2 fontes, 25 colunas selecionáveis e uma única
junção declarada como `Inner` ou `Left`. A prévia contém no máximo 100 linhas.
Cada snapshot aceita no máximo 50.000 linhas e 20 MiB. Cada worker executa no
máximo 2 jobs concorrentes, com lease de 120 segundos e timeout de extração de
10 segundos por adaptador. A retenção padrão de snapshots é de 30 dias.

O limite de 2 jobs é local ao worker. Antes de acessar uma origem, o worker deve
obter uma cota ou semáforo compartilhado globalmente entre réplicas. A
capacidade máxima é de 2 extrações concorrentes por origem/adaptador e, quando
aplicável, também por tenant. Sem cota disponível, a extração não começa; a
escala horizontal não pode elevar a pressão para `2N`.

Antes de extrair, o serviço deve recusar a execução quando fonte, campo,
relação ou estimativa exceder qualquer limite. Essa recusa não executa consulta
parcial.

A estimativa é requisito de preflight: se estiver ausente, obsoleta ou não for
confiável, a execução falha de forma fechada antes de consultar a origem. O
contrato de cada adaptador também deve aplicar o orçamento de linhas e bytes na
consulta de origem, antes de materializar a resposta. O limite reativo do
snapshot é apenas uma defesa adicional, não o mecanismo primário de contenção.

## Consequências

O estado da fila e a recuperação de jobs permanecem transacionais no
PostgreSQL. Limites inválidos falham antes de acessar fontes de domínio.
