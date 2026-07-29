Fonte original: .cursor/rules/rotas-express.mdc

Metadados originais do Cursor:
System.Object[]

# Rotas Express

## Prefix-based routing
- Em microservices, adotar prefix-based routing com um prefixo raiz claro por servico ou dominio principal.
- O `app.ts` do servico monta as rotas no prefixo raiz do dominio, por exemplo:
  - `app.use("/user", userRoutes)`
  - `app.use("/task", taskRoutes)`
  - `app.use("/project", projectRoutes)`
  - `app.use("/rh", rhRoutes)`
  - `app.use("/organizations", organizationRoutes)`
  - `app.use("/audit", createAuditPublicRouter(...))`
  - `app.use("/internal", createAuditInternalRouter(...))`
- Dentro do arquivo de rota, nao repetir o nome do recurso principal se ele ja veio do mount do `app.ts`.
- Evitar redundancia como `/user/users`, `/task/tasks` e `/project/projects`.
- Preferir paths enxutos como `/user`, `/task` e `/project`.

## Composicao de routers
- O `app.ts` deve ser o ponto de composicao dos routers publicos do servico.
- O arquivo em `routes/` deve declarar paths relativos ao mount do `app.ts`, nao paths absolutos do servico inteiro.
- Para dominios com mais de um contexto de exposicao, separar routers por responsabilidade em vez de misturar tudo em um unico `Router`.
- Exemplo recomendado:
  - `createAuditPublicRouter()` montado em `/audit`
  - `createAuditInternalRouter()` montado em `/internal`
- Mesmo quando houver router interno, preservar a mesma disciplina:
  - prefixo definido no `app.ts`
  - paths relativos dentro do router
  - sem duplicar `/audit` ou `/internal` no arquivo errado

## Convencao para colecao, detalhe e subrecursos
- Para o recurso principal do servico:
  - `GET /prefixo` = detalhe/busca unitaria quando o contrato usar query, params ou body para identificar o recurso
  - `POST /prefixo` = criar
  - `PUT` ou `PATCH /prefixo` = atualizar
  - `DELETE /prefixo` = remover/desativar
- Quando houver conflito entre dois `GET` no mesmo prefixo, usar:
  - `GET /prefixo/list` para listagem/colecao
  - `GET /prefixo` para detalhe
- So criar subrotas nomeadas quando forem subrecursos reais ou acoes especificas do dominio.
- Exemplos corretos:
  - `/user`, `/user/:id`, `/user/:id/photo`
  - `/task`, `/task/list`, `/task/model`, `/task/model/list`
  - `/project`, `/project/list`, `/project/progress`
  - `/rh/point-config`

## Padrao de handler
```typescript
router.METODO("/path", async (request, response, next) => {
  try {
    // logica
    response.json(createSuccessResponse(result));
  } catch (err) {
    logError("Contexto", { err });
    next(err);
  }
});
```

## Validacao
- Validar body, query e params antes de chamar services.
- Preferir Zod + `parseWithZod` de `@workspace/shared` e schemas em `services/<servico>/src/schemas/` (ver `.cursor/rules/schemas-zod.mdc`).
- Para checagens pontuais de contexto HTTP (ex.: `organization_id` / `user_id` ausente apos middleware), `throw new ServiceError(400, "mensagem")` continua valido.

## Consistencia de contrato
- O mesmo path publico deve estar alinhado entre router, `app.ts`, OpenAPI e testes.
- Se a rota passar pelo gateway, alinhar tambem com registry, audit e OpenAPI agregada do gateway.
- Health checks, docs e middlewares cross-cutting devem ser montados no `app.ts`, nao escondidos dentro de routers de dominio.

