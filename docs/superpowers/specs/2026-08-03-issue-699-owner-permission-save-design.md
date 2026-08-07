# Issue #699 — Design: salvar permissões de usuário

## Contexto

Na tela `Administração > Permissões`, o owner consegue editar módulos diretamente por
`PUT /user/permission/:userId`. Porém, quando o módulo do departamento do usuário precisa ser
sincronizado, `Administracao.tsx` chama `userService.update`, que envia `PATCH /user/:id`.

O contrato real do `user-service` monta `PUT /user/:id`, e os testes do serviço cobrem esse verbo.
Portanto, esse ramo do salvamento chega a uma rota inexistente no gateway/user-service e retorna
`404`.

## Decisão

Usar `PUT /user/:id` no cliente, alinhando o método HTTP ao contrato já existente no backend.
Manter `PUT /user/permission/:userId` para atualizações modulares que não exigem sincronização do
módulo de departamento.

Adicionar a política correspondente no gateway para que `PUT /user/:id` siga a mesma barreira de
gestão de usuários das demais rotas administrativas. A validação de payload modular e a exigência
de owner para mutações de permissões continuam no `user-service`.

## Escopo

- Alterar somente o método HTTP usado por `app/src/modules/users/services/userService.ts`.
- Atualizar o teste estático do módulo de usuários para proteger o método e o payload modular.
- Registrar `PUT /user/:id` na política do gateway e cobrir autorização/roteamento.
- Não criar rota nova no backend, não alterar banco e não mudar o endpoint modular dedicado.

## Segurança e compatibilidade

Usuários sem permissão continuam rejeitados pelo gateway/user-service. O backend continua aplicando
`requireOwnerUserAuth` quando o payload contém `modules`, `type` ou promoção a owner. O suporte ao
`PATCH` existente não será removido nesta correção.

## Validação

- teste do módulo frontend de usuários;
- testes de política e rotas do gateway;
- testes do user-service relacionados a `PUT /user/:id` e permissões;
- typecheck/check dos pacotes alterados;
- revisão de diff e busca de chamadas restantes a `PATCH /user/:id`.
