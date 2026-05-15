# AGENTS.md

Instrucoes para o Codex neste repositorio, adaptadas de .cursor/rules/*.mdc.

## Como aplicar estas regras
- As regras originais do Cursor continuam em .cursor/rules/ e nao foram removidas.
- Regras marcadas como alwaysApply: true devem ser tratadas como instrucoes globais do projeto.
- Regras com globs devem ser aplicadas quando a tarefa tocar arquivos compativeis com o escopo indicado.
- Quando houver conflito entre uma regra geral e uma regra especifica de arquivo/dominio, prefira a regra mais especifica.
- Preserve estas instrucoes em portugues ao trabalhar neste workspace.

---

## Regra importada de .cursor/rules/projeto-workspace.mdc

Escopo original do Cursor:
- description: Regras padrao do projeto Workspace
- alwaysApply: true

# Regras do Projeto Workspace

## Idioma
- Sempre responder em portugues.

## Stack
- Microservices em `services/` (pnpm workspace)
- TypeScript, ESM (imports com extensao `.js`)
- Biome para lint/format
- Express, Prisma, Supabase

## Formatacao (Biome)
- Aspas duplas
- 2 espacos de indentacao
- Trailing commas
- Line width: 100
- Semicolons sempre

## Logging (`@workspace/shared`)
- Imports: `debug`, `info`, `warn`, `error` de `@workspace/shared`.
- Assinatura: `(message: string, context?: Record<string, unknown>)`.
- Quando `error` conflitar com nome de variavel, usar `import { error as logError }`.
- Servicos com `createLogger` devem preferir o logger da instancia (`logger.info`, `logger.error`, etc.).

## Tratamento de erros
- Usar `ServiceError` de `@workspace/shared` para erros HTTP 4xx/5xx.
- Rotas devem preferir `throw new ServiceError(...)` para erros esperados, deixando o handler global serializar a resposta.
- Em `catch`, registrar erro como primeira linha util com `error` ou `logError`, antes de ramificacoes.

## Respostas da API
- Sucesso: `createSuccessResponse` de `@workspace/shared`.
- Erro: deixar o handler de erro serializar; nao montar corpo de erro manualmente sem necessidade documentada.

## Arquitetura e estrutura
- O padrao oficial do projeto esta em `services/`.
- A estrutura legado fora desse padrao nao deve ser usada como referencia para novos contratos ou novas implementacoes.
- Servicos atuais: `user-service`, `audit-service`, `organization-service`, `rh-service`, `task-service`, `project-service`, `contabil-service` e `gateway`.
- Codigo compartilhado fica em `shared`.
- Convencao oficial de nomes de arquivos nos servicos atuais:
  - services: `camelCaseService.ts`
  - routes: `camelCase.routes.ts`
  - teste de service: `camelCaseService.test.ts`
  - teste de rota: `camelCase.routes.test.ts`
- Rotas orquestram services; services nao chamam rotas.
- Metodos publicos de service devem ter tipo de retorno explicito; ver `typescript-services.mdc`.
- Em servicos Express, o padrao oficial de entrypoint e:
  - `src/app.ts` para compor a aplicacao
  - `src/server.ts` para bootstrap e inicializacao
- `index.ts` nao deve ser usado como entrypoint principal quando misturar composicao da app com `listen`, logger e leitura de env.

## Gateway
- A configuracao de upstreams pertence ao proprio gateway.
- URLs de upstream devem ser centralizadas em `services/gateway/src/config/env.ts`.
- O gateway deve usar uma registry unica de servicos para runtime, audit e OpenAPI agregada.
- Nao espalhar configuracao de upstream entre `app.ts`, OpenAPI, middlewares e arquivos compartilhados.

## Padrao de rotas HTTP
- O padrao oficial e prefix-based routing.
- Evitar paths redundantes como `/user/users`, `/task/tasks` e `/project/projects`.
- Preferir paths publicos como `/user`, `/task`, `/project`, `/organizations` e `/rh`.
- Quando houver conflito entre `GET` de detalhe e `GET` de colecao no mesmo prefixo, usar:
  - `GET /prefixo` para detalhe
  - `GET /prefixo/list` para colecao
- O `app.ts` do servico deve ser o ponto de montagem dos routers por prefixo.
- Arquivos em `routes/` devem trabalhar com paths relativos ao mount definido no `app.ts`.
- Nao repetir prefixo de dominio dentro do proprio router quando ele ja e aplicado no `app.ts`.
- Para servicos com contrato publico e interno, separar routers explicitamente no `app.ts` em vez de misturar os contextos no mesmo arquivo.
- Exemplo de referencia atual:
  - `organization-service`: `app.use("/organizations", organizationRoutes)`
  - `audit-service`: `app.use("/audit", createAuditPublicRouter(...))` e `app.use("/internal", createAuditInternalRouter(...))`

## Bootstrap de servicos
- O bootstrap de servicos deve ser separado da composicao da aplicacao.
- `server.ts` deve ser responsavel por:
  - carregar env
  - criar logger
  - instanciar a app
  - subir o servidor
- `app.ts` deve permanecer reutilizavel em testes sem subir socket real.
- Scripts de pacote devem preferir:
  - `dev`: `tsx watch src/server.ts`
  - `start`: `node dist/server.js`
  - `main`: `dist/server.js`

## README de servicos
- Todo servico em `services/` deve ter um `README.md` proprio.
- Ao criar um servico novo ou alterar contrato/porta/variaveis relevantes de um servico existente, atualizar tambem o `README.md`.
- O README deve seguir o padrao atual usado em `services/`, com secoes curtas e objetivas:
  - titulo com o nome do servico
  - breve descricao do servico
  - `## Porta local` com a porta padrao atual do env
  - `## Variaveis de ambiente` apontando para `src/config/env.ts` e destacando as principais
  - `## Gateway` ou `## Upstreams`, quando aplicavel
  - `## Desenvolvimento` com o comando `pnpm --filter @workspace/<nome-do-pacote> dev`
- Quando houver prefixo publico no gateway, documentar o prefixo e exemplos de paths publicos.
- Quando houver URL configurada no gateway, documentar a variavel e o exemplo com a porta atual.
- Nao deixar README com portas, URLs ou nomes de variaveis desatualizados em relacao ao codigo.

## Testes
- Toda alteracao de contrato HTTP deve alinhar:
  - rota do servico
  - OpenAPI do servico
  - gateway, se aplicavel
  - testes do servico e do gateway
- Toda rota nova exposta em `services/<servico>/src/openapi/spec.ts` deve entrar tambem no smoke end-to-end do workspace.
- Ao criar um servico novo com contrato HTTP:
  - registrar o `spec.ts` do servico em `scripts/all-services-smoke.manifest.mjs` (`specFiles`)
  - adicionar cobertura do contrato no manifesto do smoke
- O smoke deve refletir o contrato publico real:
  - rotas publicas via gateway devem usar o path publico do gateway
  - rotas internas ou de infraestrutura devem usar `target: "direct"` quando esse for o contrato real
- A cobertura do smoke por rota deve preservar o padrao atual do workspace:
  - 1 expectativa `good` por `service|method|path`
  - ao menos 1 expectativa `bad` por rota, explicita ou gerada automaticamente pelas regras ja existentes
  - excecoes continuam restritas aos casos ja tratados com `pairCoverageExempt`
- Ao alterar rotas, OpenAPI ou manifesto do smoke, validar com `pnpm smoke:coverage`.
- O padrao oficial de organizacao de testes em servicos e:
  - `src/test/`
  - um arquivo `camelCaseService.test.ts` para o service
  - um arquivo `camelCase.routes.test.ts` para a rota
- A referencia de estrutura e o `project-service`.

---

## Regra importada de .cursor/rules/engineering-rules.mdc

Escopo original do Cursor:
- alwaysApply: true

## Para tarefas não triviais

Considere não trivial qualquer tarefa com 3 ou mais etapas relevantes, decisões de arquitetura, integração, ambiguidade, dependências externas ou alto risco de retrabalho.

Nesses casos:

* Escreva um plano curto antes de implementar.
* Quebre o trabalho em etapas objetivas e verificáveis.
* Liste premissas, riscos e dependências.
* Implemente em passos pequenos.
* Verifique cada etapa importante antes de avançar.
* Se a abordagem falhar, pare e replaneje.

---

## Ao implementar

* Faça a menor mudança útil que avance o objetivo.
* Mantenha o código legível e previsível.
* Evite abstrações prematuras.
* Evite duplicação quando ela gerar manutenção ruim.
* Não invente arquitetura para problemas que ainda não existem.
* Explique mudanças importantes em alto nível.

---

## Ao corrigir bugs

* Reproduza o problema antes de corrigir.
* Colete evidências: logs, traces, testes falhando, inputs e contexto.
* Forme hipóteses com base em evidência, não em feeling.
* Teste primeiro a hipótese mais provável e barata.
* Corrija a causa raiz, não apenas o sintoma.
* Verifique se a correção não gerou regressões.
* Não faça mudanças aleatórias só para “ver se resolve”.

---

## Antes de concluir

* Confirme que o resultado atende ao objetivo original.
* Rode testes relevantes.
* Verifique logs, saídas e integrações afetadas.
* Revise casos de borda relevantes.
* Faça uma checagem rápida de regressão.
* Não declare como pronto sem evidência suficiente.

---

## Comunicação

* Resuma plano, progresso, decisões e riscos com clareza.
* Não narre o óbvio.
* Não use texto longo para esconder falta de substância.
* Diga claramente o que foi feito, o que não foi feito e o que ainda é incerto.

---

## Documentação e rastreabilidade

Se o projeto usar arquivos de tarefa, mantenha-os atualizados.
Exemplos:

* `tasks/todo.md` para plano e progresso
* `tasks/lessons.md` para erros recorrentes e prevenção

Se o projeto não usar esses arquivos, mantenha a mesma disciplina no formato existente.

---

## Anti-padrões proibidos

* Codar antes de entender o problema
* Tratar suposição como fato
* Continuar em plano ruim por teimosia
* Declarar sucesso sem verificação
* Fazer hack sem sinalizar limitação
* Expandir escopo sem alinhamento
* Confundir atividade com progresso
* Criar complexidade sem necessidade real

---

## Regra final

Planeje quando necessário. Verifique antes de concluir. Prefira simplicidade. Corrija a causa raiz. Seja honesto sobre o que sabe, o que supõe e o que realmente comprovou.

---

## Regra importada de .cursor/rules/deploy-service-build.mdc

Escopo original do Cursor:
- description: Regras de build/deploy para microservices
- globs: services/*/package.json,docker/**/*.Dockerfile,docker-compose*.yml,scripts/ci/**/*.sh
- alwaysApply: false

# Deploy e Build de Services

## Services com Prisma

Ao adicionar ou padronizar um microservice que importe Prisma gerado, verifique o build em ambiente limpo.

Sinais de que o service depende de Prisma gerado:
- imports de `src/generated/prisma` ou `../generated/prisma`
- uso de `PrismaClient`, modelos Prisma ou enums Prisma dentro de `services/<service>/src`
- entrada em `prismaOutputPath` no `scripts/service-registry.mjs`

Nesses casos, o `services/<service>/package.json` deve seguir o padrao dos services Prisma:

```json
{
  "scripts": {
    "prisma:generate": "node ../../scripts/prisma-generate.mjs",
    "prebuild": "pnpm prisma:generate",
    "predev": "pnpm prisma:generate",
    "build": "tsc",
    "typecheck": "pnpm prisma:generate && tsc --noEmit"
  }
}
```

Nao use apenas `build: "tsc"` em service que depende de `src/generated/prisma`, porque Docker/CI parte de workspace limpo e o client gerado pode nao existir.

## Verificacao obrigatoria

Antes de considerar deploy pronto para um service Prisma:

1. Remova ou ignore a existencia local de `services/<service>/src/generated/prisma`.
2. Rode `pnpm turbo run build --filter=@workspace/<service>`.
3. Confirme que o log mostra `prebuild` -> `prisma:generate` antes do `tsc`.
4. Rode `pnpm --filter @workspace/<service> typecheck` quando o service tiver script `typecheck`.

Se o build so passa porque `src/generated/prisma` ja existia localmente, a padronizacao ainda esta incompleta.

---

## Regra importada de .cursor/rules/frontend-ui-patterns.mdc

Escopo original do Cursor:
- description: Padrões gerais de UI compartilhada no frontend
- globs: app/**/*.{tsx,jsx}
- alwaysApply: false

# Padrões de UI no Frontend

## Padrões visuais compartilhados

- Evitar estilos visuais inline em componentes de tela ou feature, incluindo `style={...}` e constantes locais criadas apenas para controlar apresentação.
- Padrões visuais recorrentes devem ser extraídos para componentes compartilhados, wrappers ou módulos de UI no nível do domínio, em vez de serem redefinidos em várias telas.
- Elementos nativos com apresentação customizada (`select`, `input`, `textarea`, etc.), quando o mesmo padrão visual aparecer em mais de um lugar, devem usar uma implementação compartilhada do domínio: um componente base (ex.: `ClientNativeSelect`) ou classes/tokens exportados de um único módulo de formulário do domínio (ex.: `clientFormControls.ts`), desde que a tela não duplique strings de classe nem `style` apenas para reproduzir o mesmo controle.
- Quando um detalhe visual realmente exigir `style`, ele deve ficar encapsulado apenas no componente base compartilhado responsável por aquele padrão, nunca espalhado nas telas da feature.

## Uso nas features

- Telas e componentes de feature devem consumir componentes de UI compartilhados ou o módulo de formulário do domínio, em vez de recriar localmente o mesmo padrão visual.
- Quando um domínio já possuir controles compartilhados de formulário, deve-se preferir estender essa camada compartilhada em vez de introduzir novo styling local.

## Exemplo (domínio `clients`)

- Controles de formulário alinhados à marca: `app/src/modules/clients/form/clientFormControls.ts` (`clientTextFieldClassName`, `clientTextareaClassName`).
- `select` nativo estilizado (seta, foco, etc.): `app/src/modules/clients/form/ClientNativeSelect.tsx` — qualquer `style` necessário fica só nesse wrapper; as features importam o componente.

---

## Regra importada de .cursor/rules/gateway-routing-standards.mdc

Escopo original do Cursor:
- description: Padrao de roteamento e upstreams do gateway
- globs: services/gateway/**/*.ts
- alwaysApply: false

# Gateway Routing Standards

## Ownership de configuracao
- O gateway deve ser dono da configuracao dos upstreams que consome.
- URLs de upstream devem ficar em `services/gateway/src/config/env.ts`.
- Nao hardcodar URLs em `app.ts`, middlewares, OpenAPI ou testes quando o valor faz parte da configuracao do gateway.
- Nao usar arquivo compartilhado como fonte primaria de URLs especificas do gateway quando `GatewayEnv` puder ser a fonte de verdade.

## Fonte unica de verdade
- O gateway deve ter uma registry unica de servicos, por exemplo em `services/gateway/src/config/serviceRegistry.ts`.
- Essa registry deve concentrar:
  - prefixos publicos roteados pelo gateway
  - target URL do upstream
  - nome logico do servico
  - metadados usados por audit e OpenAPI agregada
- `app.ts`, audit, seguranca e OpenAPI agregada devem consumir essa registry em vez de manter mapas paralelos.

## Prefix-based routing no gateway
- Cada servico exposto pelo gateway deve ter um prefixo publico explicito:
  - `/user`
  - `/task`
  - `/project`
  - `/organizations`
  - `/rh`
  - `/audit`
- O gateway deve resolver servicos por prefixo, sem logica espalhada por matchers ad hoc quando o contrato for prefix-based.
- Evitar duplicacao ou variacao de prefixos para o mesmo servico.

## Contrato publico das rotas
- O gateway deve refletir exatamente o contrato publico dos servicos.
- Nao introduzir redundancia no path, por exemplo:
  - errado: `/user/users`, `/task/tasks`, `/project/projects`
  - certo: `/user`, `/task`, `/project`
- Quando houver conflito entre `GET` de detalhe e `GET` de colecao, o padrao publico deve ser:
  - `GET /prefixo` para detalhe
  - `GET /prefixo/list` para listagem

## OpenAPI e audit
- A OpenAPI agregada do gateway deve usar os mesmos prefixos publicos e a mesma registry do runtime.
- O audit deve identificar `routeTarget` a partir da mesma registry do gateway.
- Evitar qualquer drift entre runtime, audit, docs e testes.

## Testes
- Testes do gateway devem validar:
  - roteamento por prefixo correto
  - paths publicos corretos na OpenAPI agregada
  - `routeTarget` correto no audit
  - resposta 404 para rotas fora da registry

---

## Regra importada de .cursor/rules/rotas-express.mdc

Escopo original do Cursor:
- description: Padroes de rotas Express
- globs: **/routes/**/*.ts
- alwaysApply: false

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

---

## Regra importada de .cursor/rules/schemas-zod.mdc

Escopo original do Cursor:
- description: Zod — shared/schemas, schemas por serviço e padrões de validação
- globs:
- - "**/schemas/**/*.ts"
- - "services/**/src/routes/**/*.ts"
- alwaysApply: false

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

---

## Regra importada de .cursor/rules/service-app-composition.mdc

Escopo original do Cursor:
- description: Composicao de app.ts em microservices Express
- globs: services/*/src/app.ts
- alwaysApply: false

# Service App Composition

## Responsabilidades do `app.ts`
- `app.ts` e o ponto de montagem do servico.
- Ele deve concentrar:
  - middlewares globais (`cors`, `express.json`, `requestContext`, etc.)
  - rotas de infraestrutura como `/health` e `/ready`
  - montagem de OpenAPI/docs
  - montagem dos routers de dominio por prefixo
  - handler global de erros
- Evitar colocar regras de negocio ou detalhes de resource routing diretamente no `app.ts`.

## Separacao entre `app.ts` e `server.ts`
- O padrao oficial para servicos Express do workspace e:
  - `app.ts` para composicao da aplicacao
  - `server.ts` para bootstrap e inicializacao do processo
- `server.ts` deve concentrar:
  - carregamento de env (`dotenv/config`, quando aplicavel)
  - leitura de `env`
  - criacao do logger
  - criacao do servidor HTTP e `listen`
  - logs de start e erro do servidor
- `app.ts` nao deve:
  - chamar `listen`
  - criar logger de bootstrap
  - decidir porta
  - servir como entrypoint executavel do processo
- Evitar `index.ts` como entrypoint quando ele mistura bootstrap e composicao da aplicacao.
- Se existir `index.ts` em um servico Express, ele deve ser tratado como excecao temporaria ou legado a ser migrado para `server.ts`.

## Montagem de routers
- Montar routers com prefixos explicitos no `app.ts`.
- O router de dominio deve expor apenas paths relativos ao seu mount.
- Nao duplicar o prefixo do mount dentro do proprio arquivo de rota.
- Exemplo correto:
  - `app.use("/organizations", organizationRoutes)`
  - `organizationRoutes.get("/", ...)`
  - `organizationRoutes.get("/:id", ...)`

## Routers publicos e internos
- Quando um servico tiver contratos publicos e internos distintos, separar em routers diferentes.
- O padrao recomendado e:
  - router publico montado no prefixo publico do servico
  - router interno montado sob `/internal`
- Nao misturar rotas publicas e internas no mesmo `Router` se isso reduzir clareza de ownership ou regras de seguranca.
- Exemplo de referencia:
  - `app.use("/audit", createAuditPublicRouter(...))`
  - `app.use("/internal", createAuditInternalRouter(...))`

## Erros e logging
- O handler global de erros deve ser montado por ultimo no `app.ts`.
- `createExpressErrorHandler` deve receber:
  - `event` coerente com o servico
  - `fallbackMessage` claro
  - `getContext` quando houver `userId`, `organizationId`, request metadata ou auth encaminhada
- Preferir contexto pequeno e util para diagnostico; nao duplicar payloads inteiros sem necessidade.

## OpenAPI e health
- `/health`, `/ready` e docs sao parte da infraestrutura do servico e devem ficar visiveis no `app.ts`.
- O contrato exposto em `app.ts` deve bater com OpenAPI e testes.

## Bootstrap
- O bootstrap/server deve criar logger de instancia e passar dependencias para `createApp` ou equivalente.
- Evitar helpers globais de log quando o servico ja usa `createLogger`.
- O entrypoint do pacote (`main`, `dev`, `start`) deve apontar para `server.ts` / `dist/server.js`, nao para `index.ts`, quando o servico segue esse padrao.

---

## Regra importada de .cursor/rules/tests-rules.mdc

Escopo original do Cursor:
- description: Padrao de testes em servicos Node.js/Express com Vitest
- globs:
- - "**/*.test.ts"
- alwaysApply: false

# Testes

## Decisao padrao do workspace

- O padrao atual do monorepo para testes em servicos Node.js + Express + TypeScript e **Vitest**.
- Nao introduzir `node:test`, Jest ou outro runner como novo padrao sem necessidade explicita.
- Se um pacote ja usar Vitest, manter Vitest.

## Runner e scripts

- O script padrao dos pacotes deve usar `vitest run`.
- Watch local pode usar `vitest`.
- O pacote pode usar `pnpm exec vitest run` ou `vitest run`, conforme a forma ja adotada nele.
- Type-check continua separado com `tsc --noEmit` ou script equivalente.

Exemplos validos:

```json
{
  "scripts": {
    "test": "pnpm exec vitest run",
    "test:watch": "pnpm exec vitest"
  }
}
```

ou

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

## Imports e estilo

- Usar imports do `vitest` quando necessario:

```ts
import { describe, expect, it, vi } from "vitest";
```

- Imports locais devem seguir o padrao ESM do workspace, incluindo extensao `.js` quando aplicavel.
- Formatação e lint seguem o padrao do workspace.

## Organizacao dos testes

- O padrao oficial do workspace para servicos e `*.test.ts`.
- Nao criar novos arquivos `*.spec.ts`.
- A descricao dos casos deve refletir comportamento observavel.
- Pode ser em portugues ou ingles, mas manter consistencia no arquivo e no pacote.
- Em servicos, os testes devem ficar em `src/test/`.
- O formato de referencia e o `project-service`.
- Evitar misturar `src/test/`, `tests/` e outras pastas no mesmo pacote.

## Estrutura por modulo

- Para cada modulo principal com rota HTTP, criar dois arquivos separados:
  - um teste de service
  - um teste de route
- O par padrao deve seguir o formato:
  - `camelCaseService.test.ts`
  - `camelCase.routes.test.ts`
- Exemplo de referencia real:
  - `projectCrudService.test.ts`
  - `projectCrud.routes.test.ts`
- Nao concentrar todos os testes de um servico em um unico arquivo monolitico.
- Nao misturar testes de service e testes de rota no mesmo arquivo.
- Helpers compartilhados de teste podem ficar em `src/test/`, por exemplo:
  - `envBootstrap.ts`
  - `camelCaseTestUtils.ts`

## Escopo dos testes por tipo

### `camelCaseService.test.ts`

- Deve testar regra de negocio da classe ou modulo de service.
- Deve mockar dependencias de borda, como Prisma, HTTP, storage, fila ou providers externos.
- Nao deve subir app HTTP nem depender de `supertest` salvo necessidade muito especifica.

### `camelCase.routes.test.ts`

- Deve testar o contrato HTTP da rota.
- Deve exercitar o `app.ts` ou o router montado no `app.ts`, preferindo `supertest`.
- Deve validar status, body, headers relevantes, autenticacao, validacao e serializacao de erro.
- Deve mockar services e middlewares externos quando isso isolar melhor o contrato da rota.

## Bootstrap para testes

- Quando o pacote precisar de variaveis minimas antes de importar modulos de producao, criar `src/test/envBootstrap.ts`.
- Importar esse bootstrap no topo dos testes que dependem desse ambiente, como no `project-service`.
- O objetivo e impedir acoplamento acidental a `.env` real ou infraestrutura externa.

## O que cobrir

### Services e application layer

- Regras de negocio.
- Casos de sucesso.
- Ramos de erro.
- Validacoes.
- Mapeamentos e normalizacoes.
- Comportamento com dependencias mockadas ou stubadas.
- Lancamento de `ServiceError` quando isso fizer parte do contrato.

### Rotas e app HTTP

- Status HTTP.
- Body.
- Headers relevantes.
- Comportamento para entrada invalida.
- Fluxo via `createApp()` ou app factory equivalente, sem infraestrutura real desnecessaria.
- Servidor em porta efemera apenas quando realmente necessario.

## Smoke end-to-end do workspace

- O smoke oficial do workspace vive em:
  - `scripts/all-services-smoke.mjs`
  - `scripts/all-services-smoke.manifest.mjs`
  - `scripts/check-smoke-spec-coverage.mjs`
- Toda rota nova descrita no `spec.ts` do servico deve ser adicionada ao manifesto do smoke.
- Ao criar um servico novo exposto via HTTP, incluir tambem seu `spec.ts` em `specFiles` no manifesto para que `pnpm smoke:coverage` compare OpenAPI x smoke.
- O padrao por rota (`service|method|path`) e:
  - exatamente 1 expectativa `good`
  - ao menos 1 expectativa `bad`
  - so usar `pairCoverageExempt` nas excecoes ja existentes de infraestrutura/bootstrap
- O caso `good` deve representar o caminho feliz real da rota:
  - usar o status de sucesso correto do contrato (`200` por padrao, `201` em criacoes, ou excecao documentada)
  - manter `expectEnvelope` ativo quando a rota segue o envelope padrao de sucesso
  - validar o path publico real (`gateway`) ou interno (`direct`) conforme o contrato
- O caso `bad` deve cobrir pelo menos uma falha real do contrato HTTP, priorizando:
  - `400` para body/query/params invalidos
  - `401` para ausencia de autenticacao ou token invalido
  - `403` para permissao insuficiente
  - `404` para recurso inexistente
  - `409` para conflito de dominio
- Respostas de sucesso do smoke devem seguir o envelope compartilhado do workspace:
  - `{ success: true, data: ... }`
- Respostas de erro do contrato continuam seguindo o envelope compartilhado do workspace:
  - `{ success: false, error: string, code: string, requestId?: string }`
- No smoke, todo caso `bad` deve ao menos deixar `expectedStatus` e `expectedLabel` coerentes com esse contrato; quando for necessario validar o corpo de erro em detalhe, complementar com teste de rota.
- So usar `expectEnvelope: false` quando a rota realmente nao seguir o envelope compartilhado atual e isso fizer parte do contrato existente.
- Preserve a geracao automatica de casos negativos ja existente para autenticacao/autorizacao quando ela representar corretamente o contrato; so criar handler `bad` explicito quando a falha for especifica da rota ou quando o caso automatico nao for suficiente.
- Em entradas explicitas do manifesto, manter claro:
  - `expectedStatus` com o(s) status aceito(s)
  - `expectedLabel` descrevendo o resultado esperado
  - `specOperation: false` para cenarios negativos ou excecoes fora do contrato OpenAPI principal
- Depois de alterar o manifesto ou qualquer `spec.ts`, rodar `pnpm smoke:coverage`.

## O que evitar

- Banco real.
- Rede real.
- Fila real.
- Servicos externos reais.
- Dependencia de tempo sem controle explicito.
- `console.log` no lugar de assert.
- Testes acoplados a detalhes internos triviais.
- Mockar agressivamente o que poderia ser exercitado de forma simples e deterministica.

## Mocks e spies

- Preferir `vi.fn()`, `vi.spyOn()` e injeção de dependencias nas bordas do sistema.
- Mockar banco, HTTP, storage, filas e providers externos.
- Nao transformar o teste em uma reimplementacao do sistema com mocks frageis.

## Isolamento e limpeza

- Cada teste deve rodar isoladamente.
- Liberar servidores, timers, listeners e estado global alterado.
- Evitar vazamento entre casos.
- Preferir fixtures locais e explicitas.

## Qualidade da suite

- Testes devem ser rapidos, deterministicos, legiveis e independentes.
- Cobertura e sinal auxiliar; priorizar risco, contrato e comportamento critico.
- Cada teste deve ter motivo claro para existir.

## Execucao no monorepo

- Rodar testes de um pacote:

```bash
pnpm --filter @workspace/<nome-do-pacote> test
```

- Rodar type-check separadamente no pacote ou no workspace.

## Diretriz pratica para geracao de codigo

Ao criar ou alterar testes neste workspace:

- use Vitest;
- use `*.test.ts`;
- coloque os testes em `src/test/`;
- siga o modelo do `project-service`;
- para cada modulo principal de rota, crie um par:
  - `camelCaseService.test.ts`
  - `camelCase.routes.test.ts`
- prefira `describe`, `it`, `expect` e `vi` quando fizer sentido;
- mantenha os testes focados em comportamento observavel;
- para codigo HTTP, teste contrato;
- para services, teste regra de negocio, falhas e integracoes mockadas nas bordas;
- ao criar rota nova em servico HTTP, atualize tambem o smoke manifesto do workspace e preserve o pareamento `good`/`bad` por rota.

---

## Regra importada de .cursor/rules/typescript-services.mdc

Escopo original do Cursor:
- description: Padroes TypeScript e services
- globs: services/**/*.ts
- alwaysApply: false

# TypeScript e Services

## Imports
- Usar extensao `.js` em imports locais (ESM).
- Importar de `@workspace/shared` quando disponivel.

## Nomes de arquivos
- Em `src/services/`, usar `camelCaseService.ts`.
- Em `src/routes/`, usar `camelCase.routes.ts`.
- Evitar PascalCase, kebab-case e nomes mistos para arquivos novos nesses diretorios.
- Imports locais devem acompanhar exatamente essa convencao.

## Entry points
- Em servicos HTTP/Express, preferir `server.ts` como entrypoint executavel.
- `app.ts` deve exportar a factory da aplicacao (`createApp`, `createUserApp`, etc.) sem subir o servidor.
- Testes devem importar `app.ts` sempre que possivel, e nao o entrypoint de processo.
- Evitar `index.ts` como ponto de entrada quando ele mistura bootstrap, `listen`, logger e leitura de env.

## Services
- Uma responsabilidade por service.
- `StorageService`: apenas operacoes de storage.
- `UserService`: logica de usuario e banco.
- `OrganizationService`: logica de organizacao e banco.
- Rotas coordenam chamadas entre services.

## Validacao de entrada (Zod)
- Onde validar: na rota, com `parseWithZod` (`@workspace/shared`) e schemas em `services/<servico>/src/schemas/*.schemas.ts`.
- Quando validar na rota: body em `POST`/`PUT`/`PATCH`, query em listagens/filtros, params quando precisarem de tipo ou formato.
- O que fica no service: regras de negocio e integridade com `ServiceError`, sem repetir schema HTTP salvo motivo forte.
- Shared: helpers genericos e `parseWithZod` em `shared/src/schemas/`; detalhes em `.cursor/rules/schemas-zod.mdc`.

## Erros em services
- `logError` como primeira linha util do `catch`, antes de ramificar com `if (err instanceof ServiceError)`.

```typescript
} catch (err: unknown) {
  logError("Contexto do erro", { err });
  if (err instanceof ServiceError) throw err;
  throw new ServiceError(500, "Mensagem amigavel.", err);
}
```

## Middlewares (`**/middlewares/**/*.ts`)
- No `catch`, registrar antes de ramificar: `logError("contexto", { err })`.
- Encaminhar com `next(err)` ou `next(new ServiceError(...))` conforme o caso.
- Nao misturar esse fluxo com `response.status(...).json(...)` para o mesmo erro.
