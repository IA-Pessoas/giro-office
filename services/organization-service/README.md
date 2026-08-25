# organization-service

CRUD e operações de organizações. Montado no gateway no prefixo **`/organizations`**.

## Porta local

Por defeito: **3031** (`PORT`).

## Variáveis de ambiente

Ver [`src/config/env.ts`](src/config/env.ts): `DATABASE_URL`, `JWT_SECRET` (alinhado com o gateway
para validação JWT), `AUDIT_SERVICE_TOKEN`, `AUDIT_SERVICE_URL` (por defeito,
`http://audit-service:3020`) e `ORGANIZATION_DOMAIN_AUDIT_ENABLED` (por defeito, `true`).

## Gateway

- URL upstream: `ORGANIZATION_SERVICE_URL` (ex.: `http://localhost:3031`), definida no [env do gateway](../gateway/src/config/env.ts).
- O cliente chama o gateway em caminhos como `GET /organizations/organizations` (o micro expõe rotas sob `/organizations`).
- A gestão global em `/platform/organizations` usa a sessão `cw.session` HttpOnly de um
  `super_admin` e exige simultaneamente a identidade derivada e o token interno injetados pelo
  gateway. `POST` e `PATCH` também exigem o header CSRF vinculado à sessão. Headers `x-auth-*`
  enviados diretamente pelo cliente nunca bastam.
- Criação aceita somente `name` e `cnpj`; status `active`, plano `trial` e o e-mail do criador são
  definidos pelo servidor. Alterações de status, plano e logo usam `expected_updated_at` para
  impedir sobrescrita concorrente e geram auditoria de domínio após o commit.

## Desenvolvimento

```bash
pnpm --filter @workspace/organization-service dev
```

Gerar Prisma: `pnpm prisma:generate` no pacote (delega ao `@workspace/infra`).
