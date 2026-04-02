---
name: CRUD clientes e organização de ficheiros
overview: Desconsiderar o refactor de rotas (org só via JWT no body). Prioridade em alinhar a estrutura do client-service ao padrão dos microserviços de referência (organization-service), seguindo as cursor rules; em seguida evoluir o CRUD inicial de cadastro de clientes com foco no vínculo por organização.
todos:
  - id: map-structure
    content: Mapear diferenças client-service vs organization-service (pastas, naming, app/server, middlewares)
    status: pending
  - id: align-files
    content: Alinhamentos de ficheiros/naming só em código de domínio (schemas/routes/service); sem tocar package/tsconfig/vitest/biome/env/server/app
    status: pending
  - id: crud-gap
    content: Completar operações CRUD em falta (ex. DELETE) e Zod/service/rotas conforme legado mínimo
    status: pending
  - id: tests-docs
    content: Atualizar testes Vitest/Supertest e respeitar rules de erros/respostas shared
    status: pending
isProject: false
---

# Plano: CRUD inicial de clientes + organização de ficheiros

## Escopo explícito

- **Não** seguir neste plano o refactor “POST com `organization_id` apenas do token” discutido antes; o contrato atual (body + validação de org no service) mantém-se até decisão futura.
- **Não alterar as configurações iniciais** do pacote: manter como estão [services/client-service/package.json](services/client-service/package.json), [tsconfig.json](services/client-service/tsconfig.json), [vitest.config.ts](services/client-service/vitest.config.ts), [biome.json](services/client-service/biome.json), [src/config/env.ts](services/client-service/src/config/env.ts) (schema, defaults, variáveis), [.env.example](services/client-service/.env.example) e o arranque em [server.ts](services/client-service/src/server.ts) / fábrica [app.ts](services/client-service/src/app.ts). Qualquer trabalho de CRUD ou renomeação de ficheiros de domínio **não** deve mexer nestes ficheiros salvo correção de bug bloqueante documentada.
- **Sim** seguir [.cursor/rules/projeto-workspace.mdc](.cursor/rules/projeto-workspace.mdc) (ServiceError, `createSuccessResponse`, `logError`/`next(err)`, ESM `.js`, Biome).

## Fase 0 — “Organização” primeiro (estrutura de código)

Objetivo: antes de acrescentar endpoints, **espelhar o desenho dos serviços maduros**, usando [services/organization-service/src](services/organization-service/src) como referência principal (também comparável a `rh-service` / `user-service` se necessário).

| Área | organization-service | client-service (hoje) | Ação sugerida |
|------|----------------------|------------------------|---------------|
| Schemas | `schemas/organization.schemas.ts` | `schemas/client.schema.ts` | Renomear para `client.schemas.ts` (paridade de naming) e atualizar imports |
| Rotas | `routes/organization.routes.ts`, router default export | `createClientRouter()` factory | Manter factory se preferir testes; ou alinhar a default export + `app.use` como org-service — escolher um padrão e documentar |
| Service | `organizationService.ts` (classe + Prisma no construtor ou singleton interno) | `ClientService` + `IClientService` (DI) | **Manter DI** do client-service (melhor para testes); não regredir para import global de Prisma no service |
| Middleware | `requestContext` + `isAuthenticated` | só `isAuthenticated` | **Fora deste plano** (implicaria mudar pipeline/app): não adicionar `requestContext` enquanto a restrição de não alterar configs iniciais / arranque se mantiver |
| App | `app.ts` inline + `serializeError` | `createApp` + `createExpressErrorHandler` | Ambos válidos; client-service já usa padrão shared mais novo — **não obrigatório** copiar handler antigo do org-service |
| Testes | (verificar se org-service tem spec) | `src/__tests__/client.spec.ts` | Manter mocks de `IClientService`; estender quando houver novas rotas |

**Foco em organização (domínio):** todas as operações de cliente continuam **escopadas a `organization_id`** (listagem, get, update; create com validação de org existente + resposta com `organization` aninhada). Nenhuma mudança de produto neste plano além do alinhamento estrutural e CRUD em falta.

## Fase 1 — CRUD inicial de cadastro (lacunas)

Estado atual do [client-service](services/client-service/src): **listar**, **obter por id**, **criar (POST)**, **atualizar (PATCH)**.

Para um CRUD “inicial” completo, definir com produto:

- **DELETE** `DELETE /clients/:id` (hard delete vs soft via `status` / `deletion_date` no Prisma) — o legado em [services/src/.../clients.routes.ts](services/src/src/routes/clients.routes.ts) tem delete; espelhar regra mínima com `ServiceError` 404 e escopo por org.
- Opcional: campos extra no create/update alinhados ao MVP (sem replicar o monólito inteiro).

Implementação técnica: `client.schemas.ts` (params/body), `clientService.ts`, `client.routes.ts`, testes com mock + caso de erro se aplicável.

## Fase 2 — Verificação

- `pnpm --filter @workspace/client-service run check` / `test` / `build`
- Se alterar exports públicos do pacote, confirmar gateway/proxy em [services/gateway](services/gateway) se existir rota `/clients`

## Commits (inglês, sugestão)

1. `refactor(client-service): align file naming with organization-service conventions`
2. `feat(client-service): add DELETE client scoped by organization` (ou o conjunto de endpoints acordados)

---

*Este ficheiro substitui/atualiza a direção anterior sobre refactor exclusivo de contexto JWT nas rotas; execução só após confirmação explícita em Agent mode.*
