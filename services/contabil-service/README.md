# contabil-service

Microserviço de domínio contábil: checklist operacional por cliente e competência (**controls**), **responsibles** e **relationships** do cliente. Todas as rotas de negócio ficam sob o prefixo `/contabil` e exigem autenticação (JWT ou headers encaminhados pelo gateway).

## Porta local

Por padrão: **3038** (`PORT` em [`src/config/env.ts`](src/config/env.ts)).

## Variáveis de ambiente

Definição e defaults em [`src/config/env.ts`](src/config/env.ts):

- `DATABASE_URL` — PostgreSQL (Prisma)
- `JWT_SECRET` — validação do Bearer nas rotas autenticadas
- `PORT` — porta HTTP (default `3038`)
- `AUDIT_ENABLED`, `AUDIT_SERVICE_URL`, `AUDIT_SERVICE_TOKEN` — auditoria via `integrations/audit.ts`
- `INTERNAL_SERVICE_TOKEN` — token esperado no header interno quando o gateway encaminha usuário/organização (opcional; se omitido, usa o mesmo valor que `AUDIT_SERVICE_TOKEN`)
- `ENABLE_API_DOCS` — documentação OpenAPI em `/docs` (em produção o default é desligado)

## Gateway

No gateway, configure o upstream:

- `CONTABIL_SERVICE_URL` — URL base do serviço (ex.: `http://localhost:3038`)

Prefixo público no gateway: **`/contabil`**.

Exemplos de paths públicos (via gateway, com `Authorization: Bearer …`):

- `GET http://localhost:3010/contabil/controls?client_id=<uuid>&competence=<texto>`
- `POST http://localhost:3010/contabil/controls`
- `PATCH http://localhost:3010/contabil/controls/<id>`
- `POST http://localhost:3010/contabil/responsibles`
- `GET http://localhost:3010/contabil/responsibles/client/<clientId>`
- `PUT http://localhost:3010/contabil/responsibles/<id>`
- `DELETE http://localhost:3010/contabil/responsibles/<id>`
- `POST http://localhost:3010/contabil/relationships`
- `GET http://localhost:3010/contabil/relationships/client/<clientId>`
- `PUT http://localhost:3010/contabil/relationships/<id>`
- `DELETE http://localhost:3010/contabil/relationships/<id>`

Infraestrutura direto no serviço: `GET http://localhost:3038/health` e `GET http://localhost:3038/ready`.

## Desenvolvimento

```bash
pnpm --filter @workspace/contabil-service dev
```

Gerar cliente Prisma: `pnpm --filter @workspace/contabil-service prisma:generate`.
