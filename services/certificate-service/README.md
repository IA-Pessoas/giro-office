# certificate-service

Microservico do dominio de certificados. Centraliza contratos PJ/PF, consulta de certificados,
controle de permissao do modulo Certificado e notificacoes materializadas para vencimentos.

## Porta local

Por padrao: **3041** (`PORT`).

## Variaveis de ambiente

As variaveis sao lidas em `src/config/env.ts`.

Use `.env.example` como base para criar o `.env` local do service. O `.env` real nao deve ser
versionado.

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `AUDIT_SERVICE_URL`
- `AUDIT_SERVICE_TOKEN`
- `CERTIFICATE_SERVICE_INTERNAL_TOKEN`
- `CERTIFICATE_NOTIFICATION_WINDOW_DAYS`
- `SERVICE_ALLOWED_ORIGINS`
- `ENABLE_API_DOCS`
- `LOG_LEVEL`
- `LOG_PRETTY`
- `CERTIFICATE_STORAGE_MODE`
- `CERTIFICATE_STORAGE_BUCKET`
- `CERTIFICATE_STORAGE_DIR`
- `CERTIFICATE_FILE_MAX_SIZE_BYTES`
- `CERTIFICATE_FILE_ENCRYPTION_KEY`
- `CERTIFICATE_FILE_ENCRYPTION_KEY_VERSION`
- `CERTIFICATE_PASSWORD_ENCRYPTION_KEY`
- `CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPLOAD_RATE_LIMIT_MAX`
- `UPLOAD_RATE_LIMIT_WINDOW_MS`

## Gateway

- URL upstream: `CERTIFICATE_SERVICE_URL` (ex.: `http://localhost:3041`)
- Prefixo publico: `/certificate`
- Exemplo: `GET /certificate/pj/list`
- Exemplo: `GET /certificate/pj/{id}`
- Exemplo: `POST /certificate/pj`
- Exemplo: `POST /certificate/pj/{id}/file`
- Exemplo: `GET /certificate/pj/{id}/file`
- Exemplo: `DELETE /certificate/pj/{id}/file`
- Exemplo: `GET /certificate/pf/list`
- Exemplo: `GET /certificate/pf/{id}`
- Exemplo: `POST /certificate/pf`
- Exemplo: `POST /certificate/pf/{id}/file`
- Exemplo: `GET /certificate/pf/{id}/file`
- Exemplo: `DELETE /certificate/pf/{id}/file`
- Exemplo: `GET /certificate/notifications`

Rotas publicas dependem do contexto encaminhado pelo gateway, incluindo usuario, organizacao,
permissao `certificado` e `x-internal-service-token` valido entre gateway e service.

## Arquivos de certificado

Os arquivos `.pfx` e `.p12` sao enviados por `multipart/form-data` no campo `file`. O service valida
extensao, MIME type, tamanho maximo, criptografa o conteudo antes de salvar e persiste apenas
metadados no banco. O download sempre passa pelo `certificate-service`, descriptografa em runtime e
retorna resposta binaria com `Cache-Control: no-store`; ele nao usa o envelope JSON de sucesso.

Supabase Storage e o provider padrao/recomendado para desenvolvimento integrado, staging, VPS e
producao. `CERTIFICATE_STORAGE_MODE=local` existe apenas para testes unitarios ou execucao local
offline, sem bucket real, service-role key ou rede externa.

## Senhas de certificados

`CERTIFICATE_PASSWORD_ENCRYPTION_KEY` deve ser uma chave base64 de 32 bytes e deve corresponder
aos envelopes legados ja persistidos. `CERTIFICATE_PASSWORD_ENCRYPTION_KEY_VERSION=v1` identifica
a versao atual da chave. Nunca registre a chave, senhas ou payloads reais em documentacao, logs ou
artefatos versionados.

As senhas persistidas usam AES-256-GCM no envelope JSON `{ v, iv, tag, data }`. JSON invalido ou
que nao represente esse envelope falha fechado. Texto legado nao-JSON e recriptografado na primeira
leitura autorizada.

## Rotas internas

- `POST /internal/notifications/run`

Esta rota nao deve ser exposta pelo gateway publico. Ela exige `x-internal-service-token` com o
valor de `CERTIFICATE_SERVICE_INTERNAL_TOKEN`.

## Notificacoes

O service nao agenda execucoes por conta propria. A reconciliacao de notificacoes deve ser chamada
por um agendador externo usando `POST /internal/notifications/run`.

`CERTIFICATE_NOTIFICATION_WINDOW_DAYS` define a janela de vencimento usada para materializar
notificacoes de certificados PJ/PF com `has_certificate = true`.

## Desenvolvimento

```bash
pnpm --filter @workspace/certificate-service dev
```

## Qualidade

```bash
pnpm --filter @workspace/certificate-service test
pnpm --filter @workspace/certificate-service typecheck
pnpm --filter @workspace/certificate-service check
pnpm --filter @workspace/certificate-service build
```
