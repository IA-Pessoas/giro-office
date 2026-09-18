# Design: dossiê do colaborador no RH

## Escopo

Issue #1134 do Milestone #22. Entregar o fluxo de dossiê do colaborador no RH,
incluindo dados cadastrais, alergias e contatos de emergência. O escopo não
inclui ponto, folha, solicitações, férias, atas, relatórios adicionais ou
outros domínios das issues seguintes.

## Abordagens consideradas

1. Estender o `user-service` e suas rotas `/user`.
   Reutiliza o dono atual do modelo `User`, mas mistura administração geral de
   usuários com regras específicas do RH.
2. Criar um módulo de perfil no `rh-service` sobre o modelo `User` existente.
   Mantém a tela e a autorização no domínio RH, reaproveita o cliente Prisma
   já usado pelo serviço e permite uma projeção sensível diferente por papel.
   Esta é a abordagem escolhida.
3. Criar um serviço separado de colaboradores.
   Isola o domínio, mas adiciona outro serviço, contrato, gateway e ciclo de
   deploy para um agregado que já está armazenado em `User`.

## Interface HTTP

Manter os paths legados do fluxo de perfil, sob o prefixo público `/rh`:

- `GET /rh/profile/colaborator`: detalhe do próprio colaborador; RH admin
  pode informar `user_id` de um colaborador da organização; gestor pode abrir
  apenas colaborador do próprio departamento e recebe projeção não sensível.
- `GET /rh/profile/colaborator/list`: lista a projeção não sensível da
  organização para RH admin ou do departamento do gestor; colaborador comum
  recebe apenas a própria linha.
- `PUT /rh/profile/colaborator`: atualiza o dossiê. O alvo é o usuário
  autenticado por padrão; `target_user_id` só será aceito para RH admin e será
  validado contra a organização no servidor.
- `GET /rh/profile/contact`: lista contatos do alvo autorizado.
- `POST /rh/profile/contact`: cria contato para o alvo autorizado.
- `PUT /rh/profile/contact`: atualiza contato existente pelo `id` dentro do
  array do usuário autorizado.
- `DELETE /rh/profile/contact`: remove contato pelo `id`, sempre com lookup
  vinculado ao usuário e à organização autenticados.
- `GET /rh/profile/allergy`: lista alergias do alvo autorizado.
- `PUT /rh/profile/allergy`: substitui a lista de alergias do alvo autorizado
  depois de validar cada item.

Todos os endpoints retornam o envelope `createSuccessResponse`. Nenhum aceita
`organization_id` como parâmetro de escopo. O contrato será replicado em
`app/src/modules/rh/services/rhService.contract.ts`, `types.ts`, OpenAPI,
testes de rota e manifesto de smoke.

## Modelo e projeções

Usar os campos existentes de `User`: `full_name`, `gender`, `birth_date`,
`cpf`, `rg`, `address`, `job_title`, `email`, `phone`, `hire_date`,
`termination_date`, `photo_url`, `status`, `department_id`, `allergies` e
`emergency_contacts`. Adicionar `dominio_hire_date` ao modelo e migration,
porque a aceitação exige a admissão no Domínio.

O dossiê completo contém todos os campos cadastrais, departamento, alergias e
contatos. A projeção de lista/gestor contém apenas identificador, nome,
cargo, departamento, foto e status; nunca CPF, RG, endereço, datas de vínculo,
alergias ou contatos.

Cada alergia será `{ name, fonts, action }`, com os três textos não vazios.
Cada contato será `{ id, name, phone, reference }`, com `id` gerado pelo
servidor e `reference` opcional. Dados JSON inválidos ou chaves desconhecidas
serão rejeitados na entrada.

## Autorização e isolamento

A autorização do dossiê reutiliza o nível já encaminhado em `modules.rh`; não
será criado um segundo campo ou claim de permissão. Nesta superfície, a matriz
de negócio é deliberadamente específica do dossiê: nível 1 representa o
colaborador, nível 2 representa o gestor departamental e nível 3 representa o
RH administrativo. Os demais fluxos RH preservam sua interpretação atual dos
mesmos níveis (incluindo o acesso a mensagens de workflow do nível 2).

- Nível RH 1: lê e altera apenas o próprio dossiê nos campos `address`,
  `email`, `phone` e `allergies`; cria, edita, lista e remove os próprios
  contatos.
- Nível RH 2: consulta apenas a projeção não sensível de usuários do mesmo
  `department_id` do ator; não altera dossiê de terceiros nem acessa dados
  sensíveis.
- Nível RH 3: consulta e altera o dossiê completo e contatos de qualquer
  usuário pertencente à organização autenticada.

O service carregará o ator e o alvo com predicados de organização e fará a
checagem de departamento no banco. IDs de outra organização retornam 404 ou
403 conforme o caso, sem revelar a existência do registro.

## Auditoria e erros

As mutações serão expostas pelo gateway, que já registra as rotas RH. Serão
adicionadas classificações explícitas para dossiê, alergias e contatos; o
registro guardará ação, alvo e resultado, nunca valores de CPF, RG, endereço,
alergias, contatos ou outros dados protegidos. O service não fará logging de
payloads sensíveis.

Rotas usam Zod + `parseWithZod`; regras de negócio lançam `ServiceError` e os
handlers encaminham o erro ao handler global. Erros de organização, papel,
target inválido e JSON inválido terão testes de contrato.

## Frontend

Adicionar uma aba compacta `Dossiê` à navegação RH existente. Para colaborador,
mostrar o próprio formulário e seus contatos/alergias. Para RH admin, mostrar
lista de colaboradores e painel de detalhe/edição. Gestor de departamento
verá somente a lista/projeção não sensível. Reutilizar classes, `Dialog`,
React Query, estados de loading/erro/vazio e padrões visuais já usados no
módulo; não introduzir mock ou redesign.

## Seams e validação

Seams públicos confirmados para TDD:

1. `EmployeeDossierService`: autorização, isolamento, projeções, atualização
   parcial, normalização JSON e auditoria sem dados sensíveis.
2. Router `/rh/profile/*`: autenticação, níveis 1/2/3, Zod, envelopes e
   serialização de erros.
3. Contrato frontend `rhProfileService`/hooks: paths, payloads, invalidação
   de cache e estados de acesso.
4. Navegação RH: renderização da aba, lista/detalhe, edição e contatos.

Validações: testes unitários e de rota do `rh-service`, testes de política e
proxy do gateway, `pnpm smoke:coverage`, testes direcionados do RH, typecheck
do app e serviços, lint, build e fluxo real no navegador com screenshots em
`output/playwright/`.
