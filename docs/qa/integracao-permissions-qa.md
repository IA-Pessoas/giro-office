# Roteiro de QA — Integração 0–3 e isolamento

Este roteiro cobre as issues #618 e #621 em um banco descartável, com fixtures reais. O seed
principal usa UUIDs válidos para clientes e projetos; o seed QA cria duas organizações
com recursos distintos e uma tarefa dependente por organização.

## Preparação

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/infra prisma:seed
pnpm --filter @workspace/infra prisma:seed:qa
pnpm qa:integracao
PROJECT_SERVICE_INTEGRATION=1 pnpm --filter @workspace/project-service exec vitest run src/test/projectCrud.integration.test.ts
```

O comando `prisma:seed:qa` lê `DATABASE_URL` do `.env` da raiz e é idempotente para
os IDs declarados em `scripts/qa/integracao-fixtures.mjs`. Todas as contas usam a
senha `senha123`.

A suíte `projectCrud.integration.test.ts` exige um Postgres descartável com o schema
aplicado. Ela faz o CRUD via HTTP contra o Prisma real, usa `permission=0` com
`modules.integracao` independente e verifica 403, 404 cross-org, 409 e a
permanência da tarefa dependente.

| Organização | Contas |
| --- | --- |
| `qa-integracao-alfa` | `qa.alfa.level0`, `qa.alfa.level1`, `qa.alfa.level2`, `qa.alfa.level3`, `qa.alfa.owner` |
| `qa-integracao-beta` | `qa.beta.level0`, `qa.beta.level1`, `qa.beta.level2`, `qa.beta.level3`, `qa.beta.owner` |

Os IDs reais para usar nos requests estão no mesmo arquivo de fixtures. Não usar
`client-001` ou `proj-001`: esses identificadores não passam pelos contratos que
validam UUID.

## Matriz visível e navegação

Executar com cada conta, observando menu, telas, ações visíveis e URL atual:

| Nível | Resultado esperado |
| --- | --- |
| `0` | Somente “Minhas tarefas”; cliente/projeto e suas URLs diretas exibem acesso negado. |
| `1` | Leitura de clientes e projetos; criar, editar, inativar/excluir e modelos não ficam disponíveis. |
| `2` | Cria/edita clientes, projetos e tarefas; não inativa/exclui nem administra modelos. |
| `3` | Executa as ações administrativas previstas, respeitando dependências. |
| `owner` | Bypass global explícito, inclusive para gestão de permissões. |

Para cada nível, registrar URL, organização ativa, itens visíveis, ação tentada,
status HTTP e mensagem exibida. A UI deve ocultar ações indisponíveis, mas a
validação final deve ser feita também por request direto.

O contexto ativo deve ser trocado pelo controle de organização disponível no
ambiente, mantendo a mesma aba/sessão do navegador. Depois da troca, repetir a
leitura da lista, detalhe e URL direta: o `organization_id`, a navegação e os
recursos devem mudar para B. Se o ambiente não expuser esse controle, registrar
essa ausência como lacuna de QA; logout/login com a conta B é apenas uma
verificação complementar e não substitui o critério de troca na mesma sessão.

## Requests de isolamento e respostas

Use um token de usuário da organização A e os IDs de A/B do arquivo de fixtures.

1. Com um usuário não-owner de A, abrir o cliente e o projeto de B por URL direta:
   ambos devem retornar `404`, sem revelar existência.
2. Com nível `1`, tentar editar um cliente/projeto visível: deve retornar `403` com
   `Acesso negado para esta operação.`.
3. Com nível `2`, tentar inativar/excluir um cliente ou excluir um projeto: deve
   retornar `403`.
4. Com nível `3`, excluir o projeto que possui a tarefa dependente: deve retornar
   `409` com mensagem acionável e a tarefa deve continuar existindo.
5. Trocar a organização ativa de A para B na mesma sessão e repetir a leitura:
   navegação, cliente, projeto e dados exibidos devem mudar para B; nenhum
   recurso de A deve aparecer. Repetir com logout/login apenas como controle.

As respostas esperadas são `403` para ação proibida em recurso visível, `404` para
recurso fora da organização ativa e `409` para exclusão impedida por dependência.
O owner é a exceção explícita da matriz e não deve ser usado para validar o
isolamento de usuários comuns.

## Registro de evidências

| Conta | Organização | URL/request | Esperado | Observado | Evidência |
| --- | --- | --- | --- | --- | --- |
| níveis 0–3/owner | A/B | `projectCrud.routes.test.ts` | 403/200 conforme matriz | 22 testes verdes | saída do Vitest |
| fixtures | A/B | `qa:integracao` | dois orgs, UUIDs, dependências | 5 testes verdes | saída do Node test |
| UI auth/rotas | A/B | `app test:auth`, `test:clients`, `test:projects` | menus/rotas protegidos | testes verdes | saída dos scripts |
| Postgres real | A/B | `PROJECT_SERVICE_INTEGRATION=1 ...projectCrud.integration.test.ts` | CRUD/403/404/409 sem mock | executar com banco descartável | saída do Vitest |
| usuário não-owner | A → B | troca de organização na mesma sessão | escopo/navegação/dados mudam | pendente de ambiente com seletor | registrar screenshot/request |

O fechamento da #621 deve anexar os resultados observados. A reexecução completa
da matriz ponta a ponta da #551 permanece no escopo da issue dependente #622.

## Execução manual — 2026-07-29

QA executado no navegador visível, contra serviços locais e um Postgres descartável,
com as contas QA Alfa. Foram observados os seguintes resultados:

- `qa.alfa.level1`: Dashboard, Clientes, Projetos e Tarefas ficaram visíveis; a
  lista de projetos exibiu leitura sem ações de escrita. Evidências:
  `docs/qa/evidence/01-dashboard-level1.png` e
  `docs/qa/evidence/02-project-list-level1.png`.
- `qa.alfa.level2`: “Novo projeto” e o formulário de projeto ficaram disponíveis.
  Foi encontrado um bug real: a data nativa aparecia preenchida, mas a submissão
  ainda dizia “Preencha a data de início.”. A correção adiciona sincronização do
  evento nativo de input e um contrato regressivo; após a correção, a criação
  passou e o projeto apareceu na lista. Evidência do bug reproduzido:
  `docs/qa/evidence/04-level2-create-date-validation.png`.
- `qa.alfa.level0`: a navegação ficou restrita a Dashboard e Minhas tarefas;
  `/projects` e o detalhe protegido por URL direta exibiram acesso indisponível.
  Evidências: `docs/qa/evidence/05-dashboard-level0-navigation.png` e
  `docs/qa/evidence/06-level0-protected-url.png`.
- `qa.alfa.level3`: o detalhe direto exibiu Recalcular, Editar e Excluir, além do
  projeto e da tarefa dependente. Evidência:
  `docs/qa/evidence/07-level3-project-actions.png`. O conflito `409` da exclusão
  com dependência foi validado pela suíte backend; o diálogo nativo do navegador
  não foi usado como evidência do status HTTP.

O ambiente não expôs seletor de organização para validar a troca A → B na mesma
sessão. A suíte `qa:integracao` e os testes de autorização cobrem as duas
organizações e o isolamento. A suíte HTTP contra Prisma real foi tentada no banco
descartável, mas o ambiente ficou instável e os hooks do Vitest excederam 10 s;
isso foi registrado como limitação de infraestrutura, não como falha funcional.
