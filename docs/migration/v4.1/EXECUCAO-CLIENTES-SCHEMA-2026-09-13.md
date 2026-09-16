# Reconciliação de clientes e pré-verificação de schema — 13/09/2026

Execução inicial do [plano aprovado](../../superpowers/plans/2026-09-13-migracao-legado-clientes-schema.md), após a autorização “pode fazer”. O trabalho avançou até a preparação das correspondências e das evidências para os pontos de aprovação. Não houve carga, alteração de registros, aplicação de migration ou atualização de Docker.

## Resultado da reconciliação

Foram classificadas 5.071 linhas de três origens do ZIP recebido. São correspondências propostas, ainda sem aprovação de uso na carga. A análise confrontou estratégias históricas de identidade, documentos, nomes e vínculos explícitos; não comparou integralmente os payloads.

| Origem | Correspondência corroborada | Candidato novo | Ambiguidade | Divergência | Referência pendente | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `tb_integracao.clientes` | 2.216 | 67 | 14 | 23 | 100 | 2.420 |
| `tb_regularize.clientes` | 1.309 | 1 | 10 | 8 | 15 | 1.343 |
| `tb_regularize.pf` | 808 | 488 | 4 | 0 | 8 | 1.308 |
| **Total** | **4.333** | **556** | **28** | **31** | **123** | **5.071** |

As 4.333 correspondências corroboradas apontam para 3.797 IDs distintos de destino: uma mesma entidade pode ter mais de uma origem. Não são 4.333 entidades novas ou equivalências integrais de conteúdo. Os 556 candidatos novos exigem revisão de elegibilidade, exclusões anteriores, referências e payload antes de qualquer proposta de carga. Os outros 182 casos permanecem bloqueados para decisão ou complementação da evidência.

Um ID histórico localizado precisa de documento válido coincidente e nome correspondente para receber a classificação de correspondência corroborada. Documento/nome sem identidade histórica localizada não autoriza associação. Identidades históricas que apontam para destinos distintos ficam ambíguas. Todas as linhas foram gravadas com `approval=null`, `approved_destination_id=null` e `eligible_for_load=false`.

Foram sondados IDs V4 usuais e, em clientes PJ, os IDs V2 textuais por chave de Integração/Regularize; não houve correspondência adicional nessa sondagem V2. A estratégia V2 de PF derivado de sócio exige sua própria origem e não foi aplicada artificialmente à chave de `tb_regularize.pf`.

## Duplicidades existentes e vínculos

- Mantidos os **431 grupos de documento repetido, com 882 cadastros**, em `clients` da organização analisada.
- Em **204 grupos**, mais de um cadastro do grupo já tem referências em outras tabelas. Nenhum cliente principal foi eleito e nenhum vínculo foi movido.
- Em 360 grupos há ao menos um cadastro referenciado; 572 dos 882 cadastros têm referências verificadas.
- Foram consultadas 27 relações declaradas por FK, incluindo projetos, tarefas e controles: 6.089 agrupamentos por pai/coluna, somando 20.797 referências. Esse total não representa linhas filhas distintas quando uma linha possui mais de uma FK.
- Não houve referência com organização diferente ou nula nas relações consultadas que possuem `organization_id`. Onde a tabela filha não possui essa coluna, a identidade do pai foi conferida, sem alegar uma validação direta de tenant da filha.
- Quatro relações de PEC/Triagem ficaram fora da consulta de dados. Referências lógicas sem FK ainda dependem da expansão da análise do respectivo domínio.

Os relatórios por grupo contêm IDs e contagens de vínculos em acervo privado. Coincidência de documento ou nome não equivale a autorização de fusão.

## Validação de documentos

Além do formato, foram conferidos os dois dígitos verificadores de documentos numéricos. Caracteres não numéricos além da pontuação/espaços não foram removidos para forçar validação: esses casos ficaram pendentes. Isso não é consulta de situação cadastral nem prova de titularidade.

| Conjunto | Válidos no cálculo | DV inválido | Ausente/formato/caracteres/repetição de dígitos | Total |
| --- | ---: | ---: | ---: | ---: |
| Origem Integração | 2.319 | 7 | 94 | 2.420 |
| Origem Regularize clientes | 1.338 | 3 | 2 | 1.343 |
| Origem Regularize PF | 1.300 | 3 | 5 | 1.308 |
| Destino `clients` | 2.999 | 8 | 93 | 3.100 |
| Destino `clients.pf` | 808 | 1 | 1 | 810 |

As normalizações e comparações ocorreram em memória. Nenhum documento ou nome foi corrigido no export ou no banco.

## Pré-verificação das dez migrations

As dez pendências listadas no plano permanecem sem aplicação. O catálogo atual confirma as nove tabelas e duas colunas esperadas ainda ausentes.

| Verificação | Resultado |
| --- | --- |
| Tarefas ativas, chave exata da migration de unicidade, todas as organizações | Zero grupos repetidos |
| Configurações de proposta, organização/nome literal, todas as organizações | Zero grupos repetidos |
| Histórico de migrations | 128 concluídas, dois registros históricos revertidos, nenhuma pendência de execução sem reversão identificada |
| Checksums de migrations concluídas | 39 iguais byte a byte; 89 conferem com CRLF; nenhuma diferença restante sem explicação |
| Arquivos locais de migrations | Após aprovação específica, somente a referência da FK comercial foi corrigida; os demais arquivos foram preservados |
| Correção comercial local | Patch aprovado e aplicado: somente `organization` passou a `organizations`; diff exato e FK de tarefas conferidos |
| Backup/restauração do destino e ensaio de DDL | Ainda não executados |

O patch está em [preflight/proposta-fk-commercial-task-billing.patch](./preflight/proposta-fk-commercial-task-billing.patch). Após o usuário aprovar especificamente sua aplicação local, ele foi aplicado ao arquivo da migration. A conferência contra o commit confirmou exatamente uma substituição, preservando a FK de tarefas e suas ações referenciais. Essa validação local não equivale a um ensaio SQL no PostgreSQL; nenhuma migration foi executada no banco.

### Compatibilidade com o sistema em execução

Uma inspeção somente leitura confirmou a referência ao projeto Supabase do mapeamento nas variáveis de conexão dos containers de clientes, tarefas, projetos e relatórios. Apesar do nome `teste-workspace` no Supabase, esse projeto é referenciado pelos serviços de produção inspecionados.

Os três containers consultados internamente — clientes, tarefas e projetos — contêm `minimum_wage` e não `contract_value` no Prisma gerado. Suas imagens não informam a revisão Git no label consultado. A inspeção não demonstra, sozinha, que uma rota ativa consulta essa coluna, mas confirma que os artefatos gerados não estão alinhados ao rename proposto. Não liberar essa migration sem validar os consumidores reais e a estratégia de compatibilidade, preservando a restrição atual de não atualizar Docker.

### Acesso às tabelas

Na inspeção de sete tabelas existentes afetadas ou referenciadas, `clients`, `clients.pf`, `integracao.projects`, `integracao.tasks`, `proposal.config` e `reports.snapshot_rows` estavam com RLS desativada e privilégios de SELECT/INSERT para `anon` e `authenticated`. `organizations` estava com RLS ativada e forçada. Também existem privilégios padrão de tabelas para esses papéis.

O diagnóstico não verificou a exposição efetiva dessas tabelas pela Data API nem modificou grants/políticas. As migrations de novas tabelas não incluem políticas RLS; é necessário definir e verificar o acesso efetivo e o isolamento antes de aplicá-las. Não habilitar RLS nem revogar privilégios indiscriminadamente, pois isso também exige conferir os consumidores.

## Artefatos e verificação

- [Correspondência privada por origem/chave](./crosswalk/clientes-2026-09-13.jsonl).
- [Resumo estruturado da reconciliação](./reports/reconciliacao-clientes-2026-09-13.json).
- [Grupos de duplicidade e referências](./reports/duplicidades-clientes-2026-09-13.json).
- [Diagnóstico privado de schema](./preflight/schema-2026-09-13.json).
- [Snapshot com identificadores e fingerprints para reprodução](./reports/reconciliacao-clientes-input-2026-09-13.json).
- [Verificador local da correspondência](./reports/verificar-reconciliacao-clientes.mjs).

Diretórios privados com modo `0700` e arquivos privados com modo `0600`, todos conferidos como ignorados pelo Git. O ZIP original continua no caminho informado e fora do versionamento. Nenhum nome, documento ou credencial de registro aparece neste relatório agregado.

Verificações realizadas: 43 testes existentes do parser/UUID/preflight passaram; sete casos de classificação passaram; os 5.071 resultados foram reproduzidos integralmente pelo verificador local; seis casos de documentos passaram no cálculo local e na consulta SQL de teste somente leitura. O checksum do ZIP permaneceu igual, e a releitura dos campos de identidade dos 3.100 clientes e 810 clientes PF do destino conferiu com a captura inicial.

As consultas têm snapshots próprios; não constituem um snapshot global único de todas as relações. A releitura conferiu os campos usados na comparação, não todos os campos das entidades. A inspeção de schema, grants e dados precisa ser renovada antes de uma execução futura.

## Próximos pontos de aprovação

1. Revisar as correspondências propostas e manter ambiguidades/divergências bloqueadas; a preparação de payloads depende da resolução de identidade correspondente.
2. Aplicação local do patch da FK comercial aprovada e concluída. A execução da migration no banco continua pendente de aprovação própria.
3. Fechar compatibilidade e acesso do schema, definir ambiente de ensaio e recuperação e só então submeter DDL ao destino.
4. Preparar simulação por lote com os campos completos e apresentar cada carga para aprovação própria.

Esta execução cobre a etapa inicial de clientes e o preflight das migrations. A migração completa das 312 origens, as demais regras e os lotes ainda não foram concluídos.

Continuação posterior: [compatibilidade e proposta de acesso](./COMPATIBILIDADE-ACESSO-2026-09-13.md), com a análise dos consumidores, 35 testes de services aprovados, limitações do ambiente Comercial e um patch proposto para as nove tabelas novas, ainda sem aprovação/aplicação.
