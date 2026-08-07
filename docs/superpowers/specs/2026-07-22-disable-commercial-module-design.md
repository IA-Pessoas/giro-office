# Desativacao Do Modulo Comercial

**Data:** 2026-07-22
**Status:** aprovado para implementacao
**Referencia:** commit `02e2dbf4`, que desativou Marketing, Parcelamento e Triagem

## Contexto

O modulo Comercial continua visivel no menu, possui o dashboard `/comercial` e tambem oferece um
fluxo comercial dentro dos detalhes de cada cliente. O dashboard consome
`GET /client/commercial/overview`, enquanto a edicao por cliente usa
`PATCH /client/:id/commercial`.

O objetivo e desativar toda a superficie publica do Comercial seguindo o comportamento adotado no
commit de referencia, sem afetar as demais operacoes do `client-service`.

Graphify nao possui grafo local para frontend ou services neste workspace. A navegacao desta spec
foi feita pelo fallback manual previsto no `AGENTS.md`, usando `rg`, historico Git e leitura dos
arquivos reais.

## Comportamento Esperado

1. Comercial nao aparece no menu de modulos.
2. Comercial nao aparece nas opcoes de permissao ao criar ou editar usuarios.
3. O resolvedor de acesso considera `comercial` desativado, inclusive para administradores
   globais.
4. A pagina `/comercial` retorna `404` no SSR e nao importa a implementacao visual do dashboard.
5. O detalhe do cliente nao exibe a acao "Abrir comercial".
6. A pagina `/clients/:id/commercial` retorna `404` no SSR e nao importa o formulario comercial.
7. O gateway retorna `404` para as rotas comerciais antes de chamar o `client-service`:
   - qualquer metodo em `/client/commercial/overview`;
   - qualquer metodo em `/client/:id/commercial`.
8. As operacoes comerciais nao aparecem na OpenAPI agregada do gateway.
9. As demais paginas e rotas de clientes permanecem disponiveis conforme as permissoes atuais.

## Desenho

### Frontend

O modulo `comercial` sera incluido em `DISABLED_MODULE_KEYS`, reutilizando o bloqueio central ja
existente em `resolveModuleAccess`. A entrada sera removida do mapa de rotas, da navegacao e das
configuracoes de permissao, no mesmo formato dos tres modulos ja desativados.

As duas paginas comerciais permanecerao como entrypoints minimos que retornam `notFound: true` via
`canSSRAuth`. As implementacoes de dashboard, hooks, services e formulario permanecerao no
repositorio, mas sem entrada publica ativa, facilitando uma futura reativacao.

### Gateway

As rotas comerciais compartilham o prefixo `/client` com funcionalidades que devem continuar
ativas. Por isso, o `client-service` nao pode ser removido da registry como ocorreu com o servico
isolado de Parcelamento.

O gateway tera uma definicao central das rotas comerciais desativadas. Essa definicao sera usada
antes do proxy para responder `404` e pela agregacao OpenAPI para omitir as operacoes. O bloqueio
sera montado depois da autenticacao e antes das rotas de servico, mantendo o mesmo limite de
seguranca das demais rotas protegidas e impedindo chamadas ao upstream.

O contrato e a implementacao interna do `client-service` permanecerao inalterados. Assim, a
desativacao controla a superficie publica do gateway sem misturar a mudanca com remocao de codigo
de dominio.

## Fora Do Escopo

- Excluir dados comerciais existentes.
- Remover tabelas, campos ou services internos do Comercial.
- Remover o departamento Comercial ou alterar usuarios ja vinculados a ele.
- Bloquear listagem, detalhe, edicao ou outras operacoes comuns de clientes.
- Alterar termos de outros dominios que contenham a palavra "comercial", como registro na junta
  comercial.
- Reiniciar containers, fazer deploy, commit da implementacao ou push sem solicitacao posterior.

## Testes E Validacao

O trabalho seguira TDD:

1. Expandir os testes de autenticacao do frontend para exigir `comercial` na lista desativada,
   ausencia no menu/permissoes e `404` nas duas paginas.
2. Adicionar teste da pagina de detalhe para garantir que a acao comercial nao seja registrada.
3. Adicionar testes do gateway comprovando `404` mesmo para administrador global e zero chamadas
   ao upstream nas duas rotas.
4. Validar que a OpenAPI agregada nao contem `/client/commercial/overview` nem
   `/client/{id}/commercial`.
5. Rodar os testes escopados do frontend e gateway, typecheck dos pacotes afetados e
   `git diff --check`.

## Criterios De Aceite

- Nenhum acesso publico ao dashboard ou ao fluxo comercial por cliente.
- Nenhuma chamada das rotas bloqueadas chega ao `client-service` pelo gateway.
- Nenhuma regressao nas demais rotas de clientes.
- Nenhum dado ou codigo interno do Comercial e apagado.
