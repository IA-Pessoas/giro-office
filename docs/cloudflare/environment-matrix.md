# Matriz de ambiente Cloudflare

Esta matriz documenta nomes e escopo. Ela não contém valores, tokens ou URLs privadas.

## Banco e autenticação

| Nome | Tipo | Escopo | Observação |
| --- | --- | --- | --- |
| `DATABASE_URL` | Secret/CI | geração Prisma e migration job | URL do PostgreSQL; não é lida pelo request quando `HYPERDRIVE` está disponível. |
| `JWT_SECRET` | Secret | cada Worker autenticado | Mesmo contrato de assinatura da aplicação atual. |
| `INTERNAL_SERVICE_TOKEN` | Secret | Gateway e Workers de domínio | Header interno; nunca expor em `NEXT_PUBLIC_*`. |
| `HYPERDRIVE` | Binding | Workers com Prisma | Conexão PostgreSQL por request; substituir a URL direta no runtime. |

## Service Bindings atuais

| Binding no Gateway | Serviço | Estado local |
| --- | --- | --- |
| `AUDIT_SERVICE` | `giro-audit-service` | dry-run configurado |
| `DEPARTMENT_SERVICE` | `giro-department-service` | dry-run configurado |
| `ORGANIZATION_SERVICE` | `giro-organization-service` | dry-run configurado |
| `USER_SERVICE` | `giro-user-service` | dry-run configurado |
| `CLIENT_SERVICE` | `giro-client-service` | dry-run configurado |
| `FISCAL_SERVICE` | `giro-fiscal-service` | dry-run configurado |
| `CERTIFICATE_SERVICE` | `giro-certificate-service` | dry-run configurado |
| `REPORTS_SERVICE` | `giro-reports-service` | dry-run configurado |
| `PARCELAMENTO_SERVICE` | `giro-parcelamento-service` | dry-run configurado |
| `CONTABIL_SERVICE` | `giro-contabil-service` | dry-run configurado |
| `PROJECT_SERVICE` | `giro-project-service` | dry-run configurado |
| `TI_SERVICE` | `giro-ti-service` | dry-run configurado |
| `RH_SERVICE` | `giro-rh-service` | dry-run configurado |
| `COMMERCIAL_SERVICE` | `giro-commercial-service` | dry-run configurado |

## Supabase e recursos externos

| Nome | Tipo | Escopo | Estado |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Secret/var | Workers que usam Storage | manter durante a transição |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | somente backend/Worker | nunca em Pages ou `NEXT_PUBLIC_*` |
| `*_BUCKET` | var | serviço dono do bucket | preservar nome, privacidade e prefixos existentes |
| `AUDIT_SERVICE_TOKEN` | Secret | integrações de auditoria | substituir por binding quando o fluxo estiver portado |
| chaves de criptografia | Secret | certificados, TI/RH/Pessoal | rotação e versão devem permanecer compatíveis |

## Pages/UI

| Nome | Tipo | Valor esperado |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | build-time público | `/api` |
| `NEXT_PUBLIC_*` | build-time público | somente flags/configuração sem segredo |
| `GATEWAY_PUBLIC_URL` | var | domínio público usado para documentação/smoke |

## Regras operacionais

- O workflow `.github/workflows/cloudflare-migrations.yml` aceita somente `staging` e aplica `prisma migrate deploy` fora dos requests.
- O primeiro uso exige backup verificável, clone/staging e conferência de `_prisma_migrations`, índices, FKs, RLS e grants.
- Deploy real de Worker/Pages continua separado de migration, smoke e aprovação de cutover.
