# Implementação conjunta — issues #530 e #531: Visualizador de TI

Data: 2026-07-29

## Resultado

- O perfil Visualizador (`ti = 1`) passou a ver a aba **Ramais** junto das abas
  de autoatendimento já existentes.
- O Visualizador pode listar Ramais por `GET /ti/extensions/list` e consultar
  detalhe por `GET /ti/extensions/:id`.
- Criação e atualização de Ramais continuam restritas ao Administrador:
  `POST /ti/extensions` e `PATCH /ti/extensions/:id` retornam `403` para o
  Visualizador.
- Inventário, Estoque, Senhas e Robôs continuam ausentes das abas do
  Visualizador e recusam suas superfícies de leitura na API.
- O guard compartilhado não foi reduzido: `TiPermissionLevel.Technician`
  continua com nível `2`. Somente os dois guards GET de Ramais foram alterados
  para `TiPermissionLevel.Viewer`.

Neste escopo, “buscar Ramais” foi implementado como a consulta de detalhe já
existente (`GET /:id`). Não foi criado filtro textual `search`, pois o contrato
atual não possui esse filtro e o mapa de descoberta orienta não inventá-lo sem
confirmação.

## Arquivos alterados

### Produção

- `app/src/modules/ti/components/TiPage.tsx`
  - adiciona Ramais a `SELF_SERVICE_TI_TABS`;
  - preserva Inventário, Estoque, Senhas e Robôs apenas em `TI_TABS`, usada por
    administradores.
- `services/ti-service/src/routes/tiExtension.routes.ts`
  - libera somente `GET /list` e `GET /:id` para
    `TiPermissionLevel.Viewer`;
  - mantém `POST /` e `PATCH /:id` em `TiPermissionLevel.Admin`.

### Testes

- `app/src/modules/ti/run-ti-tests.mjs`
  - confirma Ramais na navegação de autoatendimento;
  - confirma ausência das quatro abas sensíveis;
  - preserva a prova de que ações e carregamentos administrativos de Ramais
    dependem de `canManageExtensions`.
- `services/ti-service/src/test/tiExtension.routes.test.ts`
  - cobre listagem e detalhe de Ramais com `ti = 1`;
  - cobre POST e PATCH recusados para `ti = 1`.
- `services/ti-service/src/test/tiInventory.routes.test.ts`
  - cobre listagem e detalhe recusados para Viewer.
- `services/ti-service/src/test/tiStock.routes.test.ts`
  - cobre itens, detalhe, movimentos, categorias e locais recusados para
    Viewer.
- `services/ti-service/src/test/tiPassword.routes.test.ts`
  - explicita Viewer nos casos 403 de lista e detalhe.
- `services/ti-service/src/test/tiRobot.routes.test.ts`
  - cobre lista, detalhe e execuções recusados para Viewer.

## Evidência TDD

### RED

- O teste focal de UI falhou porque `SELF_SERVICE_TI_TABS` não continha
  `extensions/Ramais`.
- O teste focal de Ramais executou 8 casos e falhou exatamente nos dois GETs:
  ambos retornaram `403`, quando o novo contrato esperava `200`. Os 6 demais,
  incluindo as escritas recusadas, passaram.

### GREEN

- Teste focal de UI: passou.
- Rotas de Ramais: `8 passed`.
- Fronteira negativa Viewer:
  `12 passed | 54 skipped` nos quatro arquivos sensíveis.

## Validações

- `pnpm --filter @workspace/app test:ti`: passou.
- `pnpm --filter @workspace/ti-service exec vitest run src/test/tiExtension.routes.test.ts`:
  `8 passed`.
- `pnpm --filter @workspace/ti-service exec vitest run
  src/test/tiInventory.routes.test.ts src/test/tiStock.routes.test.ts
  src/test/tiPassword.routes.test.ts src/test/tiRobot.routes.test.ts -t
  "rejects viewer permission"`: `12 passed`.
- `pnpm --filter @workspace/ti-service typecheck`: passou com
  `DATABASE_URL` local descartável apenas para gerar o Prisma Client.
- `pnpm --filter @workspace/app typecheck`: passou após gerar o artefato local
  ignorado de `@workspace/api`.
- Biome nos arquivos alterados: passou.
- `git diff --check`: passou.

Graphify não possuía grafo local neste worktree; a descoberta e a revisão
foram feitas pelo fallback manual com `rg`, leitura dos arquivos reais e busca
final dos guards.

## Falha basal fora do escopo

A execução combinada dos cinco arquivos de rota teve `72 passed` e `2 failed`.
As duas falhas são casos já existentes de colisão de categoria de Estoque:
esperavam `409` e receberam `500`. Nenhum arquivo de produção de Estoque foi
alterado nesta implementação; o fluxo não foi corrigido para evitar expansão
das issues #530/#531. Os casos Viewer adicionados nesse mesmo arquivo passaram
quando executados de forma focal.

## Entrega

- Nenhum push ou PR foi criado.
