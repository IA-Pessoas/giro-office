# Login de super admin continua público, com limite de tentativas por IP

A página `/super-admin/login` e o `POST /platform/session` continuam acessíveis a qualquer um. Esconder a rota não protege nada: o endereço já circula no bundle do app e em links. A proteção fica em três camadas.

- O gateway limita a 10 tentativas por minuto cada par IP + rota, nas rotas que recebem credencial (`POST /platform/session`, `POST /user/session` e `POST /user/password-reset/confirm`), com o binding `LOGIN_RATE_LIMITER` do Workers, e responde 429 ao estourar.
- A senha do super admin segue a mesma verificação com hash dos demais logins.
- Toda rota `/platform/*` além do login exige sessão de plataforma (`platformOnly`).

## Considered Options

- **Rota não anunciada**: rejeitada, porque é só obscuridade e dificulta o suporte.
- **Cloudflare Access (allowlist ou SSO) na frente de `/super-admin` e `/platform/*`**: é o caminho para restringir de verdade quem chega ao login. Fica para depois, porque depende de configurar o Zero Trust na conta, fora do código.
- **2FA para super admin**: desejável e fora deste escopo; exige tabela de segredos TOTP e fluxo de recuperação.
- **Limite por IP no gateway** (escolhido agora): funciona sem infraestrutura nova e cobre também o login de organização e o link de redefinição.

## Consequences

- Sem o binding (dev local e testes), o limite não se aplica. O `wrangler.jsonc` do gateway o declara para produção.
- O limite é por IP: um ataque distribuído passa. Access ou 2FA fecham isso.
- A chave é `rota:IP`, então um IP pode somar até 30 tentativas por minuto nas três rotas.
- O `namespace_id` do binding precisa ser único na conta Cloudflare; outro Worker com o mesmo id compartilharia os contadores.
- O `PLATFORM_AUTH_RATE_LIMIT_*` vale só no user-service Node (Express); em produção (Workers) o limite é este do gateway.
- CPFs de clientes e sócios (certificados PF, Departamento Pessoal, Regularize) continuam em claro nas listas, porque a operação contábil precisa deles. Ficam fora da #1344, que trata de colaboradores.
