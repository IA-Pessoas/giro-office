# Matriz de ambiente Cloudflare

Esta matriz documenta nomes e escopo. Ela não contém valores, tokens ou URLs privadas.

## Banco e autenticação

| Nome | Tipo | Escopo | Observação |
| --- | --- | --- | --- |
| `DATABASE_URL` | Secret/CI | geração Prisma e migration job | URL do PostgreSQL; não é lida pelo request quando `HYPERDRIVE` está disponível. |
| `JWT_SECRET` | Secret | cada Worker autenticado | Mesmo contrato de assinatura da aplicação atual. |
| `INTERNAL_SERVICE_TOKEN` | Secret | Gateway e Workers de domínio | Header interno; nunca expor em `NEXT_PUBLIC_*`. |
| `HYPERDRIVE` | Binding | Workers com Prisma | Conexão PostgreSQL por request; substituir a URL direta no runtime. O config `giro-postgres-prod` precisa de **cache de query desligado** (`caching.disabled=true`): com cache, leituras logo após PATCH/POST voltam o valor antigo e a UI parece não persistir (QA 2026-09-22, BUG-003/004/005). |

### Tokens internos com o mesmo valor

Cada chamador envia um token com nome próprio, mas o destino valida contra outro nome. Ao gerar
ou rotacionar, os pares abaixo precisam do **mesmo valor**; senão o destino responde 401 e o
gateway devolve 503 (inclusive no login, que audita).

| Chamador envia | Destino valida contra | Valor |
| --- | --- | --- |
| `AUDIT_SERVICE_TOKEN` (todos) | `INTERNAL_SERVICE_TOKEN` do audit-service | o do audit é o `AUDIT_SERVICE_TOKEN`; o gateway exige que seja distinto do `INTERNAL_SERVICE_TOKEN` dele |
| `USER_SERVICE_INTERNAL_TOKEN` | `INTERNAL_SERVICE_TOKEN` do user-service | = `INTERNAL_SERVICE_TOKEN` |
| `TRIAGEM_INTERNAL_TOKEN` | `INTERNAL_SERVICE_TOKEN` do triagem-service | = `INTERNAL_SERVICE_TOKEN` |
| `CLIENT_SERVICE_INTERNAL_TOKEN` | `INTERNAL_SERVICE_TOKEN` do client-service | = `INTERNAL_SERVICE_TOKEN` |
| `TASK_SERVICE_INTERNAL_TOKEN` | `COMMERCIAL_SERVICE_TOKEN` do task-service | = `COMMERCIAL_SERVICE_TOKEN` |

Consequência conhecida: o gateway repassa `/audit/*` com o `INTERNAL_SERVICE_TOKEN`, que o
audit-service recusa — `GET /api/audit/requests` responde 401.

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
| `TRIAGEM_SERVICE` | `giro-triagem-service` | dry-run configurado |
| `PESSOAL_SERVICE` | `giro-pessoal-service` | dry-run configurado |
| `REGULARIZE_SERVICE` | `giro-regularize-service` | dry-run configurado |

## Supabase e recursos externos

| Nome | Tipo | Escopo | Estado |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Secret/var | Workers que usam Storage | manter durante a transição |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | somente backend/Worker | nunca em Pages ou `NEXT_PUBLIC_*` |
| `CNPJ_LOOKUP_API_URL`, `CNPJ_LOOKUP_API_TOKEN` | Secret | `giro-client-service` | **placeholder** desde 2026-09-23 (`https://cnpj-lookup.invalid/{cnpj}` e `placeholder`): a consulta falha e o cadastro segue manual; sobrescrever os dois com `wrangler secret put` quando houver o provedor real |
| `*_BUCKET` | var | serviço dono do bucket | preservar nome, privacidade e prefixos existentes |
| `REGULARIZE_LICENSE_PROTOCOL_BUCKET` | var | regularize-service | bucket privado de protocolos; default `regularize-license-protocols` |
| `MTK_ENCRYPTION_KEY` | Secret | regularize-service | mesma chave AES-256-GCM legada; nunca expor no Pages |
| `REGULARIZE_REPORTING_TOKEN` | Secret | regularize-service/reports | token do endpoint interno de catálogo/extração |
| `REGULARIZE_REPORTING_GRANT_SECRET` | Secret | regularize-service/reports | assinatura HMAC dos grants de reporting; TTL máximo 60s |
| `CERTIFICATE_STORAGE_BUCKET` | var | certificate-service | bucket privado de certificados; default legado `Certificados` |
| `CERTIFICATE_FILE_ENCRYPTION_KEY` | Secret | certificate-service | chave AES-256-GCM dos arquivos; preservar durante a transição |
| `CERTIFICATE_FILE_ENCRYPTION_KEY_VERSION` | var | certificate-service | versão da chave usada nos metadados; default `v1` |
| `CERTIFICATE_PASSWORD_ENCRYPTION_KEY` | Secret | certificate-service | chave AES-256-GCM das senhas novas |
| `CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION` | var | certificate-service | versão gravada nos envelopes de senha; default `v1` |
| `CERTIFICATE_PASSWORD_LEGACY_ENCRYPTION_KEY` | Secret | certificate-service | opcional; chave das senhas migradas, só leitura |
| `CERTIFICATE_FILE_MAX_SIZE_BYTES` | var | certificate-service | limite de upload; default legado 5 MiB |
| `CERTIFICATE_NOTIFICATION_WINDOW_DAYS` | var | certificate-service | janela da reconciliação interna; default legado 30 dias |
| `PESSOAL_PASSWORD_ENCRYPTION_KEY` | Secret | pessoal-service | chave AES-256-GCM das senhas; preservar durante a transição |
| `PESSOAL_PASSWORD_ENCRYPTION_KEY_VERSION` | var | pessoal-service | versão da chave legada; default `v1` |
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
