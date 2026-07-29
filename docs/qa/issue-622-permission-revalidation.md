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

O Graphify não tinha grafos locais para `app` ou `services`; os comandos de contexto reportaram essa ausência e a descoberta manual foi usada conforme o fallback documentado no `AGENTS.md`.

## Evidências observadas

| Perfil | Navegação/UI | Backend observado |
| --- | --- | --- |
| Nível 0 | Dashboard, Minhas tarefas e Configurações visíveis; `/projects` direto mostrou “Acesso indisponível”. `/tasks` exibiu a tarefa QA e o botão de edição da tarefa própria. | `GET /task/list` = 200, 1 tarefa, `isOwn: true`; `PUT /task` próprio em `observations` = 200. |
| Nível 1 | Clientes e Projetos visíveis em modo leitura: não exibiu “Novo cliente” nem ações de edição do projeto. Em Tarefas, a linha própria exibiu “Editar tarefa”. | `GET /client/list` = 200; leitura cross-org de cliente/projeto/tarefa = 404; `PATCH /client/:id` e `PUT /project` = 403; `PUT /task` próprio em `observations` = 200; `GET /task/list` = 200, `isOwn: true`. |
| Nível 2 | Clientes exibiu “Novo cliente”; Projetos exibiu “Novo projeto” após selecionar o cliente e exibiu “Editar”/“Recalcular” no projeto. | Criação/edição real de cliente = 201/200; criação/edição real de projeto = 201/200; criação/edição real de tarefa = 201/200. A massa temporária foi removida/inativada ao fim da prova. `GET /task/list` = 200, `isOwn: true`. Exclusão de projeto = 403. |
| Nível 3 | `/configs/integracao/tasks` direto carregou “Modelos de tarefas”, com “Novo modelo”, “Editar modelo” e “Excluir modelo”. | Exclusão do projeto QA com tarefa dependente = 409; o recurso dependente não foi removido. `GET /task/list` = 200. |
| Owner | Dashboard exibiu a navegação ampliada, incluindo Departamentos, módulos e Administração. `/administracao` direto carregou as abas “Usuários” e “Permissões” e “Novo usuário”. | `GET /task/list` = 200; o owner manteve a leitura global e a gestão de permissões prevista pela matriz. |

As três posições de ownership foram exercitadas pelo mesmo registro semeado: nível 0, nível 1 e nível 2 receberam `isOwn: true` ao consultar `/task/list`; nível 3 e owner receberam a tarefa administrativa sem ownership próprio. O teste de fixture também valida os três mapeamentos de IDs.

## Limitação de ambiente

O modelo atual de sessão carrega uma única `organization_id` no usuário/token e a UI não oferece seletor de organização para trocar de A para B sem logout/login. Assim, a parte “trocar A→B mantendo a sessão” da issue #622 não é reproduzível neste ambiente sem introduzir uma capacidade de associação/sessão multi-organização fora do escopo desta issue. O isolamento cross-org direto foi validado por 404 e a limitação deve permanecer explícita; não recomendo fechar #551 com essa lacuna de ambiente ainda aberta.

## Testes da massa QA

```text
pnpm qa:integracao
5 testes, 5 pass, 0 fail
```

As evidências HTTP foram coletadas contra o gateway local com os usuários reais semeados (`qa.alfa.level0`, `qa.alfa.level1`, `qa.alfa.level2`, `qa.alfa.level3` e `qa.alfa.owner`) e senha descartável local. Tokens não foram registrados neste documento.

## Roteiro reproduzível

Fluxos visíveis executados: login de cada perfil; `/tasks`; `/clients`; `/projects`; `/projects?clientId=34000000-0000-4000-8000-000000000001`; `/configs/integracao/tasks`; `/administracao`; logout e novo login entre perfis. As verificações diretas usaram `GET /task/list`, `GET /client/list`, `GET|PUT /task`, `GET|PATCH /client/:id`, `GET|PUT|DELETE /project` e detalhes cross-org com os IDs das fixtures.

Os testes automatizados de autenticação também cobrem invalidação da sessão, encerramento do loading e orientação de retorno ao login: `pnpm --filter @workspace/app test:auth` passou. A troca A→B mantendo a sessão continua bloqueada pelo modelo atual de uma organização por usuário/token e está registrada acima, sem substituí-la por logout/login.
