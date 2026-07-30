# Inventário e matriz de responsáveis por contexto

Esta matriz atende à issue #479. A regra comum é listar somente usuários ativos da organização que possuam permissão maior que zero no módulo solicitado. O endpoint contextual é `GET /rh/operational-users`; o filtro é aplicado no `rh-service` antes da resposta ao frontend.

## Matriz de contexto

| Contexto | Campos/selectores | Módulo enviado | Validação de escrita |
| --- | --- | --- | --- |
| Departamento Pessoal / Folha | `PessoalPayrollSection.responsible_id` | `pessoal` | `pessoal-service` valida organização, usuário ativo e permissão Pessoal |
| Departamento Pessoal / Obrigações | `PessoalObligationsSection.responsavel_id` | `pessoal` | `pessoal-service` valida organização, usuário ativo e permissão Pessoal |
| Departamento Pessoal / Senhas | `PessoalPasswordsSection.responsavel_id` | `pessoal` | `pessoal-service` valida organização, usuário ativo e permissão Pessoal |
| RH / Solicitações, Ponto, Banco de horas, Timesheets e Score | componentes RH com `useAssignableUsers` | `rh` | serviços RH mantêm autorização e escopo organizacional |
| TI / Estoque, Senhas, Ramais e Termos | componentes TI com `useAssignableUsers` | `ti` | serviços TI mantêm autorização e escopo organizacional |
| Contábil / Responsável principal e publicador | `ContabilResponsibleSection` | `contabil` | `contabil-service` valida o vínculo contextual |
| Integração / Tarefas e Modelos, inclusive responsáveis 2 e 3 | `TaskFormModal` e `TaskModelModal` | `integracao` + departamento selecionado | `task-service` rejeita responsáveis fora do contexto |
| Regularize / Licenças | `RegularizeLicenseForm.responsible_id` | `regularize` | `regularize-service` valida organização, usuário ativo e permissão Regularize |

## Contrato reutilizável

`app/src/modules/rh/hooks/useAssignableUsers.ts` inclui módulo, departamento e departamento por nome na chave de cache e na query. O backend combina:

- organização do usuário ou usuário sem organização ligado a departamento da organização;
- status `active`;
- permissão modular maior que zero;
- departamento escolhido, quando o formulário fornece `department_id` ou `department_name`.

O catálogo exige permissão de leitura em RH, Contábil, Pessoal ou Regularize, ou gestão RH. Isso evita expor o catálogo operacional a usuários sem contexto autorizado.

## Registros existentes

Durante edição, os componentes preservam uma opção `Responsável atual` quando o usuário persistido não aparece mais no catálogo elegível. O backend permite reenviar esse mesmo ID legado; uma nova atribuição precisa satisfazer a regra contextual.

## Endpoints relacionados

- `GET /rh/operational-users`: catálogo contextual reutilizável.
- `POST/PUT /pessoal/payroll`: responsável `responsible_id`.
- `PUT /pessoal/obligations`: responsável `responsavel_id`.
- `POST/PUT /pessoal/passwords`: responsável `responsavel_id`.
- `POST/PUT /regularize/license`: responsável `responsible_id`.
- `POST/PUT /task` e `/task-model`: responsáveis da Integração.
- Endpoints de responsáveis de Contábil, RH e TI: continuam usando o mesmo catálogo com o módulo correspondente.
