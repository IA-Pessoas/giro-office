Fonte original: .cursor/rules/gateway-routing-standards.mdc

Metadados originais do Cursor:
System.Object[]

# Gateway Routing Standards

## Ownership de configuracao
- O gateway deve ser dono da configuracao dos upstreams que consome.
- URLs de upstream devem ficar em `services/gateway/src/config/env.ts`.
- Nao hardcodar URLs em `app.ts`, middlewares, OpenAPI ou testes quando o valor faz parte da configuracao do gateway.
- Nao usar arquivo compartilhado como fonte primaria de URLs especificas do gateway quando `GatewayEnv` puder ser a fonte de verdade.

## Fonte unica de verdade
- O gateway deve ter uma registry unica de servicos, por exemplo em `services/gateway/src/config/serviceRegistry.ts`.
- Essa registry deve concentrar:
  - prefixos publicos roteados pelo gateway
  - target URL do upstream
  - nome logico do servico
  - metadados usados por audit e OpenAPI agregada
- `app.ts`, audit, seguranca e OpenAPI agregada devem consumir essa registry em vez de manter mapas paralelos.

## Prefix-based routing no gateway
- Cada servico exposto pelo gateway deve ter um prefixo publico explicito:
  - `/user`
  - `/task`
  - `/project`
  - `/organizations`
  - `/rh`
  - `/audit`
- O gateway deve resolver servicos por prefixo, sem logica espalhada por matchers ad hoc quando o contrato for prefix-based.
- Evitar duplicacao ou variacao de prefixos para o mesmo servico.

## Contrato publico das rotas
- O gateway deve refletir exatamente o contrato publico dos servicos.
- Nao introduzir redundancia no path, por exemplo:
  - errado: `/user/users`, `/task/tasks`, `/project/projects`
  - certo: `/user`, `/task`, `/project`
- Quando houver conflito entre `GET` de detalhe e `GET` de colecao, o padrao publico deve ser:
  - `GET /prefixo` para detalhe
  - `GET /prefixo/list` para listagem

## OpenAPI e audit
- A OpenAPI agregada do gateway deve usar os mesmos prefixos publicos e a mesma registry do runtime.
- O audit deve identificar `routeTarget` a partir da mesma registry do gateway.
- Evitar qualquer drift entre runtime, audit, docs e testes.

## Testes
- Testes do gateway devem validar:
  - roteamento por prefixo correto
  - paths publicos corretos na OpenAPI agregada
  - `routeTarget` correto no audit
  - resposta 404 para rotas fora da registry

