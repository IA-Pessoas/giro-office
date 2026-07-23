# Agrupamento de atividades repetidas no dashboard

## Contexto

O tempo relativo das atividades recentes já é recalculado no frontend a cada 30 segundos.
Entretanto, consultas automáticas do sistema geram novos registros de auditoria com o mesmo
usuário, método, rota, ação e item. Como o dashboard recebe sempre o registro mais recente, uma
linha visualmente idêntica volta continuamente para `agora`.

A investigação no ambiente `develop` confirmou o comportamento. Uma consulta à lista de usuários
foi registrada 53 vezes em aproximadamente 13 minutos, com intervalo médio de 15 segundos.

## Objetivo

Exibir cada sequência contínua de atividades idênticas como uma única atividade recente, permitindo
que o tempo relativo avance normalmente, sem apagar ou alterar os registros reais de auditoria.

## Comportamento aprovado

- O agrupamento será feito no gateway, durante a leitura das atividades do dashboard.
- Duas atividades pertencem à mesma sequência quando possuem o mesmo usuário, método, rota, ação e
  item e o intervalo entre registros consecutivos é de até 5 minutos.
- A sequência usa o horário do primeiro registro como `createdAt`.
- Uma repetição que ocorrer após mais de 5 minutos sem atividade idêntica inicia uma nova sequência.
- O dashboard retorna até cinco sequências recentes e distintas.
- O banco e o fluxo de gravação da auditoria permanecem inalterados.
- O frontend continua recalculando o texto relativo a cada 30 segundos.

## Arquitetura

O SQL de atividades recentes no `DashboardStatsService` identificará sequências por assinatura da
atividade e por lacunas temporais. A consulta buscará os eventos elegíveis, detectará com `lag` as
lacunas superiores a 5 minutos, atribuirá um identificador cumulativo a cada sequência e agregará
cada grupo.

Cada grupo produzirá os mesmos campos consumidos atualmente pelo mapeamento do gateway. O
`created_at` agregado será o menor timestamp da sequência, enquanto a ordenação das cinco
sequências recentes usará o maior timestamp da sequência. Assim, repetições automáticas mantêm um
horário estável sem impedir que a sequência permaneça entre as atividades mais recentes.

## Fluxo de dados

1. O gateway seleciona atividades visíveis da organização autenticada.
2. Para cada assinatura, ordena os registros por `created_at`.
3. Uma lacuna superior a 5 minutos inicia uma nova sequência.
4. O gateway agrega cada sequência e seleciona as cinco atualizadas mais recentemente.
5. A resposta mantém `createdAt: string | null`, usando o primeiro instante da sequência.
6. O frontend recalcula `agora`, minutos, horas e dias usando seu relógio local.

## Casos de borda

- Atividades com usuários, rotas, ações ou itens diferentes nunca são agrupadas.
- Uma lacuna exatamente igual a 5 minutos ainda pertence à mesma sequência.
- Uma lacuna superior a 5 minutos cria uma nova sequência.
- Registros não elegíveis continuam excluídos pelas regras atuais de visibilidade e sucesso.
- O agrupamento não remove nem atualiza dados do banco.

## Testes

O teste do `DashboardStatsService` validará a estrutura da consulta e o contrato retornado:

- uso de janela temporal para detectar lacunas;
- limite de 5 minutos;
- `min(created_at)` como horário estável da sequência;
- ordenação pela última ocorrência da sequência;
- limite final de cinco atividades;
- preservação de `createdAt` no contrato público.

A validação final incluirá a suíte completa do gateway, typecheck, testes do dashboard, build das
imagens afetadas e smoke do ambiente `develop`.

## Alternativas rejeitadas

### Estabilização apenas no frontend

Não resolve duplicações que ocupam as cinco posições e perde o estado ao recarregar a página.

### Supressão durante a gravação da auditoria

Alteraria o histórico global e exigiria coordenação entre filas e instâncias. O problema atual é de
apresentação das atividades recentes, portanto o agrupamento na leitura é mais isolado e
reversível.
