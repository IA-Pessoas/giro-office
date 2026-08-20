# Rollout de sessão HttpOnly

Este runbook cobre a ativação da sessão por cookie da issue #772. O JWT assinado permanece somente no cookie `cw.session`; código do browser não lê, armazena ou encaminha esse valor.

## Contrato de produção

```dotenv
NEXT_PUBLIC_API_URL=/api
API_INTERNAL_URL=http://gateway:3010
AUTH_COOKIE_SECURE=true
GATEWAY_ALLOWED_ORIGINS=https://useoffice.com.br
GATEWAY_BEARER_AUTH_COMPATIBILITY=false
```

O gateway e o user-service devem receber o mesmo `AUTH_COOKIE_SECURE`. O web recebe somente as duas URLs. `cw.session` usa `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` e `Max-Age=86400`. `cw.csrf` usa os mesmos atributos, exceto `HttpOnly`, e é vinculado ao hash assinado na sessão. Nenhum cookie define `Domain`.

## Sequência de rollout

1. Publique user-service, gateway e web como uma única unidade de release.
2. Confirme as cinco variáveis acima nos containers efetivos, sem imprimir segredos.
3. Faça login por HTTPS e verifique dois `Set-Cookie`; a resposta JSON deve conter usuário e não deve conter `token`.
4. Execute `GET /api/user/me` com o jar de cookies.
5. Execute `POST /api/user/session/refresh` com `x-csrf-token` igual ao cookie `cw.csrf`; confirme rotação dos dois cookies.
6. Execute uma mutação representativa com o mesmo cabeçalho CSRF.
7. Execute `DELETE /api/user/session`; confirme `Max-Age=0` nos dois cookies e `401` ao reutilizar a sessão anterior.

Use um jar local protegido e remova-o ao final. Nunca passe valores de cookie na linha de comando, logs, tickets ou screenshots.

## CORS e origem

Para `https://useoffice.com.br`, um preflight válido deve retornar `Access-Control-Allow-Origin` com a origem exata, `Access-Control-Allow-Credentials: true` e permitir `x-csrf-token`. Repita o preflight com `Origin: null` e `Origin: https://hostil.example`; ambos devem ser rejeitados e nunca receber uma origem permissiva. `Referer` hostil também deve falhar em chamadas mutáveis quando `Origin` estiver ausente.

## Telemetria segura

Monitore contagens, nunca valores:

- `auth.cookie.accepted`;
- `auth.bearer_compat.accepted`;
- `auth.session.validation.failed`, razões `invalid_token` ou `session_validation`;
- `auth.csrf.rejected`, razões `missing`, `mismatch`, `wrong_session`, `invalid_origin` ou `oversized`.

Investigue aumentos de `wrong_session`, `invalid_origin` ou falha de validação antes de avançar o rollout. Os eventos não podem registrar JWT, cookies, CSRF, senha ou claims.

## Compatibilidade Bearer

O padrão e o estado final são `GATEWAY_BEARER_AUTH_COMPATIBILITY=false`. Se um consumidor controlado bloquear o rollout, a exceção deve ter responsável e uma data de remoção registrada no change ticket no momento do deploy, limitada a no máximo 14 dias corridos. Durante a exceção, monitore `auth.bearer_compat.accepted` diariamente e remova o consumidor antes da data registrada.

## Rollback

Reverta as imagens de web, gateway e user-service em conjunto. Não desative CSRF, não restaure o cookie legível legado e não reduza os atributos dos cookies. Se for indispensável manter um consumidor interno durante o rollback, habilite apenas a compatibilidade Bearer limitada descrita acima; sessões web continuam usando `cw.session` e `cw.csrf`. Após o rollback, repita login, `/user/me`, refresh, mutação, logout e os três testes de origem.
