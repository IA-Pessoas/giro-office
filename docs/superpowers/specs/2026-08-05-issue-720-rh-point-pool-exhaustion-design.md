# Issue #720 — Isolamento das queries de Ponto e limite do pool do RH

## Contexto

A issue relata que uma mutação de Ponto retorna `200` e o toast de sucesso, mas a invalidação global `['rh']` refaz em paralelo queries de solicitações e usuários operacionais. Uma consulta secundária pode falhar com `EMAXCONN: max clients reached`, produzindo uma mensagem de erro contraditória.

O `rh-service` instancia `PrismaPg` sem `max` explícito. O adapter usa o pool padrão do driver; a documentação atual do Prisma registra `max: 10` como padrão para PostgreSQL com `@prisma/adapter-pg`. O serviço deve ter um limite explícito e configurável para não ampliar silenciosamente a pressão sobre o pooler compartilhado.

## Desenho aprovado

1. Criar uma chave de prefixo `RH_POINT_QUERY_KEY = ['rh', 'point']` e fazer todas as mutações de Ponto invalidarem apenas esse prefixo. As queries de configuração, registros, ponto do dia, resumo e ajustes continuam sendo atualizadas pelo prefixo comum do domínio Ponto.
2. Manter as queries do contador de solicitações desabilitadas enquanto a aba ativa não for `requests`. Ao abrir a aba, o cache existente continua disponível e a query pode buscar o estado atual.
3. Adicionar `DATABASE_POOL_MAX` ao `rh-service`, com parsing validado e valor padrão `5`, e passá-lo como `max` para `PrismaPg`. O valor fica documentado no `.env.example` e no README do serviço.
4. Não alterar os demais serviços Prisma nesta issue: eles serão auditados como contexto, mas não há evidência de que um refactor transversal seja necessário para corrigir a carga redundante gerada pelo fluxo de Ponto. Isso mantém o patch reversível e evita escolher um limite global sem conhecer o orçamento do pooler.

## Interfaces e comportamento

- Não há alteração de endpoints, payloads ou status HTTP.
- Falha real da mutação de Ponto continua chegando ao `catch` da tela e exibindo a mensagem específica da API.
- Sucesso da mutação não invalida `['rh', 'requests']`, `['rh', 'assignable-users']`, `['rh', 'score']` ou outros ramos fora de Ponto.
- `DATABASE_POOL_MAX` aceita inteiro positivo; ausência usa `5`. Valor inválido deve falhar na validação de ambiente, em vez de criar um pool sem limite intencional.

## Testes e evidências

- Teste do módulo RH: garantir que `useRhPoint.ts` usa apenas `RH_POINT_QUERY_KEY` nas mutações e que o shell condiciona o contador à aba de solicitações.
- Teste Vitest do adapter: garantir que `PrismaPg` recebe `connectionString` e o `max` configurado pelo ambiente.
- Rodar testes focados, typecheck do app e do `rh-service`, build do serviço e revisão do diff.
- Playwright só será usado se o ambiente local tiver a aplicação e autenticação necessárias; a alteração não é visual e não exige screenshot na PR.

## Fora de escopo

- Ajustar tamanho do pool de todos os microserviços sem medição ou orçamento de conexões.
- Mudar mensagens/toasts globais, contratos HTTP ou schema Prisma.
- Adicionar retry, fila, cache novo ou concorrência customizada.
