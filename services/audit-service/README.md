# audit-service

Ingestão e consulta de pedidos de auditoria. O gateway pode proxyar `/audit` e enviar eventos de ciclo de vida HTTP.

## Porta local

Por defeito: **3020** (variável específica do serviço em `src/config/env.ts`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `DATABASE_POOL_MAX` (default `1`), `AUDIT_SERVICE_TOKEN`, logging, etc.

## Gateway

Comportamento controlado **só no gateway**:

- `AUDIT_ENABLED=true` — monta `app.use("/audit", …)` com proxy para `AUDIT_SERVICE_URL` e injeta o header interno com `AUDIT_SERVICE_TOKEN` antes do upstream.
- `AUDIT_ENABLED=false` — rotas `/audit/*` respondem 404 no gateway (middleware dedicado).

O gateway também usa `AUDIT_SERVICE_URL` e `AUDIT_SERVICE_TOKEN` no **recorder** de auditoria (`createAuditRecorder`) para registar pedidos que passam pelo gateway, independentemente do proxy `/audit`.

Ordem relevante no gateway: autenticação e autorização aplicam-se antes do proxy; ver [`gateway/src/app.ts`](../gateway/src/app.ts).

## Desenvolvimento

```bash
pnpm --filter @workspace/audit-service dev
```

Testes do pacote: `pnpm --filter @workspace/audit-service test`.

## Consulta operacional

Os registros ficam na tabela `audit_requests` e podem ser consultados por:

- `GET /audit/requests` para pesquisa paginada;
- `GET /audit/requests/:requestId` para consultar um evento específico.

As consultas exigem o token interno do serviço e uma permissão de administrador
de auditoria. A consulta organizacional usa a organização encaminhada pelo gateway,
não aceita troca de tenant pela query e mantém o DTO completo para o administrador
da própria organização.

A consulta de plataforma usa a mesma rota interna `GET /audit/requests`, mas somente
com a identidade validada `platform/super_admin`. Sem `organizationId`, a busca é
global; com `organizationId` UUID, retorna somente o histórico contextual daquela
organização. Em ambos os casos a resposta é uma projeção allowlisted: nunca inclui
`metadata_json`, `changes_json`, query, IP, user-agent, mensagens de erro ou outros
campos brutos. Para eventos válidos do `organization-service`, somente o ator de
plataforma e as mudanças permitidas de status, plano e logo são reconstruídos.
O detalhe por `requestId` continua restrito a uma organização.

A pesquisa aceita filtros de `requestId`, `userId`, `method`, `path`, `statusCode`,
intervalo de datas, `referring`, `referringId` e `department`. Na busca de plataforma,
`organizationId` é um filtro UUID opcional adicional.

## Retenção

O serviço não executa expurgo automático nem aplica um TTL próprio. Os eventos
permanecem em `audit_requests` até que a política operacional externa de banco,
backup ou retenção da organização os remova. A equipe responsável pelo banco
deve definir e executar essa política, considerando o prazo de auditoria e os
requisitos legais aplicáveis. Uma retenção automática futura deve ser adicionada
como job/migração explícita e coberta por teste antes de ser habilitada.

## Teste de persistência real (opt-in)

A suíte padrão usa um repositório em memória para continuar rápida e
determinística. A integração Prisma real só é executada quando explicitamente
habilitada, com um banco já existente e uma organização válida:

```bash
AUDIT_REAL_DB_TEST=1 \
AUDIT_TEST_ORGANIZATION_ID=<organization-id> \
pnpm --filter @workspace/audit-service exec vitest run tests/persistence.integration.test.ts
```

No PowerShell:

```powershell
$env:AUDIT_REAL_DB_TEST = "1"
$env:AUDIT_TEST_ORGANIZATION_ID = "<organization-id>"
pnpm --filter @workspace/audit-service exec vitest run tests/persistence.integration.test.ts
```

`DATABASE_URL` também precisa estar configurada. O teste cria um único evento
marcado, valida a persistência do diff, a consulta por filtros independentes e
o isolamento por organização, e remove o registro ao terminar.
