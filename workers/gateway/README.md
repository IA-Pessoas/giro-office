# Gateway Worker

## Auditoria de requests

Requests autenticados encaminhados a um serviço são registrados no binding `AUDIT_SERVICE` por `POST /internal/audit/requests`, usando exclusivamente o segredo `AUDIT_SERVICE_TOKEN`. Esse segredo não tem fallback, deve ser diferente de `INTERNAL_SERVICE_TOKEN` e não é incluído no payload.

O request ID recebido em `x-request-id` é preservado; quando ausente, o Worker gera um UUID e o encaminha ao upstream, à auditoria e à resposta. O payload usa o schema shared de auditoria, com actor, organização, usuário, permissão, método, path, query redigida, status, outcome, duração, timestamps e target da rota. Corpo, cookies, JWT e tokens nunca são enviados.

`2xx` produz `success`, demais respostas HTTP produzem `error` e exceções do binding upstream produzem `aborted` com resposta `502`. `/health`, `/ready` e `/audit/*` não dependem dessa auditoria. Se o binding ou o segredo da auditoria estiver ausente, leituras continuam best-effort com warning; mutações falham com `503` antes do proxy. Falhas de entrega após o proxy são registradas explicitamente e retornam `503` para mutações; o Gateway não pode desfazer um efeito upstream já executado.
