# QA da issue #622 — reexecução da matriz 0/1/2/3/owner

Data: 2026-07-29<br>
Issue: [#622](https://github.com/IA-Pessoas/giro-office/issues/622)<br>
Issue-pai: [#551](https://github.com/IA-Pessoas/giro-office/issues/551)<br>
BASE_SHA: `095ae7c04ccaa1791ac7d9bdc1fd692a1247caf4`<br>
Branch: `feat/issue-622-permission-revalidation`

## Escopo e preparação

Esta execução revalida a matriz de permissões da Integração definida em #551, incluindo os três campos de ownership da tarefa. Não altera a matriz nem implementa troca de organização na sessão.

A fixture declarativa agora associa a mesma tarefa QA a `responsible_id`, `responsible2_id` e `responsible3_id`, respectivamente, aos usuários nível 0, 1 e 2. O seed Prisma passou a persistir os três campos, mantendo nível 3 e owner como perfis administrativos da mesma organização.

O ambiente usou PostgreSQL descartável local, migrations versionadas aplicadas no banco e `pnpm --filter @workspace/infra prisma:seed:qa`. O Prisma CLI não conseguiu executar `migrate deploy`/`migrate status` neste ambiente (`Schema engine error: undefined`); por isso, as migrations versionadas foram aplicadas diretamente ao banco descartável antes do seed. Nenhum dado de produção foi usado.

Os comandos de contexto do Graphify inicialmente reportaram ausência de grafos locais; a descoberta manual foi usada conforme o fallback documentado no `AGENTS.md`. Depois da alteração, `pnpm graphify:update:services`, `pnpm graphify:update:ui` e `pnpm graphify:refresh` concluíram com extração AST local e atualizaram os grafos ignorados do worktree.

## Evidências observadas

| Perfil | Navegação/UI | Backend observado |
| --- | --- | --- |
| Nível 0 | Dashboard, Minhas tarefas e Configurações visíveis; `/projects` direto mostrou “Acesso indisponível”. `/tasks` exibiu a tarefa QA e o botão de edição da tarefa própria. A visibilidade de Dashboard/Configurações é um achado contra a regra “somente Minhas tarefas” de #551/#581, não um critério aprovado. | `GET /task/list` = 200, 1 tarefa, `isOwn: true`; `PUT /task` próprio em `observations` = 200. |
| Nível 1 | Clientes e Projetos visíveis em modo leitura: não exibiu “Novo cliente” nem ações de edição do projeto. Em Tarefas, a linha própria exibiu “Editar tarefa”. | `GET /client/list` = 200; leitura cross-org de cliente/projeto/tarefa = 404; `PATCH /client/:id` e `PUT /project` = 403; `PUT /task` próprio em `observations` = 200; `GET /task/list` = 200, `isOwn: true`. |
| Nível 2 | Clientes exibiu “Novo cliente”; Projetos exibiu “Novo projeto” após selecionar o cliente e exibiu “Editar”/“Recalcular” no projeto. | Criação/edição real de cliente = 201/200; criação/edição real de projeto = 201/200; criação/edição real de tarefa = 201/200. A massa temporária foi removida/inativada ao fim da prova. `GET /task/list` = 200, `isOwn: true`. Exclusão de projeto = 403. |
| Nível 3 | `/configs/integracao/tasks` direto carregou “Modelos de tarefas”, com “Novo modelo”, “Editar modelo” e “Excluir modelo”. | CRUD real de modelo = 201/200/200; exclusão do projeto QA com tarefa dependente = 409; o recurso dependente não foi removido. `GET /task/list` = 200. |
| Owner | Dashboard exibiu a navegação ampliada, incluindo Departamentos, módulos e Administração. `/administracao` direto carregou as abas “Usuários” e “Permissões” e “Novo usuário”. | `GET /task/list` = 200; o owner manteve a leitura global e a gestão de permissões prevista pela matriz. A persistência de auditoria da alteração administrativa não foi consultada separadamente nesta execução. |

As três posições de ownership foram exercitadas pelo mesmo registro semeado: nível 0, nível 1 e nível 2 receberam `isOwn: true` ao consultar `/task/list`; nível 3 e owner receberam a tarefa administrativa sem ownership próprio. O teste de fixture também valida os três mapeamentos de IDs.

### Usuário adicional criado no ambiente descartável

Para ampliar a prova manual, o owner criou pelo endpoint de administração o usuário `QA Manual 622` (`qa.alfa.manual.622`, ID `4ad589c0-4c5e-45d1-8ba9-a94ac35ea96d`) na organização Alfa, com `modules.integracao = 1`. O login foi concluído pela tela visível do app e os seguintes fluxos foram observados:

- `/dashboard`: navegação de Dashboard, Clientes, Projetos, Tarefas e Configurações; sem Administração, Departamentos ou módulos administrativos.
- `/tasks`: a tarefa QA carregou, sem ação de edição para tarefa não própria.
- `/clients`: listagem em leitura, sem ação “Novo cliente”.
- `/clients/integration/new`: estado explícito informando que criação exige nível 2/3, sem formulário de criação.
- `/projects` e `/projects?clientId=34000000-0000-4000-8000-000000000001`: projeto visível em leitura, sem Novo, Editar ou Recalcular.
- `/configs/integracao/tasks`: modelos visíveis em leitura, sem Novo, Editar ou Excluir.
- `/administracao`: estado explícito de área restrita, sem conteúdo administrativo.

Na mesma sessão descartável, o backend respondeu `201` na criação do usuário, `GET /user/permission/:id` com Integração nível 1, `200` para listagens de tarefas/clientes, `403` para `PATCH /client/:id`, e `404` para detalhes cross-org e atualização de tarefa não própria. Uma tentativa de alteração válida de projeto excedeu o timeout local do gateway descartável; a matriz de projeto nível 1 já possui cobertura automatizada e evidência manual anterior de `403`.

## Limitação de ambiente

O modelo atual de sessão carrega uma única `organization_id` no usuário/token e a UI não oferece seletor de organização para trocar de A para B sem logout/login. Assim, a parte “trocar A→B mantendo a sessão” da issue #622 não é reproduzível neste ambiente sem introduzir uma capacidade de associação/sessão multi-organização fora do escopo desta issue. O isolamento cross-org direto foi validado por 404 e a limitação deve permanecer explícita; não recomendo fechar #551 com essa lacuna de ambiente ainda aberta.

## Testes da massa QA

```text
pnpm qa:integracao
5 testes, 5 pass, 0 fail
```

As evidências HTTP foram coletadas contra o gateway local com os usuários reais semeados (`qa.alfa.level0`, `qa.alfa.level1`, `qa.alfa.level2`, `qa.alfa.level3` e `qa.alfa.owner`) e senha descartável local. Tokens não foram registrados neste documento.

A suíte de política compartilhada também valida as três posições de ownership para tarefas próprias e não-próprias, incluindo as decisões `403/404`: a execução direta com `tsx --test tests/integracao-policy.test.ts` passou com 9/9.

Na reexecução após os ajustes dos bloqueios, as suítes afetadas passaram: project-service 40/40 (3 testes skip), contabil-service 68/68, fiscal-service 59/59, task-service 116/116, ti-service 219/219 e gateway 152/152. O teste de imagens dinâmicas do app passou 6/6. O `CI=true pnpm test` completo passou com 37/37 tarefas Turbo e o gate `qa:integracao` passou com 5/5.

Os 401 eram causados por testes herdando `AUDIT_SERVICE_TOKEN` do `.env` local; os bootstraps e testes de rota agora fixam tokens de teste herméticos. A suíte Contábil também corrigiu o nível do cenário de escrita para 2, conforme a matriz. O `tiStockService` passou a aguardar as operações Prisma para que conflitos assíncronos retornem 409. No gateway, usuário não-owner sem claim modular recebe nível 0; somente owner mantém o bypass global nível 3, conforme #551/#562. O uso de imagens dinâmicas do módulo TI foi registrado no teste de otimização com `decoding="async"`.

Os gates finais passaram: `pnpm build` em 19/19 targets, `pnpm typecheck` em 21/21, `pnpm format:check` sem falhas e `pnpm lint` com exit 0. O format emite apenas informação sobre o JSON baseline de 4 MiB; o lint mantém um warning baseline em `shared/src/auth/token.ts`.

## Roteiro reproduzível

Fluxos visíveis executados: login de cada perfil; `/tasks`; `/clients`; `/projects`; `/projects?clientId=34000000-0000-4000-8000-000000000001`; `/configs/integracao/tasks`; `/administracao`; logout e novo login entre perfis. As verificações diretas usaram `GET /task/list`, `GET /client/list`, `GET|PUT /task`, `GET|PATCH /client/:id`, `GET|PUT|DELETE /project` e detalhes cross-org com os IDs das fixtures.

Os testes automatizados de autenticação também cobrem invalidação da sessão, encerramento do loading e orientação de retorno ao login: `pnpm --filter @workspace/app test:auth` passou. A prova real de downgrade foi `PUT /user/permission/:userId` pelo owner, reduzindo `3 → 1` = 200; o token aberto do nível 3 foi invalidado = 401; o novo token nível 1 manteve leitura de tarefas/modelos permitida, sem mutações administrativas; o seed foi executado novamente para restaurar a fixture.

Após o seed real, defina uma URL QA explícita (`QA_DB_URL='postgresql://postgres:postgres@127.0.0.1:55432/issue622'`), execute `DATABASE_URL="$QA_DB_URL" pnpm --filter @workspace/infra prisma:seed:qa` e depois `QA_INTEGRACAO_DATABASE_URL="$QA_DB_URL" pnpm qa:integracao:db`; o gate gera o cliente Prisma, consulta diretamente `integracao.tasks` e confirma a organização e os três IDs persistidos. Sem `QA_INTEGRACAO_DATABASE_URL`, esse gate falha deliberadamente; `pnpm qa:integracao` permanece o ciclo unitário sem banco.

A troca A→B mantendo a sessão continua bloqueada pelo modelo atual de uma organização por usuário/token e está registrada acima, sem substituí-la por logout/login.
