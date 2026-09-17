# Simulação de clientes e dependências de schema — 13/09/2026

**Atualização posterior:** o subconjunto de 12 PF abaixo foi aprovado, ensaiado e
[carregado em 14/09/2026](./CARGA-PF-12-2026-09-14.md), com confirmação posterior.
Não repetir sua preparação/carga. Este relatório preserva os números e bloqueios do
retrato de simulação de 13/09; não representa pendência atual desses 12 registros.

Etapa autorizada após a revisão de prioridade: validar os candidatos iniciais e as ocorrências
pendentes, preparar uma simulação sem gravação e identificar quais migrations se relacionam
com cada lote. Nenhum dado foi inserido, atualizado, excluído ou fundido; nenhum DDL ou
comando Docker foi executado nesta etapa. O patch de acesso continua apenas proposto.

## Resultado para decisão

As **5.071 origens de clientes** receberam diagnóstico de campos e contribuições. Foram
simulados os **556 candidatos iniciais**, revisadas as **182 ocorrências pendentes** e
recorroboradas por documento/nome/identidade as **4.333 correspondências** anteriores, que
apontam para **3.797 destinos distintos por tabela/ID**. Não houve promoção de identidade.

**Zero registros estão liberados para carga.** Um subconjunto de **13 PF** tem apenas
pendências de datas e, em um caso, telefone, entre os problemas de conteúdo detectados pelos
validadores. Os demais requisitos de correspondência, histórico de exclusão, revisão final do
payload, ensaio, recuperação e autorização continuam obrigatórios.

Há uma proposta privada de **12 PF** para a próxima revisão, mantendo fora o caso com telefone
sem destino. Esse recorte não depende diretamente de nenhuma das dez migrations pendentes.
Preparar a proposta não autoriza carga nem criação de ambiente de ensaio.

## Conteúdo validado

O ZIP foi lido pelo parser SQL existente, sem executar seus comandos. Seu SHA-256 confere
com a origem da reconciliação anterior. Os perfis guardam chaves, hashes de valores, estados
e motivos; não contêm nomes, documentos ou contatos legíveis.

| Origem | Linhas examinadas | Papel nesta análise |
| --- | ---: | --- |
| `tb_integracao.clientes` | 2.420 | Cadastro e tipo/modalidade |
| `tb_regularize.clientes` | 1.343 | Código próprio, vínculo Integração e faceta Regularize |
| `tb_regularize.pf` | 1.308 | Cadastro PF separado de `clients.type = PF` |
| `tb_integracao.prospeccao_comercial` | 2.422 | Situação, descrição, datas e composição do cliente |
| `tb_mkt.redes_sociais` | 205 | Confronto de Instagram pelo código Regularize; exclusão histórica preservada |
| `tb_regularize.vencimento` | 181 | Contribuições de datas de RG/CNH pelo código PF |
| `tb_integracao.grupos` | 192 | Existência do grupo referido na origem; destino do vínculo não aprovado |

As quatro origens auxiliares não são novas entidades de cliente somadas às 5.071.
Os 79 campos escalares de `clients`/`clients.pf` do Prisma foram encontrados no banco,
sem diferença de nulabilidade nesse recorte. Os contratos de cadastro e a composição
C00/C01 complementam essa verificação física: coluna existente não significa dado válido.

| Origem dos candidatos | Candidatos iniciais | Constatações |
| --- | ---: | --- |
| Integração | 67 | Todos têm prospecção associada e ao menos uma data inválida; nove não têm modalidade resolvida. |
| Regularize | 1 | Faltam tipo, modalidade, situação de prospecção e data de cadastro comercial. Competência e datas exigem convenção. |
| PF | 488 | 469 têm ao menos um campo obrigatório sem valor utilizável; 19 não têm essa lacuna, mas ainda exigem as demais verificações. |

Entre os PF: 305 não têm profissão utilizável, 295 não têm RG, 253 não têm pai,
218 não têm mãe e 161 não têm estado civil resolvido. Esses grupos **se sobrepõem**.
Foram detectados 93 nascimentos inválidos e sete documentos com comprimento incompatível
com CPF. A triagem anterior aceitava documento válido de 11 ou 14 dígitos; o contrato de
`clients.pf` exige especificamente CPF. Não converter CNPJ em CPF nem inferir outra entidade.

As datas inválidas de Integração incluem `inicio_contrato` em 64 candidatos,
`data_fechamento` da prospecção em 65 e `dataAbertura` em seis, também com sobreposição.
Pela G02 vigente, datas zero ou inválidas permanecem bloqueadas, inclusive quando o campo
destino é opcional. Não foram convertidas em nulo.

O subconjunto de 13 PF passou pelos controles de lacunas, campos inválidos, conflitos de
contribuições e colisões implementados. Todos ainda têm convenção de data pendente;
um também tem telefone sem campo correspondente no destino. Ausência de impedimento
nesses controles não comprova revisão humana integral de texto livre ou histórico de exclusão.

## Duplicidades e referências

As verificações consideram documento, código, RG, nomes/razão social/nome fantasia e
e-mail, com os valores recebidos de todas as contribuições. Foram comparados candidatos
entre si, com as demais origens e com o destino. Campos coincidentes não autorizam merge.

| Verificação | Resultado |
| --- | --- |
| Documentos repetidos em `clients` no destino | 431 grupos, 882 registros; situação anterior confirmada |
| CPF, RG e código em `clients.pf` no destino | Zero grupos repetidos nas chaves normalizadas consultadas |
| Documentos repetidos envolvendo candidatos novos | Zero colisões nas chaves verificadas no mesmo papel/tabela |
| RG entre candidatos PF | Um grupo com dois candidatos; ambos bloqueados |
| E-mail envolvendo candidatos a `clients` | 21 candidatos com indício de repetição na união de origens/destino |
| Nomes/aliases entre candidatos a `clients` | Dois grupos envolvendo quatro candidatos |
| União dos candidatos com colisão ou indício | 25 candidatos; não somar as linhas anteriores |
| IDs V4 propostos ocupados em qualquer organização | Zero em ambas as tabelas |

Nome ou e-mail compartilhado pode ser legítimo. O relatório registra evidência para decisão,
sem afirmar que esses registros devam ser fundidos. A ausência de índice único físico de
documento/RG/código exige que o futuro executor faça esses controles: nas duas tabelas, a
inspeção encontrou somente a PK por ID. O serviço PF também impede código, CPF ou RG repetido.
Não foram encontrados triggers de usuário nessas duas tabelas; os serviços continuam tendo
efeitos operacionais próprios, que não foram executados.

As 182 pendências iniciais permanecem individualizadas: **28 identidades ambíguas,
31 existentes divergentes e 123 referências pendentes**. Para 144 origens havia alvo a
comparar; foram feitas 228 comparações com 217 registros distintos do destino. As outras
38 não tinham alvo nas estratégias verificadas. Coincidência de outros campos não resolveu
automaticamente divergência de documento, multiplicidade ou vínculo.

As 4.333 correspondências foram recorroboradas por identidade, documento e algum nome,
sem mudança dessa conclusão no retrato consultado. **Não se declarou igualdade integral
do payload dessas correspondências.** Todo registro existente continua preservado, mesmo
quando as contribuições do legado diferem. Os vínculos de projetos, controles e demais
dependentes já levantados no relatório anterior continuam sem alterações.

## Dependências reais das migrations

O inventário foi recontado: **312 origens, 133 etapas e 72 destinos V4**. As 72 tabelas foram
reencontradas no banco em consulta somente leitura. As dez migrations continuam sem conclusão
no histórico e suas nove tabelas novas continuam ausentes.

Nenhuma dessas nove tabelas novas pertence aos 72 destinos da fotografia V4. Apenas um
destino V4, `integracao.tasks`, é diretamente alterado pelos dez SQLs. Isso permite continuar
a análise, mas não libera cargas nas outras tabelas nem autoriza pular a ordem do Prisma.

| Migration | Relação com os lotes |
| --- | --- |
| `20260906004000_task_responsible_nullable` | Condicional para tarefa com responsável legitimamente ausente. Não libera FK preenchida sem correspondência nem altera responsável obrigatório do modelo. |
| `20260906194000_enforce_active_task_model_uniqueness` | Restrição de tarefas ativas. Conferir existentes e candidatos antes de qualquer carga de tarefas, mesmo sem aplicar o índice. |
| `20260907120000_add_project_wizard_confirmations` | Estrutura operacional; não fabricar confirmações para projetos históricos. |
| `20260909120000_report_snapshot_blocks` | Estrutura de relatórios; não é destino do inventário V4. |
| `20260909130000_proposal_config_name_uniqueness` | Restrição de eventual C03, ainda sem transformação completa aprovada. |
| `20260910120000_commercial_prospecting` | Necessária se for aprovada a emissão da nova entidade C01. A faceta em `clients` e o projeto são representações distintas. |
| `20260910150000_proposal_config_contract_value` | Necessária para contrato que usa `contract_value`; rename e equivalência monetária continuam sujeitos à compatibilidade e decisão. |
| `20260910170000_commercial_outbox_projection` | Estruturas operacionais; não preencher filas nem reproduzir eventos históricos. |
| `20260910180000_commercial_task_billing` | Necessária se for aprovada cobrança histórica C02. A tabela de eventos associada permanece fora da carga. FK local já corrigida anteriormente. |
| `20260910190000_commercial_email_notifications_and_close_events` | Estruturas operacionais; não criar notificações ou fechamentos históricos. |

`clients`, `clients.pf`, contribuições Regularize, Instagram e validades PF não têm dependência
física direta desses dez DDLs. Prospecção e cobrança novas exigem decisões próprias.
As sete outras tabelas novas são de operação/relatórios e não devem receber histórico neste escopo.

A matriz privada cobre as 133 etapas estruturalmente: oito são cadastros/contribuições
tratados nesta análise, três são etapas explicitamente PEC/Triagem e 122 ainda não foram
simuladas por registro nesta etapa. Outras referências PEC/Triagem em domínios diferentes
também permanecem excluídas. As 209 origens sem etapas confirmadas não foram convertidas
em lotes prontos. A divergência RH de `assigned_to_user_id` continua fora desses dez DDLs.

## Próxima decisão delimitada

**Atualização posterior:** o usuário aprovou a convenção abaixo somente para os 12 PF.
O payload local, a validação pelo contrato real e as pendências de ensaio estão no
[relatório de preparação](./PREPARACAO-PF-12-2026-09-13.md). As classificações e os números
desta simulação foram preservados como fotografia anterior à aprovação da regra de datas.

Proposta para **datas civis válidas dos 12 PF**: preservar exatamente o dia do legado,
representando-o tecnicamente como `YYYY-MM-DDT00:00:00.000Z`, sem deslocar o dia por fuso.
Isso não inventa horário de nascimento; meia-noite seria apenas convenção de armazenamento.
O frontend atual exibe datas por `toISOString().slice(0, 10)`, o que sustenta essa proposta,
que precisa de aprovação e ensaio. Datas inválidas continuam em quarentena.

O caso adicional com telefone exige decidir onde preservar esse campo antes de incluí-lo.
Para os demais PF, qualquer flexibilização de campos obrigatórios constitui nova decisão
de contrato; preencher asteriscos, textos artificiais ou datas substitutas continua proibido.
As regras de modalidade, prospecção e datas dos clientes Integração/Regularize também
precisam ser resolvidas antes de promover seus candidatos.

Depois da aprovação das regras, preparar o payload exato e fechar correspondência, exclusões,
revisão de conteúdo, ensaio isolado e backup/restauração. A aprovação de uma convenção de
data não autoriza DDL, Docker, atualizações de existentes ou INSERT em produção.

## Evidências e verificações

- 20 testes sintéticos aprovados, incluindo DV/tipo de documento, datas reais/zero/futuras,
  composição sem defaults artificiais, colisões de contribuições, distinção de papéis e preservação.
- Reprodução local dos resultados sobre os mesmos insumos, sem consulta ou escrita no banco.
- Revisão independente dos scripts concluída; os quatro achados foram corrigidos e conferidos.
- `git diff --check` e conferência do diff SQL: somente a FK autorizada anteriormente está alterada.
- Capturas PostgreSQL em transações `REPEATABLE READ READ ONLY`, com timeout e `ROLLBACK`.
  As páginas não compõem um snapshot global único; renovar as verificações antes de futura carga.
- Artefatos privados em `dry-run/`, ignorados pelo Git, arquivos `0600` e diretórios `0700`.
  O ZIP original permanece no local informado e não deve ser adicionado ao Git.

Arquivos privados principais: `lotes-2026-09-13.json`, `revisao-182-clientes.jsonl`,
`validacao-clientes-por-registro.jsonl`, `duplicidades-candidatos-clientes.json`,
`matriz-dependencias-schema.json`, `proposta-pf-12-sem-gravacao.json` e
`verificacao-reproducibilidade.json`. A simulação contém `operations: []`, com todas
as aprovações nulas e `eligible_for_load: false`.

Referências: [mapeamento](./MAPEAMENTO.md), [plano](../../superpowers/plans/2026-09-13-migracao-legado-clientes-schema.md),
[reconciliação inicial](./EXECUCAO-CLIENTES-SCHEMA-2026-09-13.md),
[proposta de acesso](./COMPATIBILIDADE-ACESSO-2026-09-13.md),
[schema PF](../../../infra/prisma/schema.prisma),
[contrato PF](../../../services/regularize-service/src/schemas/clientPf.schemas.ts),
[unicidade PF](../../../services/regularize-service/src/services/clientPfService.ts) e
[datas na UI](../../../app/src/modules/regularize/utils/regularizeForm.ts).
