# Resiliência do dashboard em picos de acesso

**Data:** 2026-07-23  
**Status:** aprovado para implementação

## Contexto

O endpoint `GET /dashboard/stats` executa dez consultas em paralelo. O pool criado pelo gateway
aceita mais sessões do que o limite compartilhado disponível no Supabase em modo de sessão. Em
picos ou recarregamentos próximos, o banco responde com `EMAXCONNSESSION` e o frontend, que
descarta o estado ao desmontar, apresenta o dashboard vazio.

## Objetivos

- Respeitar o limite de conexões do banco mesmo com vários usuários simultâneos.
- Colocar consultas excedentes em uma fila previsível, sem falhar por pico de sessões.
- Evitar trabalho duplicado quando a mesma organização solicitar o dashboard simultaneamente.
- Manter o último resultado válido visível enquanto uma atualização está em andamento ou falha.
- Atualizar o dashboard periodicamente sem gerar pressão excessiva no banco.

## Alternativas consideradas

1. Apenas aumentar o limite do banco: posterga o problema e aumenta o consumo compartilhado.
2. Apenas reduzir o `max` do `pg.Pool`: o próprio driver cria uma espera, mas a política fica
   implícita e é mais difícil provar por teste.
3. Fila explícita no serviço, pool com o mesmo limite e cache no frontend: torna o limite
   observável, testável e protege tanto o banco quanto a experiência do usuário.

A terceira alternativa foi escolhida.

## Desenho

O `DashboardStatsService` terá uma fila FIFO compartilhada pela instância do serviço. No máximo
duas consultas SQL serão executadas simultaneamente; as demais aguardarão sua vez. O `pg.Pool`
também será configurado com `max: 2`, garantindo que o gateway não abra mais sessões do que a
política permite.

Solicitações simultâneas para a mesma organização compartilharão a mesma `Promise` de carregamento.
Assim, dez usuários da mesma organização causam uma carga de dez consultas, e não cem. A entrada
em andamento será removida ao concluir ou falhar, permitindo nova tentativa.

No frontend, `useDashboard` passará a usar o React Query já configurado no aplicativo. A chave do
cache incluirá a organização ou o usuário autenticado para impedir mistura de dados. O resultado
válido permanecerá no cache ao navegar entre menus e durante falhas de atualização. Enquanto o
dashboard estiver aberto, uma atualização em segundo plano ocorrerá a cada 60 segundos.

Se ainda não existir nenhum dado válido, a área de atividades mostrará carregamento ou uma
mensagem de falha com ação para tentar novamente; não parecerá uma lista legitimamente vazia.

## Tratamento de falhas

- Toda vaga da fila será liberada em `finally`, inclusive quando uma consulta falhar.
- Uma falha não bloqueará as consultas seguintes.
- Uma atualização malsucedida não substituirá o último resultado válido do React Query.
- O erro inicial continuará disponível ao componente para apresentar uma nova tentativa.
- Não haverá persistência no navegador; o isolamento entre sessões e organizações será preservado.

## Validação

- Teste do gateway comprova que nunca há mais de duas consultas ativas.
- Teste do gateway comprova que a fila continua depois de uma consulta rejeitada.
- Teste do gateway comprova que chamadas simultâneas da mesma organização compartilham a carga.
- Teste frontend comprova uso do React Query, chave isolada, atualização periódica e preservação do
  dado anterior.
- Testes, typecheck e lint escopados serão executados antes da entrega.

## Critérios de aceite

- Picos de acesso não causam abertura de sessões acima do limite definido pelo dashboard.
- Recarregamentos simultâneos são enfileirados e processados.
- O dashboard mantém a última informação válida durante atualização ou erro transitório.
- Ao voltar pelo menu, os dados em cache aparecem imediatamente e são atualizados em segundo plano.
- O usuário pode tentar novamente quando a primeira carga falhar.
