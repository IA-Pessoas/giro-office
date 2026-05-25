# certificate-service

Microservico do dominio de certificados. Centraliza contratos PJ/PF, consulta de certificados,
controle de permissao do modulo Certificado e notificacoes materializadas para vencimentos.

## Porta local

Por padrao: **3041** (`PORT`).

## Variaveis de ambiente

As variaveis sao lidas em `src/config/env.ts`.

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

## Gateway

- URL upstream: `CERTIFICATE_SERVICE_URL` (ex.: `http://localhost:3041`)
- Prefixo publico: `/certificate`
- Exemplo: `GET /certificate/pj/list`
- Exemplo: `GET /certificate/pj/{id}`
- Exemplo: `POST /certificate/pj`
- Exemplo: `GET /certificate/pf/list`
- Exemplo: `GET /certificate/pf/{id}`
- Exemplo: `POST /certificate/pf`
- Exemplo: `GET /certificate/notifications`

Rotas publicas dependem do contexto encaminhado pelo gateway, incluindo usuario, organizacao,
permissao `certificado` e `x-internal-service-token` valido entre gateway e service.

## Rotas internas

- `POST /internal/notifications/run`

Esta rota nao deve ser exposta pelo gateway publico. Ela exige `x-internal-service-token` com o
valor de `CERTIFICATE_SERVICE_INTERNAL_TOKEN`.

## Notificacoes

O service nao agenda execucoes por conta propria. A reconciliacao de notificacoes deve ser chamada
por um agendador externo usando `POST /internal/notifications/run`.

`CERTIFICATE_NOTIFICATION_WINDOW_DAYS` define a janela de vencimento usada para materializar
notificacoes de certificados PJ/PF com `has_certificate = true`.

## Fora do escopo atual

Upload, download protegido, criptografia de arquivos e integracao com storage ainda nao fazem parte
deste service. Os campos `file_path` sao apenas metadados persistidos no contrato atual.

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
