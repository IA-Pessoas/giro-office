# Issue #1597 — Arraste de processos no Kanban

## Objetivo

Permitir que pessoas com permissão de edição movam processos entre as colunas do Kanban do Regularize usando o mouse. A mudança deve persistir pela API existente e aparecer na coluna correspondente, sem criar status ou regras de transição.

## Interação

- Os cinco status canônicos permanecem como destinos: `Pendente`, `Andamento`, `Protocolado`, `Finalizado` e `Paralisado`. A coluna `Andamento` continua exibindo o rótulo “Em andamento”.
- Um cartão pode ser arrastado para outra coluna canônica, inclusive quando está em “Outros status”. “Outros status” continua sendo uma coluna informativa e não aceita cartões.
- Pessoas com permissão de edição também podem escolher um destino em um controle “Mover para” no cartão. Pessoas sem essa permissão continuam podendo abrir o detalhe, mas não conseguem mudar o status.
- A ação de abrir o detalhe continua disponível em cada cartão. Filtros, busca, contexto organizacional e permissões existentes permanecem aplicados.

## Persistência e estados da interface

- O arraste usa a interação nativa do navegador, sem adicionar uma dependência de drag-and-drop.
- Antes de montar a atualização, a interface carrega os dados completos do processo. Ela envia esses dados preservados com o destino selecionado pelo `PUT /regularize/process`, por meio de `useUpdateRegularizeProcessMutation`.
- O cartão aparece imediatamente na coluna de destino enquanto a atualização está pendente. O cartão fica indisponível para outra mudança simultânea.
- Se a API rejeitar a atualização, o cartão volta à coluna anterior e a interface mostra a mensagem de erro existente para o Regularize.
- A resposta persistida pela API é a fonte final. Por exemplo, as regras financeiras existentes podem manter um processo em `Paralisado`; após sucesso, a interface deve refletir o status retornado/refetch, mesmo que difira do destino tentado.
- Ao mover um processo para fora de um filtro de status ativo, ele deixa de aparecer no resultado filtrado depois da atualização. Com “Todos”, ele aparece na nova coluna.

## Compatibilidade e limites

- Nenhum status, alias, endpoint, permissão ou regra de negócio será criado ou renomeado.
- A validação de status, as regras financeiras, o escopo organizacional, o log de alteração e conflitos de concorrência continuam sob responsabilidade do serviço existente.
- O arraste atende ao uso com mouse. O controle “Mover para” oferece a mesma ação para teclado e tecnologias assistivas; não há requisito de arraste por toque nesta mudança.
- Não se altera automaticamente a data de conclusão nem outros campos do processo ao mover o cartão.

## Validação

- Estender `run-regularize-tests.mjs` para cobrir os destinos, autorização, chamada ao fluxo existente, status retornado pelo servidor e reversão visual em falha.
- Criar uma validação Playwright escopada do quadro que mova um cartão entre colunas e capture screenshot em `output/playwright/`.
- Executar o teste do Regularize, typecheck do app e validação de navegador aplicável; incluir resultados e screenshot na PR.

## Critérios de aceite

- Um usuário com permissão consegue arrastar um cartão entre duas colunas canônicas e a alteração persiste após recarregar os dados.
- A UI muda durante a atualização e mostra o estado persistido pelo servidor ao concluir.
- Uma falha restaura o cartão ao status anterior e apresenta erro.
- Usuários sem permissão não conseguem alterar status por arraste ou pelo controle acessível.
- As regras financeiras existentes continuam prevalecendo sobre o status solicitado.
- A abertura do detalhe, lista/tabela, filtros e busca continuam funcionando.
