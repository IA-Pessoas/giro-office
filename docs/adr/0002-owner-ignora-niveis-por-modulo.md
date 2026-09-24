# Owner ignora os níveis por módulo; o papel exibido é "Owner"

O owner (`users.type = "owner"`) tem poder total sobre a própria organização. A autorização o reconhece pelo tipo, não pelo número de `permission` nem pelos níveis por módulo: `canAccessRoute` (`shared/src/auth/policy.ts`) aprova qualquer política de módulo quando `claims.type === "owner"`, e os serviços repetem a regra com `isOwner` (por exemplo, `requirePermission` do client-service e `requireIntegracaoRouteAccess`). Por isso a UI mostra o papel "Owner" no perfil e no Admin, em vez do rótulo do nível global, que para o owner não significa nada e confundia (a conta aparecia como "Visualizador" e fazia tudo, #1343).

Para os demais usuários valem os níveis por módulo: 1 (Visualizador) lê, 2 (Usuário) escreve, 3 (Administrador) administra. O gateway aplica esse corte em cada módulo, e `services/gateway/src/test/modulePermissionRegression.test.ts` trava a regra: o Visualizador é negado numa rota de escrita de cada módulo e o owner é aceito.

## Considered Options

- **Dar ao owner níveis 3 em todos os módulos e tirar o bypass**: rejeitado. Módulo novo nasceria sem acesso para o owner, e a transferência de ownership teria de reescrever permissões em lote.
- **Bypass pelo tipo, papel exibido como "Owner"** (escolhido): uma regra só, no mesmo lugar para gateway e serviços.

## Consequences

- Nenhuma tela deve derivar o papel do owner de `permission`; use `isOrganizationOwner`.
- Salvar o owner pelo Admin não envia `permission`, para não gravar um nível que não o descreve.
- Exceção conhecida: as mutações da Triagem aceitam nível 1 de Contábil ou Triagem (`triagemEditPolicy`), porque o operador da triagem mensal trabalha com esse nível. Qualquer outra exceção precisa aparecer aqui e no teste de regressão.
