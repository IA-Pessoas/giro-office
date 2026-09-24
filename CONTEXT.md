# Workspace

Plataforma multi-organização: cada organização tem seus usuários e níveis por módulo; a plataforma é operada por super admins que atravessam organizações.

## Identidades

**Usuário de organização**:
Pessoa que pertence a uma organização e acessa os módulos dela conforme seus níveis de permissão.
_Avoid_: conta, cliente

**Super admin**:
Pessoa que opera a plataforma, fora de qualquer organização, e administra organizações e seus usuários.
_Avoid_: usuário de plataforma, admin global, root

**Owner**:
Usuário de organização com poder total sobre a própria organização: passa por qualquer nível por módulo, e a UI exibe o papel "Owner" (ver `docs/adr/0002-owner-ignora-niveis-por-modulo.md`).
_Avoid_: proprietário (só na UI), dono

**Visualizador**:
Nível 1 de um módulo: lê, mas não escreve. Nível 2 (Usuário) escreve; nível 3 (Administrador) administra.
_Avoid_: viewer (na UI)

## Personificação

**Personificação**:
Um super admin agindo dentro de uma organização como se fosse um usuário específico dela, com os mesmos poderes desse usuário.
_Avoid_: impersonate (na UI), login como, sudo, acessar como

**Operador**:
O super admin que está personificando.
_Avoid_: impersonator (na UI), admin

**Alvo**:
O usuário de organização ativo que está sendo personificado.
_Avoid_: personificado, vítima, usuário impersonado

**Sessão de personificação**:
O período entre o operador iniciar a personificação e sair dela ou ela expirar.
_Avoid_: sessão impersonada

**Permissão de personificar**:
Atributo de um super admin que o autoriza a iniciar personificações; só quem já a tem pode concedê-la ou revogá-la.
_Avoid_: flag de impersonate
