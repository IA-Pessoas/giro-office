# Personificação emite token de organização do alvo, com o operador numa claim extra

Para personificar, o backend emite um token de organização comum do alvo (mesmas claims de módulo, tipo e organização), acrescido de uma claim que identifica o operador, e registra a sessão em `auth_sessions` marcada como personificação, com expiração de 60 minutos. Assim todo o app, o gateway e os serviços enxergam o alvo exatamente como ele é, sem nenhum caminho especial de autorização; o operador só aparece no header repassado pelo gateway e na auditoria.

## Considered Options

- **Estender o token de plataforma** com um "agindo como": rejeitado porque o token de plataforma é negado em toda rota de organização, e liberar isso exigiria ramificar `canAccessRoute` e cada serviço para resolver o usuário efetivo.
- **Token de organização do alvo com claim do operador** (escolhido): reaproveita validação, revogação por `session_version` e políticas de rota existentes.

## Consequences

- A validação de sessão precisa checar, para sessões de personificação, se o operador continua ativo e com a permissão de personificar; revogar a permissão derruba a sessão na hora.
- Ninguém pode confiar em header de operador vindo do cliente: o gateway descarta e reescreve, como já faz com os outros headers de identidade.
