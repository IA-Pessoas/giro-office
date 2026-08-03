# RH Requests Pagination Design

## Objetivo

Fechar o achado reaberto na issue #430 para `RH > Solicita??es`, impedindo que a tela carregue e renderize todos os registros de uma vez e fazendo o total representar o resultado filtrado completo.

## Contrato

`GET /rh/requests` aceitar? `page` e `limit` al?m dos filtros existentes e retornar?, dentro do envelope padr?o, `{ items, total, page, pageSize, hasMore }`. O limite padr?o ser? 20, reutilizando `DEFAULT_PAGE_SIZE` e `PaginationControls` j? existentes. O backend filtrar? por organiza??o e filtros antes de executar `findMany` e `count` em paralelo.

## Frontend

`RhRequestsSection` manter? a p?gina local, resetar? para 1 ao alterar filtros, passar? a consumir `data.items` e exibir? total, faixa e navega??o com o componente compartilhado. O dashboard ser? adaptado apenas para ler `data.items`; permiss?es, estados de loading/erro/vazio e muta??es permanecem iguais.

## Arquivos

- Backend: schemas, service, rota, OpenAPI e testes em `services/rh-service`.
- Frontend: tipos, contrato/service/hook e `RhRequestsSection`, al?m do consumidor do dashboard e teste estrutural em `app/src/modules/rh`.
- Reuso: `app/src/shared/pagination/pagination.ts` e `app/src/shared/components/ui/PaginationControls.tsx`.

## Verifica??o

Testar filtros, `skip/take`, `count`, `hasMore`, query inv?lida, permiss?es, regress?o do m?dulo RH, typecheck/build, smoke coverage, lint, diff whitespace e UI autenticada quando dispon?vel.

## Performance

Offset pagination ? intencional para esta lista operacional de p?ginas rasas. A consulta usar? filtragem e proje??o no banco, limite m?ximo de 100 e `Promise.all` para evitar I/O serializado; n?o haver? cursor, cache ou abstra??o nova.
