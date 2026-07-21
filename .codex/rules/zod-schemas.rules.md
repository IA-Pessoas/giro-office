Fonte original: .cursor/rules/schemas-zod.mdc

Metadados originais do Cursor:
System.Object[]

# Schemas Zod (shared + por serviço)

## Objetivo

Validar **entrada HTTP** (body, query, params) de forma tipada e consistente: falhas viram `ServiceError` 400 com mensagem da primeira issue do Zod, via `parseWithZod` exportado por `@workspace/shared`.

## Onde fica o quê

| Local | Conteúdo |
|-------|----------|
| `shared/src/schemas/` (barrel `index.ts`) | `parseWithZod`, helpers reutilizáveis (`zNonEmptyText`, `zIsoDate`, etc.). Só o que **dois ou mais serviços** (ou camadas compartilhadas) precisam igual. |
| `services/<nome>/src/schemas/` | Schemas **do domínio daquele serviço**: enums, objetos de body/query/params por recurso. Um arquivo por agregado/recurso, ex.: `request.schemas.ts`, `category.schemas.ts`. |

## Quando usar schemas Zod

**Usar** em rotas que recebem body JSON, query com filtros obrigatórios/opcionais, ou params tipados (ids UUID, etc.). O padrão é parsear **na rota** antes de chamar o service:

- `const body = parseWithZod(createFooBodySchema, req.body);`
- `const query = parseWithZod(listFooQuerySchema, req.query);` (ou objeto montado a partir de `req.query` quando necessário)
- `const params = parseWithZod(fooIdParamsSchema, req.params);`

**Não é obrigatório** para rotas sem payload relevante (ex.: health, ping), ou quando não há dados a validar.

**Evitar duplicar** a mesma validação de entrada no service: o service pode assumir tipos já validados pela rota. Validações de **negócio** (existência no banco, permissão, estado) continuam no service e podem lançar `ServiceError` apropriado.

## Quando colocar código em `shared` vs no serviço

- **Shared**: função genérica `parseWithZod`; refinamentos de string/data usados em vários serviços; helpers estáveis e sem regra de negócio de um único domínio.
- **Serviço**: shapes específicos de API (`createXBodySchema`), enums de domínio (`rhRequestStatusSchema`), combinações que só aquele serviço expõe.

Se um helper só aparece em **um** serviço, mantê-lo no `schemas` desse serviço até haver segunda necessidade.

## Convenções de implementação (Zod)

- **Objetos de entrada**: preferir `.strict()` para rejeitar chaves desconhecidas no body/query tratado como objeto.
- **Nomes de exports**: `create<Entity>BodySchema`, `update<Entity>BodySchema`, `delete<Entity>BodySchema`, `list<Entity>QuerySchema`, `<entity>IdParamsSchema` (ajustar ao caso; o importante é ser previsível e alinhado ao verbo/rota).
- **Texto obrigatório vindo de cliente** (string ou número coerced): usar `zNonEmptyText("nomeDoCampo")` do shared quando couber.
- **Datas em ISO**: usar `zIsoDate("campo")` do shared quando o contrato for data parseável.
- **PATCH / atualização parcial**: campos opcionais no objeto + `.refine(...)` exigindo **pelo menos um** campo alterável, com mensagem clara em português.
- **Query string**: Express pode entregar array para chaves repetidas; usar `z.preprocess` quando for preciso normalizar (ex.: pegar primeiro elemento) antes do schema.
- **UUIDs**: `z.string().uuid({ message: "... inválido." })` em query/params quando o contrato for UUID.
- **Mensagens**: em português, específicas ao campo ou regra (`message` nos refinamentos e nos `.uuid()`).

## `parseWithZod` e erros

- Importar `parseWithZod` de `@workspace/shared` (reexportado pelo pacote junto com o restante do shared, após o barrel `shared/src/schemas` existir no projeto).
- Em falha de parse, o helper lança `ServiceError(400, ...)` a partir da primeira issue do Zod; não é necessário envolver em `try/catch` só por validação — o handler global de erro trata como os demais erros da rota.

## Imports (ESM)

- Schemas do próprio serviço: `from "../schemas/foo.schemas.js"` (extensão `.js`).
- Helpers e `parseWithZod`: `from "@workspace/shared"`.

## Nome de arquivos

- Por recurso/domínio: `message.schemas.ts`, `request.schemas.ts`, `timeClockRequest.schemas.ts`.
- Evitar um único arquivo gigante com todos os schemas do serviço; agrupar por contexto de API.

