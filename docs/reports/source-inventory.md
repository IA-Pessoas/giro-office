# Inventário de fontes de relatórios

Este inventário governa o MVP da Central de Relatórios. As chaves internas
servem somente para relações entre fontes: não são campos exportáveis.

| Domínio | Fonte | UI/contrato existente | Módulo | Campos inicialmente reportáveis | Chave interna | Situação | Issue de adaptação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Parcelamento | `parcelamento.installments` | [`/parcelamento/installments`](../../services/parcelamento-service/src/openapi/spec.ts) | `parcelamento` | tipo, jurisdição, débito automático, valores consolidados/parcelas/saldo, contagens, data de adesão, status, conclusão, natureza jurídica e situação de baixa | `client_id`, `installment_id` | Aprovada para MVP | [#811](https://github.com/IA-Pessoas/giro-office/issues/811) |
| Parcelamento | `parcelamento.installment_competencies` | [`/parcelamento/installments/{id}/competencies`](../../services/parcelamento-service/src/openapi/spec.ts) | `parcelamento` | competência, contagens pagas/em atraso, flags de download/envio e valor da parcela | `installment_id` | Aprovada para MVP | [#811](https://github.com/IA-Pessoas/giro-office/issues/811) |
| Parcelamento | `parcelamento.panoramas` | [`/parcelamento/panoramas`](../../services/parcelamento-service/src/openapi/spec.ts) | `parcelamento` | competência e indicadores CND/protesto/situação tributária | `client_id` | Aprovada para MVP | [#811](https://github.com/IA-Pessoas/giro-office/issues/811) |
| Integração | `integracao.clients` | [`/client/integration`](../../services/client-service/src/openapi/spec.ts) | `integracao` | nome empresarial/fantasia, status, regime, porte, segmento, cidade/UF e flags de serviços | `client_id` | Aprovada para MVP | [#812](https://github.com/IA-Pessoas/giro-office/issues/812) |
| Audit | — | [`/audit`](../../services/audit-service/src/app.ts) | `audit` | — | — | Excluída do MVP G1 — logs | — (não aprovada) |
| Certificados | — | [`/certificate`](../../services/certificate-service/src/app.ts) | `certificate` | — | — | Excluída do MVP G1 — anexos | — (não aprovada) |
| Clientes | — | [`/client`](../../services/client-service/src/app.ts) | `client/comercial` | — | — | Candidata pós-G1 — dados pessoais e contrato ainda sem adaptador interno | — (não aprovada) |
| Contábil | — | [`/contabil`](../../services/contabil-service/src/app.ts) | `contabil` | — | — | Candidata pós-G1 — contrato ainda sem adaptador interno | — (não aprovada) |
| Departamentos | — | [`/department`](../../services/department-service/src/app.ts) | `department` | — | — | Candidata pós-G1 — contrato ainda sem adaptador interno | — (não aprovada) |
| Fiscal | — | [`/fiscal`](../../services/fiscal-service/src/app.ts) | `fiscal` | — | — | Candidata pós-G1 — contrato ainda sem adaptador interno | — (não aprovada) |
| Organização | — | [`/organizations`](../../services/organization-service/src/app.ts) | `organization` | — | — | Candidata pós-G1 — agregação sem fronteira de tenant | — (não aprovada) |
| Pessoal | — | [`/pessoal`](../../services/pessoal-service/src/app.ts) | `pessoal` | — | — | Excluída do MVP G1 — dados pessoais e credenciais | — (não aprovada) |
| Projetos e tarefas | — | [`/project`](../../services/project-service/src/app.ts), [`/task`](../../services/task-service/src/app.ts) | `project/task` | — | — | Candidata pós-G1 — contrato ainda sem adaptador interno | — (não aprovada) |
| Regularize | — | [`/regularize`](../../services/regularize-service/src/app.ts) | `regularize` | — | — | Excluída do MVP G1 — credenciais e anexos | — (não aprovada) |
| RH | — | [`/rh`](../../services/rh-service/src/app.ts) | `rh` | — | — | Excluída do MVP G1 — dados pessoais | — (não aprovada) |
| TI | — | [`/ti`](../../services/ti-service/src/app.ts) | `ti` | — | — | Excluída do MVP G1 — credenciais e anexos | — (não aprovada) |
| Usuários e permissões | — | [`/user`](../../services/user-service/src/app.ts), [`/user/permission`](../../services/user-service/src/app.ts) | `user/permission` | — | — | Excluída do MVP G1 — dados pessoais e credenciais | — (não aprovada) |
| Gateway | — | [`/dashboard`](../../services/gateway/src/app.ts) | `gateway/dashboard` | — | — | Excluída do MVP G1 — agregação sem fronteira de tenant | — (não aprovada) |
| Infra compartilhada | — | [Prisma central](../../infra/prisma/schema.prisma) | `infra compartilhada` | — | — | Excluída do MVP G1 — acesso a SQL/tabelas físicas não é contrato | — (não aprovada) |

## Gate G1

Antes de criar uma terceira fonte ou fechar a milestone, é obrigatório ter:

- matriz completa;
- links válidos das issues [#811](https://github.com/IA-Pessoas/giro-office/issues/811) e [#812](https://github.com/IA-Pessoas/giro-office/issues/812);
- exclusões justificadas; e
- ADRs 0001 e 0002 aprovadas.

## Timbrados e identidade visual

Não há timbrado rastreado no workspace. Enquanto não forem confirmados URL HTTPS
estável, SHA-256 verificado e departamento proprietário, o único ativo permitido
é o fallback institucional, sem ativo externo.

## Exclusões explícitas

São proibidos como fontes ou campos reportáveis: credenciais, CPF/CNPJ, URLs de
arquivo, anexos, SQL/tabelas físicas e endpoints públicos genéricos.
