# Inventário de Fontes da Central de Relatórios

Data da descoberta: 2026-08-19

## Critério de decisão

- **Aprovada**: dado estruturado já visível no Office por tela e contrato público, com isolamento
  por `organization_id` comprovado no modelo. A primeira versão publica somente campos de negócio
  listados nesta matriz; IDs entram exclusivamente como chaves internas de relação.
- **Excluída**: dado sem função de relatório inicial, infraestrutura, credencial, arquivo, campo
  livre sensível ou dado pessoal identificável. Nova proposta exige classificação do dado,
  autorização explícita de catálogo e testes próprios.
- `Issue de adaptação` descreve a issue que deve existir na milestone. Onde ainda não há número,
  o título já é o título obrigatório para abertura. Gate G1 só fecha depois de substituir esses
  textos por número e link reais.

Todos os adaptadores devem consultar somente a própria fonte, filtrar sempre por
`organization_id`, aceitar apenas projeção/filtros publicados e validar o grant assinado do
`reports-service`. Nenhuma fonte abaixo autoriza SQL, tabela física ou ID interno no navegador.

## Fontes iniciais já definidas

| Domínio | Fonte | UI/contrato existente | Módulo | Campos inicialmente reportáveis | Chave interna | Situação | Issue de adaptação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Parcelamento | `parcelamento.installments` | `/parcelamento`; `GET /parcelamento/installments` | `parcelamento` | tipo, esfera, débito automático, valores, quantidades de parcelas, datas de adesão/conclusão, natureza jurídica, situação, número de acordo | `client_id` | aprovada | [#811](https://github.com/IA-Pessoas/giro-office/issues/811) |
| Parcelamento | `parcelamento.installment_competencies` | `/parcelamento`; `GET /parcelamento/installments/:id/competencies` | `parcelamento` | competência, parcelas pagas/em atraso, download/upload/envio, tipo de envio, valor e observação operacional | `installment_id` | aprovada | [#811](https://github.com/IA-Pessoas/giro-office/issues/811) |
| Parcelamento | `parcelamento.panoramas` | `/parcelamento`; `GET /parcelamento/panoramas` | `parcelamento` | competência, certidões, protestos e situações fiscal/tributária | `client_id` | aprovada | [#811](https://github.com/IA-Pessoas/giro-office/issues/811) |
| Integração | `integracao.clients` | `/clients`, `/clients/[id]/integration`; `GET /client` | `integracao` | nome, razão social, nome fantasia, tipo, status, cidade, estado, datas de cliente/competência/abertura, contrato, status e data de prospecção | `client_id` | aprovada | [#812](https://github.com/IA-Pessoas/giro-office/issues/812) |

Não publicar nestas fontes `document_url`, e-mail, endereço, CPF/CNPJ bruto ou normalizado,
CPF de responsável/agente, URLs, arquivos, tokens ou IDs.

## Fontes aprovadas para sub-issues dinâmicas

| Domínio | Fonte | UI/contrato existente | Módulo | Campos inicialmente reportáveis | Chave interna | Situação | Issue de adaptação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Projetos | `projetos.projects` | `/projects`, `/projects/[id]`; `GET /project` | `integracao` | nome, status, início, término, objetivo e percentual de progresso | `client_id`, `sponsor_id` | aprovada | [#832](https://github.com/IA-Pessoas/giro-office/issues/832) |
| Tarefas | `tarefas.tasks` | `/tasks`; `GET /task` | `integracao` | nome, status, departamento, cobrança, urgência, datas, pendência de aprovação e flags comercial/financeira | `project_id`, `client_id`, `model_id`, responsáveis | aprovada | [#833](https://github.com/IA-Pessoas/giro-office/issues/833) |
| Contábil | `contabil.control` | `/contabil`, `/clients/[id]/contabil`; `GET /contabil/control` | `contabil` | competência e indicadores de execução/conciliação/fechamento contábil | `client_id` | aprovada | [#834](https://github.com/IA-Pessoas/giro-office/issues/834) |
| Contábil | `contabil.responsibles` | `/contabil`, `/clients/[id]/contabil`; `GET /contabil/responsibles` | `contabil` | indicador de cliente com movimento | `client_id`, usuários responsável/publicador | aprovada | [#835](https://github.com/IA-Pessoas/giro-office/issues/835) |
| Contábil | `contabil.relationship` | `/contabil`, `/clients/[id]/contabil`; `GET /contabil/relationship` | `contabil` | licitação, plano de contas, ferramenta e sistema | `client_id` | aprovada | [#836](https://github.com/IA-Pessoas/giro-office/issues/836) |
| Certificados | `certificado.pj` | `/certificados`; `GET /certificate/pj` | `certificado` | nome, modelo, natureza jurídica, vencimento, existência, pagamento, data e valor pagos | sem relação publicada nesta fase | aprovada | [#837](https://github.com/IA-Pessoas/giro-office/issues/837) |
| Certificados | `certificado.pf` | `/certificados`; `GET /certificate/pf` | `certificado` | nome, modelo, empresa, vencimento, existência, pagamento, data e valor pagos | sem relação publicada nesta fase | aprovada | [#838](https://github.com/IA-Pessoas/giro-office/issues/838) |
| Fiscal | `fiscal.ncm` | `/fiscal`; `GET /fiscal/ncm` | `fiscal` | regime tributário, código NCM, tributação federal, classificação PIS/COFINS, grupo, descrição e vigências | sem relação publicada nesta fase | aprovada | [#839](https://github.com/IA-Pessoas/giro-office/issues/839) |
| Fiscal | `fiscal.icms` | `/fiscal`; `GET /fiscal/icms` | `fiscal` | UF, NCM, CST, alíquota, redução, MVA, base, FCP e vigências | sem relação publicada nesta fase | aprovada | [#840](https://github.com/IA-Pessoas/giro-office/issues/840) |
| Fiscal | `fiscal.ipi` | `/fiscal`; `GET /fiscal/ipi` | `fiscal` | NCM, CST, alíquota, enquadramento legal e vigências | sem relação publicada nesta fase | aprovada | [#841](https://github.com/IA-Pessoas/giro-office/issues/841) |
| Departamento Pessoal | `pessoal.ldd` | `/departamento-pessoal`; `GET /pessoal/ldd` | `pessoal` | tipo, período, vencimento, saldo, situação cadastral e status | `client_id` | aprovada | [#842](https://github.com/IA-Pessoas/giro-office/issues/842) |
| Departamento Pessoal | `pessoal.payroll` | `/departamento-pessoal`; `GET /pessoal/payroll` | `pessoal` | adiantamento, tipo/valor, envio, grupo, benefícios, obrigações e quantidade de empregados | `client_id`, responsável, sindicato | aprovada | [#843](https://github.com/IA-Pessoas/giro-office/issues/843) |
| Departamento Pessoal | `pessoal.obligations` | `/departamento-pessoal`; `GET /pessoal/obrigations` | `pessoal` | competência e indicadores de adiantamento, folha, encargos, benefícios e obrigações | `client_id`, responsável | aprovada | [#844](https://github.com/IA-Pessoas/giro-office/issues/844) |
| Departamento Pessoal | `pessoal.situations` | `/departamento-pessoal`; `GET /pessoal/situations` | `pessoal` | status, título, datas de registro/conclusão | `client_id`, usuários registrador/conclusor | aprovada | [#845](https://github.com/IA-Pessoas/giro-office/issues/845) |
| Departamento Pessoal | `pessoal.unions` | `/departamento-pessoal`; `GET /pessoal/unions` | `pessoal` | nome e data-base | sem relação publicada nesta fase | aprovada | [#846](https://github.com/IA-Pessoas/giro-office/issues/846) |
| Regularize | `regularize.licenses` | `/regularize`, `/clients/[id]/regularize`; `GET /regularize/licenses` | `regularize` | possui, tipo, protocolo, status, situação atual, urgência e datas | `client_id`, responsáveis, `task_id` | aprovada | [#847](https://github.com/IA-Pessoas/giro-office/issues/847) |
| Regularize | `regularize.processes` | `/regularize`; `GET /regularize/processes` | `regularize` | tipo, datas de entrada/conclusão/previsão, status, bloqueio e urgência | clientes, responsáveis e `task_id` | aprovada | [#848](https://github.com/IA-Pessoas/giro-office/issues/848) |
| Regularize | `regularize.municipal_taxes` | `/regularize`; `GET /regularize/municipal-taxes` | `regularize` | ano, aplicabilidade, valores, análise, envio e vencimento de TFF, TLP e TLL | `client_id` | aprovada | [#849](https://github.com/IA-Pessoas/giro-office/issues/849) |
| RH | `rh.requests` | `/rh`; `GET /rh/requests` | `rh` | título, categoria, urgência, status e datas de criação/atualização | solicitante e responsável | aprovada | [#850](https://github.com/IA-Pessoas/giro-office/issues/850) |
| RH | `rh.attendance` | `/rh`, `/rh/timesheets/[id]`; `GET /rh/point`, `/rh/timesheets`, `/rh/time-bank-releases`, `/rh/time-clock-requests` | `rh` | datas/horários, carga, saldo, minutos, aprovação e status | usuário, apontamento, aprovador | aprovada | [#851](https://github.com/IA-Pessoas/giro-office/issues/851) |
| RH | `rh.holidays` | `/rh`; `GET /rh/holidays` | `rh` | nome e data | sem relação publicada nesta fase | aprovada | [#852](https://github.com/IA-Pessoas/giro-office/issues/852) |
| Tecnologia | `ti.inventory` | `/tecnologia`; `GET /ti/inventory` | `ti` | código patrimonial, categoria, localização, datas de entrega/devolução e observação não sensível | usuário, localização, categoria e responsável de TI | aprovada | [#853](https://github.com/IA-Pessoas/giro-office/issues/853) |
| Tecnologia | `ti.stock` | `/tecnologia`; `GET /ti/stock` | `ti` | nome, categoria, localização, quantidade, descrição e status | departamento, categoria e localização | aprovada | [#854](https://github.com/IA-Pessoas/giro-office/issues/854) |
| Tecnologia | `ti.requests` | `/tecnologia`; `GET /ti/requests` | `ti` | título, categoria, urgência, status e datas de criação/atualização | solicitante e responsável | aprovada | [#855](https://github.com/IA-Pessoas/giro-office/issues/855) |
| Tecnologia | `ti.extensions` | `/tecnologia`; `GET /ti/extensions` | `ti` | ramal e datas de criação/atualização | usuário | aprovada | [#856](https://github.com/IA-Pessoas/giro-office/issues/856) |

## Fontes excluídas da primeira versão

| Domínio/serviço | Fonte ou dado analisado | UI/contrato existente | Situação | Justificativa |
| --- | --- | --- | --- | --- |
| Clientes | `ClientHistory`, pendências e anexos de histórico | `/clients/[id]/histories`; `GET /client/:id/histories` | excluída | Texto livre, anexos e trilha de atendimento exigem classificação e política de conteúdo antes de catálogo. |
| Certificados | senhas, CPF/CNPJ, contato, arquivos, paths, hashes e metadados de criptografia | `/certificados`; `/certificate/pj`, `/certificate/pf` | excluída | Credenciais, identificadores pessoais e material de certificado não podem entrar em snapshot ou exportação. |
| Departamento Pessoal | `pessoal.passwords`, contatos e observações livres | `/departamento-pessoal`; `/pessoal/passwords` | excluída | Credenciais e conteúdo potencialmente pessoal/sensível. |
| Regularize | senhas de site, credenciais, CPF/CNPJ, endereço, representantes, sócios, documentos e texto livre de guidance | `/regularize`; rotas `passwords`, `site-passwords`, `guidances`, `partners` | excluída | Credenciais, documentos e dados pessoais/empresariais sensíveis sem classificação de catálogo. |
| RH | avaliações, nitro, mensagens, anexos, assinaturas e conteúdo detalhado de justificativas | `/rh`; rotas `score`, `messages`, `point`, `time-clock-requests` | excluída | Dado pessoal sensível, avaliação de desempenho ou conteúdo livre. `rh.attendance` publica somente dados estruturados listados acima. |
| Tecnologia | senhas, termos, CPF, endereço, IMEI, anexos, robôs e execuções | `/tecnologia`; rotas `passwords`, `terms`, `robots` | excluída | Credenciais, identificadores pessoais, ativos sensíveis e dados de infraestrutura. |
| Usuários, departamentos e organizações | identidade, permissões e configuração administrativa | `/users`, `/departments`, `/administracao`; `/user`, `/department`, `/organizations` | excluída | São contexto de autorização/governança, não fontes de negócio. Relações usam contratos internos dedicados; não expor catálogo de identidade. |
| Audit e gateway | requests, logs, upstreams e auditoria técnica | LogDrawer, `/audit`, gateway | excluída | Telemetria e trilha de segurança não são fonte de relatório de negócio. |
| Comercial, Financeiro, Marketing e Triagem | módulos sem serviço de domínio ativo independente | rotas de cliente/configuração; `DISABLED_MODULE_KEYS` para Marketing e Triagem | excluída | Não há contrato de fonte estruturada autônoma confirmado. Reabrir descoberta quando serviço e contrato público próprios existirem. |

## Timbrados e identidade visual

Não há timbrado rastreado no workspace. Enquanto não forem confirmados URL HTTPS estável,
SHA-256 verificado e departamento proprietário, a única opção permitida é o fallback
institucional; nenhum ativo externo será inventado ou incorporado ao catálogo.

## Relações aprovadas nesta descoberta

Relações só serão publicadas quando ambos os adaptadores filtrarem por organização e retornarem a
chave apenas em `keys`. Nesta fase, além das relações iniciais do plano, ficam pré-aprovadas para
validação técnica nas respectivas issues:

| Esquerda | Direita | Cardinalidade esperada | Join permitido |
| --- | --- | --- | --- |
| `projetos.projects.client_id` | `integracao.clients.client_id` | 1 cliente : N projetos | Inner, Left |
| `tarefas.tasks.client_id` | `integracao.clients.client_id` | 1 cliente : N tarefas | Inner, Left |
| `tarefas.tasks.project_id` | `projetos.projects.project_id` | 1 projeto : N tarefas | Inner, Left |
| `contabil.*.client_id` | `integracao.clients.client_id` | 1 cliente : N registros | Inner, Left |
| `pessoal.{ldd,payroll,obligations,situations}.client_id` | `integracao.clients.client_id` | 1 cliente : N registros | Inner, Left |
| `regularize.{licenses,municipal-taxes}.client_id` | `integracao.clients.client_id` | 1 cliente : N registros | Inner, Left |

As relações que dependem de usuário, departamento, responsável, cliente PF, assinatura ou conteúdo
sensível permanecem fora do catálogo até haver fonte de identidade/classificação explicitamente
aprovada. Right, Full e produto cartesiano continuam proibidos.

## Saída exigida para Gate G1

- [x] Criar na milestone uma issue concreta para cada linha aprovada sem número/link.
- [x] Vincular cada issue ao epic de Catálogo e fontes e registrar a dependência `4.2`.
- [x] Substituir os títulos provisórios da coluna `Issue de adaptação` por número e link.
- [x] Registrar fontes excluídas e justificativas baseadas em UI, contrato e classificação de dado.
- [x] Manter Parcelamento e Integração como únicas fontes iniciais de implementação.

### Evidências consultadas

- `app/src/shared/components/newLayout/AppShell.tsx`
- `app/src/modules/auth/utils/moduleAccess.ts`
- `app/src/pages/{certificados,parcelamento,regularize,rh,fiscal,contabil,departamento-pessoal,tecnologia}.tsx`
- `app/src/pages/{clients,projects,tasks}/`
- `services/*/src/app.ts`
- `infra/prisma/schema.prisma`
