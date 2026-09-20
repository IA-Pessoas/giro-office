# Regularize: orientação independente e checklist de 17 itens

**Issue:** #1125
**Milestone:** #21
**Data:** 2026-09-16
**Status:** especificação arquitetural para revisão

## 1. Contexto e objetivo

Hoje a orientação processual do Regularize exige um `process_id`, mantém um conjunto de campos legados no registro pai e guarda atividades econômicas e sócios como JSON. Isso impede orientar uma PJ, PF ou não cliente antes de existir um processo, dificulta o vínculo posterior e não representa de forma auditável o checklist operacional solicitado pela issue.

O objetivo é tornar a orientação independente e segura, mantendo compatibilidade com os registros existentes:

- permitir alvo PJ, PF ou não cliente;
- permitir orientação sem processo e vincular, remover ou trocar o processo depois;
- manter o vínculo e todos os dados limitados à organização autenticada;
- representar exatamente 17 itens de checklist, cada um com status e observação opcional;
- permitir dados de filial somente quando o item de filial estiver concluído;
- preservar histórico finalizado e impedir mais de uma orientação em andamento para o mesmo processo;
- executar atualização e auditoria de forma atômica;
- alinhar API, OpenAPI, frontend, cache e testes.

### Critérios derivados

| Critério da issue | Decisão desta especificação |
| --- | --- |
| PJ, PF ou não cliente com snapshot cadastral | `target_type`, referência opcional ao cadastro da organização e `target_snapshot` imutável por operação |
| Processo opcional e vínculo controlado | `process_id` anulável, validado por organização em toda criação e alteração |
| Uma orientação em andamento por processo | índice único parcial por organização, processo e status |
| Exatamente 17 itens | tabela filha com conjunto canônico de códigos e validação de cardinalidade |
| Status e observação | enum de domínio com `Pendente`, `Concluído` e `Não se aplica` |
| Filial condicional | `branch_data` aceito apenas quando o item `branch` estiver `Concluído` |
| Atomicidade e auditoria | transação única para pai, itens, vínculo e log |
| Isolamento e permissões | escopo organizacional e permissão Regularize mantidos em serviço, rotas e frontend |

## 2. Decisão arquitetural

Será usada uma evolução aditiva do modelo atual. O registro `ProceduralGuidance` continuará sendo a fonte de compatibilidade com clientes legados, mas receberá metadados do alvo, processo opcional e dados de filial. Uma nova tabela filha armazenará os 17 itens estruturados.

Os campos legados não serão removidos nesta issue. Durante a transição, o serviço deverá manter a projeção compatível entre os campos legados e os itens correspondentes. A migração não apagará nem substituirá orientações antigas.

Não será criado um fluxo separado para “orientação independente”. O mesmo recurso de orientação passará a aceitar processo opcional e alvo explícito, reduzindo divergência entre telas, contratos e auditoria.

## 3. Modelo de dados

### 3.1. `ProceduralGuidance`

Manter os campos atuais e adicionar:

- `process_id String?`, preservando a relação opcional com `Process`;
- `target_type String`, com os valores exatos `PJ`, `PF` e `SEM_CLIENTE`;
- `client_pj_id String?`, referência a cadastro PJ da mesma organização;
- `client_pf_id String?`, referência a cadastro PF da mesma organização;
- `target_snapshot Json`, snapshot cadastral válido no momento da operação;
- `branch_data Json?`, nulo quando não houver filial concluída;
- relação `checklist_items ProceduralGuidanceChecklistItem[]`.

As referências `client_pj_id` e `client_pf_id` são mutuamente exclusivas e coerentes com `target_type`:

- `PJ`: exatamente `client_pj_id`, sem `client_pf_id`;
- `PF`: exatamente `client_pf_id`, sem `client_pj_id`;
- `SEM_CLIENTE`: ambas nulas e `target_snapshot` deve conter os dados manuais exigidos.

O serviço deve validar essas regras mesmo que o banco não consiga expressar toda a união de tipos em uma constraint. O snapshot deve ser serializável, ter shape versionado e ser tratado como histórico da orientação; atualizar o cadastro de origem não deve reescrever silenciosamente o snapshot.

### 3.2. `ProceduralGuidanceChecklistItem`

Criar uma tabela filha com:

- `id String @id @default(uuid())`;
- `guidance_id String`, com relação para `ProceduralGuidance`;
- `code String`, código estável do item;
- `label String`, rótulo apresentado ao usuário;
- `status String`, limitado a `Pendente`, `Concluído` ou `Não se aplica`;
- `observation String?`;
- `created_at` e `updated_at`.

Criar unicidade em `(guidance_id, code)`. O conjunto canônico desta issue é exatamente o seguinte, na ordem de apresentação:

1. `type` — Tipo de orientação
2. `request` — Solicitação
3. `framework_obs` — Observações de enquadramento
4. `legal_nature` — Natureza jurídica
5. `company_name` — Razão social
6. `trade_name` — Nome fantasia
7. `cpf_cnpj` — CPF/CNPJ
8. `share_capital` — Capital social
9. `iptu` — IPTU
10. `address` — Endereço
11. `comporate_purpose` — Objeto social
12. `carryng` — Porte
13. `regime` — Regime tributário
14. `legal_representative` — Representante legal
15. `economic_activities` — Atividades econômicas
16. `partners` — Sócios
17. `branch` — Filial

Os nomes `comporate_purpose` e `carryng` preservam as chaves legadas existentes, apesar da grafia histórica. A lista deve ser centralizada em uma constante compartilhável entre schema, serviço, migração, OpenAPI e frontend; não deve ser duplicada como listas independentes.

### 3.3. Dados condicionais de filial

`branch_data` terá shape explícito e mínimo, validado por schema, contendo os dados necessários para a filial, por exemplo `name`, `document`, `address`, `city` e `state`. O shape definitivo deve ficar em um schema compartilhado do domínio, e não em `Json` sem validação.

As regras são:

- `branch_data` ausente ou nulo quando `branch.status` for `Pendente` ou `Não se aplica`;
- `branch_data` obrigatório e válido quando `branch.status` for `Concluído`;
- uma atualização que deixe o item `branch` inconcluso deve limpar o dado de filial na mesma transação;
- enviar `branch_data` sem o item `branch` concluído é erro de validação, não uma atualização parcial silenciosa.

### 3.4. Migração e compatibilidade

A migração deve:

1. tornar `process_id` anulável;
2. adicionar os metadados de alvo, snapshot, filial e a tabela filha;
3. criar os 17 itens para cada orientação existente, preservando os valores legados; quando não houver regra segura para inferir conclusão, o item começa como `Pendente`;
4. preencher `target_type`, referências e snapshot a partir de processo/cadastro quando a associação for inequívoca; registros ambíguos devem permanecer migráveis sem inventar vínculo;
5. criar o índice único parcial para orientações em andamento;
6. manter os registros, ids e campos legados existentes.

O índice deve ser equivalente a:

```sql
CREATE UNIQUE INDEX "procedural_guidance_active_process_unique"
ON "regularize.proceduralGuidances" ("organization_id", "process_id")
WHERE "process_id" IS NOT NULL AND "status" = 'Em andamento';
```

Se a base atual tiver colisões, a migração deve reportá-las e a rotina de saneamento deve preservar histórico, sem excluir automaticamente orientações. O serviço também deve tratar a violação de unicidade como conflito de domínio (`409`).

## 4. Fluxo de serviço e transação

### 4.1. Criação

O caso de uso de criação deverá:

1. validar o payload estrito;
2. exigir exatamente um tipo de alvo;
3. buscar o cadastro PJ/PF e o processo na organização autenticada quando ids forem enviados;
4. rejeitar referências inexistentes ou pertencentes a outra organização;
5. construir o `target_snapshot` a partir do cadastro ou dos dados manuais válidos;
6. validar os 17 códigos uma única vez, sem permitir item duplicado, ausente ou desconhecido;
7. criar pai e os 17 itens dentro de uma transação;
8. gravar o log de auditoria usando o mesmo cliente transacional;
9. retornar a orientação completa, incluindo alvo, processo, checklist e filial.

Para `SEM_CLIENTE`, a orientação não depende de processo nem de cadastro, mas o snapshot manual continua obrigatório e validado. Para PJ/PF, o snapshot pode ser derivado do cadastro da organização e complementado somente pelos campos permitidos pelo contrato.

### 4.2. Atualização e vínculo

O update deverá aceitar a alteração dos dados da orientação e do vínculo de processo no mesmo contrato. O processo pode ser:

- associado a uma orientação independente;
- removido, deixando `process_id` nulo;
- trocado por outro processo da mesma organização.

Cada alteração deve validar novamente a organização do processo e aplicar a regra de uma orientação em andamento. O update deverá usar uma transação que:

- carrega a orientação pelo par `id` + `organization_id`;
- valida a versão completa dos 17 itens;
- atualiza pai, checklist e `branch_data` de forma atômica;
- grava um único evento de auditoria com as mudanças relevantes;
- não exclui nem reescreve orientações anteriores.

Os endpoints legados de adicionar/remover atividade e sócio podem continuar existindo para compatibilidade, mas devem atualizar a projeção estruturada correspondente e usar a mesma proteção transacional. O novo formulário deve preferir o update completo quando alterar orientação, checklist e filial em conjunto.

### 4.3. Auditoria e erros

O `RegularizeLogService` deve aceitar o cliente Prisma transacional (por exemplo, por uma interface comum ou tipo de transação compatível), para que pai, itens e log compartilhem a mesma transação.

Erros esperados:

- `404` para orientação, processo ou cadastro não encontrado no escopo da organização;
- `409` para conflito de orientação em andamento no mesmo processo;
- `422` para payload inválido, alvo inconsistente, checklist diferente dos 17 itens ou filial sem conclusão.

Nenhuma mensagem de erro deve revelar ids ou existência de registros de outra organização.

## 5. API e OpenAPI

Manter as rotas atuais de guidance sempre que possível, evoluindo seus contratos:

- `POST /guidance`: aceita processo opcional, alvo e checklist completo;
- `PUT /guidance`: atualiza orientação, vínculo, checklist e filial atomicamente;
- `GET /guidance/detail`: retorna todos os dados estruturados;
- `GET /guidance/list`: aceita `process_id` opcional; sem ele lista orientações permitidas da organização;
- endpoints de atividade/sócio permanecem compatíveis e sincronizam a projeção estruturada.

O schema Zod deve ser estrito e compartilhado com a documentação. O payload de checklist deve conter exatamente 17 itens, com cada código canônico uma vez e status dentro do enum. O contrato deve deixar claro que `process_id` é anulável/opcional e que `branch_data` é condicional.

As rotas continuam protegidas por autenticação e `requireRegularizePermission`. A documentação OpenAPI, os exemplos e o manifesto de smoke devem refletir o contrato final, inclusive a resposta expandida de detalhe/lista e os erros `404`, `409` e `422`.

## 6. Frontend

O `RegularizeGuidanceForm` deve passar a permitir:

- selecionar PJ, PF ou não cliente;
- selecionar processo opcional, sem bloquear criação independente;
- exibir/editar snapshot conforme o tipo de alvo e a permissão;
- renderizar os 17 itens em ordem, com status e observação;
- habilitar os campos de filial somente quando o item `branch` estiver concluído;
- manter as telas legadas de atividades e sócios enquanto a projeção estruturada é introduzida.

A tela deve preservar estados de carregamento, vazio, erro e somente leitura. A lista de orientações não pode depender de um processo selecionado para ser consultável. Os tipos do módulo, contrato de serviço, query keys e hooks devem tratar `process_id` como opcional; a chave de cache deve distinguir filtros por processo e alvo para não misturar resultados.

Ao alterar orientação, o frontend deve enviar uma operação completa para evitar que duas mutações independentes deixem checklist e filial em estados divergentes. Após sucesso, deve invalidar lista, detalhe e consultas dependentes; após erro de conflito ou validação, deve manter o formulário editável e apresentar mensagem acionável.

## 7. Segurança e isolamento

Toda leitura e escrita deve aplicar `organization_id` no serviço, inclusive ao resolver processo, PJ, PF e orientação. Não é suficiente confiar somente no id recebido ou no filtro da rota.

O vínculo de processo e a referência de cadastro não podem atravessar organizações. A autorização de leitura/escrita continua centralizada nas permissões existentes do Regularize. O snapshot não deve incorporar dados de outro tenant, e os logs devem usar o usuário e a organização da requisição.

## 8. Testes e verificação

A implementação seguirá TDD: primeiro serão escritos testes que falham para o contrato desejado, depois o código mínimo para torná-los verdes e então a refatoração.

Cobertura mínima:

- schemas: os três tipos de alvo, snapshot, processo opcional, exatamente 17 itens, status, observação e regra condicional da filial;
- serviço: criação PJ, PF e não cliente, com e sem processo;
- isolamento: rejeição de processo/cadastro de outra organização em criação, vínculo, troca e remoção;
- unicidade: conflito de orientação em andamento, permissão de histórico finalizado e orientação independente;
- checklist: ausência, duplicidade, código desconhecido, status e observação;
- filial: rejeição sem conclusão, limpeza ao voltar para outro status e persistência quando concluída;
- atomicidade: falha em qualquer etapa não deixa pai, item ou log parcial;
- auditoria: criação, update, vínculo e checklist registram alterações;
- rotas/OpenAPI/smoke: contratos, respostas e cobertura de manifest;
- frontend: tipos, query keys, permissões, formulário independente e bloqueio condicional da filial;
- Playwright: fluxo de criação independente, vínculo posterior, edição do checklist e screenshot em `output/playwright`.

As validações finais devem incluir testes escopados do serviço e frontend, lint, typecheck, build quando aplicável, atualização Graphify se o grafo existir, `pnpm smoke:coverage` e uma verificação manual do diff e dos call sites.

## 9. Fora de escopo

- redesenhar o domínio de atividades econômicas ou sócios além da sincronização necessária;
- alterar abas não relacionadas do Regularize;
- remover colunas legadas nesta issue;
- excluir ou consolidar automaticamente orientações históricas;
- criar um fluxo de migração em massa que invente dados ausentes;
- alterar permissões de outros módulos.

## 10. Riscos e decisões pendentes da implementação

- O repositório não contém uma lista oficial separada com os 17 nomes; esta especificação fixa a lista a partir das chaves legadas e do JSON atual. Se a revisão funcional indicar rótulo diferente, deve-se alterar a constante canônica antes dos testes de contrato e da migração.
- O modelo atual usa JSON para atividades e sócios e campos com grafia histórica. A compatibilidade será mantida nesta issue; uma normalização completa deve ser tratada separadamente.
- A implementação deve verificar os nomes reais dos modelos de cadastro PJ/PF e o mecanismo atual de migrações antes de gerar o schema Prisma, sem assumir que os exemplos desta especificação correspondem literalmente aos nomes físicos existentes.
- A unicidade parcial precisa ser validada contra o banco usado nos testes e produção. Se a versão de banco exigir sintaxe específica, o comportamento de domínio permanece obrigatório no serviço e a migração deve documentar a adaptação.
