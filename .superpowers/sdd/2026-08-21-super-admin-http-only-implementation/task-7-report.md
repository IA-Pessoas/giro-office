# Tarefa 7 — Auditoria global exclusiva da plataforma

## Entrega

- A busca `GET /platform/audit/requests`, reescrita pelo gateway para
  `GET /audit/requests`, aceita tenant omitido somente para o par exato
  `auth_kind=platform` e `platform_role=super_admin`, com token interno válido.
- Administradores organizacionais continuam exigindo `organizationId` e permissão de auditoria;
  a consulta por `requestId` permanece exclusivamente organizacional.
- Headers desconhecidos, papel de plataforma inválido, ausência de tenant organizacional e
  tentativa de combinar identidade de plataforma com organização/permissão são negados antes do
  repository.
- A busca global omite o predicado de organização, preserva filtros no banco e usa paginação
  limitada a uma janela de 10.000 registros.
- A ordenação global é total por `created_at DESC, id DESC`, coberta por índice composto aditivo e
  migration versionada. Nenhuma migration foi aplicada em banco externo.
- OpenAPI, README e smoke do path público foram alinhados. Nenhuma dependência foi adicionada.

## Autorização e TDD

- O usuário autorizou explicitamente a leitura cross-tenant exclusiva de `platform/super_admin` e
  o índice aditivo antes da implementação de produção.
- RED inicial: 6 falhas esperadas cobriram autorização global, filtro Prisma, ordenação estável,
  limites de paginação/filtros e OpenAPI.
- RED adicional: identidade `platform` com organização e permissão forjadas alcançava o repository
  de detalhe e retornava 404; após o hardening, retorna 403 sem chamada ao repository.
- GREEN inicial: audit-service com 17 testes aprovados e 1 integração real opt-in ignorada.

## Correções da revisão

- O total global usa `count` limitado a `10000 + pageSize` e ainda aplica `Math.min` defensivo;
  assim, a última página anunciada sempre tem offset máximo de 10.000. O `count` organizacional
  permanece integral e inalterado.
- O ramo global seleciona e serializa somente `id`, `requestId`, `organizationId`, `method`, `path`,
  `statusCode`, `outcome`, `durationMs`, `serviceSource` e `createdAt`. Query, identidade do usuário,
  IP, user-agent, origem, erros, metadata e changes não são lidos nem retornados. O DTO
  organizacional permanece completo.
- A identidade platform com `organizationId` ou qualquer header `permission`, válido ou inválido,
  retorna 403 antes do repository. Casos isolados e combinados foram cobertos.
- O OpenAPI passou a documentar todos os filtros suportados, `maxLength=200`, limites combinados de
  paginação e respostas 400/401/403.
- RED da revisão: 5 falhas iniciais comprovaram os quatro achados; um RED adicional comprovou que
  `permission` não numérica ainda retornava 400 em vez de 403.
- GREEN da revisão: suíte focal 17/17 e audit-service completo 22/22, com 1 integração real opt-in
  ignorada.

## Validações

- Audit-service: 22/22 testes executados aprovados; 1 teste de banco real opt-in ignorado.
- Gateway afetado: 175/175 testes de integração, proxy antiforja, registry, policy e catálogo
  aprovados.
- Typecheck: audit-service e gateway aprovados; shared com 54/54 testes e build aprovado.
- Prisma: schema validado estaticamente com URL local fictícia; nenhuma conexão/migration externa.
- Biome escopado: 18 arquivos aprovados.
- Smoke da rota: exatamente 1 expectativa positiva 200 e 1 negativa 401, ambas com handler.
- `git diff --check`: aprovado.
- Graphify services atualizado localmente; `graphify-out` não foi versionado.
- Validações locais executaram em Node 24; o workspace declara Node 22 e o gate final permanece na
  Tarefa 10.

## Performance review

- Antes: busca sempre tenant-scoped, ordenação apenas por `created_at`, sem acesso global.
- Depois: mesma consulta paginada e filtrada no banco; busca global remove o predicado de tenant,
  limita offset a 10.000, limita o count a `10000 + pageSize`, projeta só dez colunas e usa índice
  `(created_at DESC, id DESC)`.
- Gargalo dominante: leitura/ordenação no PostgreSQL. Não há N+1, concorrência adicional, cache ou
  materialização sem limite.
- Trade-off: paginação por offset foi preservada para manter o contrato existente; a janela limitada
  evita offset profundo. Cursor só se justifica com mudança futura explícita do contrato.

## Débitos basais fora do diff

- `pnpm smoke:coverage` continua falhando somente por `services/src` ausente do registry e por
  `DELETE /fiscal/ncm`, `DELETE /fiscal/icms` e `DELETE /fiscal/ipi` ausentes do manifesto. A rota
  `/platform/audit/requests` não aparece mais nos erros do checker.

## Commit

- `122b900f feat(audit): allow isolated platform search`
- `8fa51526 fix(audit): bound platform search exposure`
