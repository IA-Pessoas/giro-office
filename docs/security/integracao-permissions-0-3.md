# Política compartilhada da Integração — permissões 0–3

Contrato da issue [#579](https://github.com/IA-Pessoas/giro-office/issues/579).

## Decisão

`modules.integracao` é a fonte modular de autorização para usuários que não são `owner`. A
organização usada na avaliação é sempre a organização ativa da sessão; `organization_id` vindo do
cliente não altera esse contexto. Departamento, `user.permission` e permissões específicas não
elevam o nível modular implicitamente.

| Nível | Leitura | Mutação | Escopo de tarefa |
| ---: | --- | --- | --- |
| `0` | Somente “Minhas tarefas” | Apenas `status` e `observations` | Tarefa em que o usuário é `responsible_id`, `responsible2_id` ou `responsible3_id` |
| `1` | Todas as tarefas, clientes e projetos da organização | Apenas a exceção de tarefa própria do nível `0` | A leitura é organizacional; a mutação continua própria |
| `2` | Tudo do nível `1` | Cria/edita clientes, projetos e tarefas; consulta modelos; não inativa clientes nem administra modelos | Organização ativa |
| `3` | Tudo do nível `2` | Administração, exclusões sem dependências e modelos/configurações | Organização ativa |
| `owner` | Acesso global | Acesso total e gestão de permissões | Único bypass global |

## Campos e respostas

Os nomes abaixo são grupos usados na matriz. `organization_id` é sempre definido pelo contexto
autenticado e não é campo mutável do cliente.

- `C_CREATE`: `type`, `name`, `company_name`, `fantasy_name`, `cpf_cnpj`, `opening_date`,
  `responsible`, `cpf_responsible`, `number`, `email`, `agent`, `cpf_agent`, `instagram`,
  `indication`, `participants_meet`, `meet_type`, `type_registration`, `service_unique`,
  `status` e `prospecting_status`.
- `C_UPDATE`: os campos editáveis de `C_CREATE`, exceto `status`, mais
  `address`, `cep`, `neighborhood`, `state` e `city`; a alteração de estado usa as rotas de
  ativação/inativação do nível `3`.
- `P`: `name`, `client_id`, `start_date`, `end_date`, `objective` e `sponsor_id`.
- `T_CREATE`: `model_id`, `project_id`, `client_id`, `prospecting_status`, `observations` e
  `urgency`.
- `T_OWN`: somente `status` e `observations`.
- `T_UPDATE`: os campos de `T_CREATE` mais `name`, `status`, `department_id`, `billing`,
  `responsible_id`, `responsible2_id`, `responsible3_id` e `prevision_date`.
- `M`: `name`, `department_id`, `responsible_id`, `responsible2_id`, `responsible3_id`,
  `observations`, `billing`, `prevision` e `type`.
- `D`: `task_model_id`, `dependent_id`, `wait` e `observation`.

Em todas as linhas, `403` significa ação proibida sobre recurso visível, `404` significa recurso
fora do escopo organizacional/ownership e `409` significa exclusão impedida por dependência. Não
há cascata silenciosa. Leituras não geram auditoria de mutação; toda criação, edição, ativação,
inativação, conclusão, aprovação ou exclusão exige auditoria pelo fluxo do domínio.

## Matriz por rota e ação

| Método e rota | Recurso / ação | Nível mínimo e ownership | Organização | Campos mutáveis | Respostas | Auditoria | Teste responsável |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /client/list` | Cliente / leitura | `1`; nenhum ownership | Ativa | — | `403` | Não | `client.list` |
| `GET /client/:id` | Cliente / leitura | `1`; nenhum ownership | Ativa | — | `403/404` | Não | `client.detail` |
| `POST /client` | Cliente / criação | `2` | Ativa | `C_CREATE` | `403/404` | Sim | `client.create` |
| `PATCH /client/:id` | Cliente / edição | `2` | Ativa | `C_UPDATE` | `403/404` | Sim | `client.update` |
| `POST /client/integration` | Cliente / criação de integração | `2` | Ativa | `C_CREATE` | `403/404` | Sim | `client.integration.create` |
| `PATCH /client/:id/integration` | Cliente / edição de integração | `2` | Ativa | `C_UPDATE` | `403/404` | Sim | `client.integration.update` |
| `DELETE /client/:id` | Cliente / inativação | `3`; sem hard delete | Ativa | Estado do fluxo existente | `403/404` | Sim | `client.deactivate` |
| `POST /client/:id/activate` | Cliente / ativação | `3` | Ativa | Estado do fluxo existente | `403/404` | Sim | `client.activate` |
| `GET /project/list` | Projeto / leitura | `1`; nenhum ownership | Ativa | — | `403` | Não | `project.list` |
| `GET /project` | Projeto / leitura | `1`; nenhum ownership | Ativa | — | `403/404` | Não | `project.detail` |
| `GET /project/metrics` | Projeto / métricas | `1`; nenhum ownership | Ativa | — | `403` | Não | `project.metrics` |
| `POST /project/progress` | Projeto / recalcular progresso | `2` | Ativa | `project_id` | `403/404` | Sim | `project.progress` |
| `POST /project` | Projeto / criação | `2` | Ativa | `P` | `403/404` | Sim | `project.create` |
| `PUT /project` | Projeto / edição | `2` | Ativa | `P` | `403/404` | Sim | `project.update` |
| `DELETE /project` | Projeto / exclusão | `3`; sem dependências | Ativa | — | `403/404/409` | Sim | `project.delete` |
| `GET /task/list` | Tarefa / leitura | `0` própria; `1+` organização | Ativa | — | `403/404` | Não | `task.list` |
| `GET /task` | Tarefa / detalhe | `0` própria; `1+` organização | Ativa | — | `403/404` | Não | `task.detail` |
| `POST /task` | Tarefa / criação | `2` | Ativa | `T_CREATE` | `403/404` | Sim | `task.create` |
| `PUT /task` | Tarefa / edição | `0/1` própria em `T_OWN`; `2+` organização em `T_UPDATE` | Ativa | `T_OWN` ou `T_UPDATE` | `403/404` | Sim | `task.update` |
| `DELETE /task` | Tarefa / exclusão | `3`; sem dependências | Ativa | — | `403/404/409` | Sim | `task.delete` |
| `PUT /task/conclusion` | Tarefa / solicitar conclusão | `0/1` própria | Ativa | `status`, `observations` | `403/404` | Sim | `task.requestCompletion` |
| `PUT /task/complete-request` | Tarefa / aprovar conclusão | `2` + `task_completion`; `3` sem condição | Ativa | — | `403/404` | Sim | `task.approveCompletion` |
| `GET /task/model/list` | Modelo / leitura | `2+` | Ativa | — | `403` | Não | `taskModel.list` |
| `GET /task/model` | Modelo / detalhe | `2+` | Ativa | — | `403/404` | Não | `taskModel.detail` |
| `POST /task/model` | Modelo / criação | `3` | Ativa | `M` | `403/404` | Sim | `taskModel.create` |
| `PUT /task/model` | Modelo / edição | `3` | Ativa | `M` | `403/404` | Sim | `taskModel.update` |
| `DELETE /task/model` | Modelo / exclusão | `3`; sem dependências | Ativa | — | `403/404/409` | Sim | `taskModel.delete` |
| `GET /task/model/dependent` | Dependência de modelo / leitura | `3` | Ativa | — | `403/404` | Não | `taskModel.dependent.list` |
| `POST /task/model/dependent` | Dependência de modelo / criação | `3` | Ativa | `D` | `403/404` | Sim | `taskModel.dependent.create` |
| `DELETE /task/model/dependent` | Dependência de modelo / exclusão | `3`; sem dependências | Ativa | — | `403/404/409` | Sim | `taskModel.dependent.delete` |
