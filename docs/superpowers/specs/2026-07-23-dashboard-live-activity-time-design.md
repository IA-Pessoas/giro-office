# Tempo relativo dinâmico nas atividades do dashboard

**Data:** 2026-07-23
**Status:** aprovado para implementação

## Contexto

O gateway converte `audit_requests.created_at` em um texto relativo, como `há 5 min`, antes de
responder. O frontend exibe esse texto sem recalculá-lo. Embora o dashboard faça uma atualização
remota a cada 60 segundos, o horário pode ficar congelado quando a aba está em segundo plano,
quando a atualização falha ou enquanto um resultado em cache permanece visível.

## Objetivos

- Atualizar o tempo relativo mesmo quando nenhuma nova atividade for criada.
- Não consultar o banco apenas para avançar o texto de tempo.
- Recalcular imediatamente o texto de atividades recuperadas do cache.
- Preservar os fallbacks atuais para datas ausentes ou inválidas.

## Decisão

O gateway enviará `createdAt: string | null` com o timestamp original da atividade e deixará de
enviar o texto relativo `time`. O frontend será responsável por transformar esse timestamp em
`agora`, `há X min`, `há X horas` ou `há X dias`.

O dashboard manterá um relógio local que atualiza a cada 30 segundos enquanto o componente estiver
montado. O intervalo será limpo ao desmontar. A frequência de 30 segundos reduz o atraso visual na
virada do minuto sem produzir tráfego de rede.

## Fluxo

1. O gateway consulta `audit_requests.created_at`.
2. A resposta serializa a data válida em ISO; valores ausentes ou inválidos resultam em `null`.
3. O frontend recebe e armazena o timestamp no cache do React Query.
4. Ao renderizar, uma função pura calcula o tempo relativo usando `createdAt` e o horário local.
5. A cada 30 segundos, o relógio local provoca novo cálculo e atualiza apenas a interface.

## Tratamento de falhas

- `createdAt` ausente, inválido ou no futuro será apresentado como `agora`.
- Diferenças negativas de relógio não produzirão números negativos.
- O timer será encerrado no cleanup do `useEffect`.
- A atualização remota do dashboard continuará existindo para renovar os dados de negócio, mas
  deixará de ser necessária para atualizar o rótulo de tempo.

## Validação

- Teste do gateway comprova que a resposta contém o timestamp ISO e não contém texto relativo.
- Testes determinísticos da função de formatação cobrem segundos, minutos, horas, dias e data
  inválida.
- Teste frontend comprova a existência do relógio de 30 segundos e seu cleanup.
- Typechecks, testes escopados e build de produção serão executados.

## Critérios de aceite

- Uma atividade exibida como `há 5 min` progride para `há 6 min` sem nova atividade ou requisição.
- Voltar ao dashboard com dados em cache mostra imediatamente o tempo atual.
- Nenhuma atualização do relógio gera chamada adicional ao gateway.
