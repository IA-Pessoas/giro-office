# QA do wizard de Projetos — issue #996

Validação do fluxo principal e da persistência do wizard de criação de Projetos com extração de
Tarefas por IA. Duas camadas cobrem a issue:

| Camada | Onde | Rede da IA | Roda no `pnpm test` |
| --- | --- | --- | --- |
| Smoke determinístico | `app/src/modules/integracao/run-project-wizard-browser-smoke.mjs` | mockada por `page.route` | sim (`test:project-wizard-browser`) |
| Evidência end-to-end | `app/scripts/wizard-evidence.mjs` | OpenAI real | não (consome crédito) |

O smoke é o gate de regressão. A evidência é a prova manual, sob demanda, de que os serviços reais
entregam o mesmo comportamento.

## Cobertura dos critérios de aceite

| Critério | Onde é provado |
| --- | --- |
| Wizard abre pelo cliente selecionado e o cliente permanece bloqueado | smoke `expectLockedClient`; evidência `03`/`12` |
| Cenário sem Ata cria Projeto sem Tarefas e cai na listagem filtrada | smoke (contagens `0/0/0` e `/tasks?clientId=`) |
| Cenário com texto extrai, revisa, adiciona e remove itens | smoke; evidência `04`–`06` |
| Ao menos um cenário de arquivo cobre upload e propostas | smoke (`setInputFiles`); evidência `13`–`15` (upload `.md`) |
| Revisão final mostra Tarefas, dependências, estados, avisos e responsáveis | smoke; evidência `07`/`16` |
| Sucesso mostra contagens exatas e navega para `/tasks?clientId=` com filtro restaurado | smoke; evidência `08`/`17` |
| Limpar o cliente remove o parâmetro e restaura a listagem permitida | smoke `run-task-eligibility-filters-browser-smoke.mjs`; evidência `10`/`19` |
| Tarefa "Sem responsável" visível e filtrável | evidência `09`/`18` (filtro Atribuição = Sem responsável) |
| Rede da OpenAI substituída por contrato determinístico no gate | smoke mocka `**/task/project-wizard/extract-tasks` |
| Falhas produzem artefato útil sem capturar a Ata | `captureFailureArtifact` no smoke, com `mask` nos campos da Ata |

## Artefato de falha

O smoke grava um screenshot quando `PROJECT_WIZARD_BROWSER_ARTIFACT_DIR` aponta um diretório:

```bash
PROJECT_WIZARD_BROWSER_ARTIFACT_DIR=./smoke-artifacts pnpm --filter @workspace/app test:project-wizard-browser
```

Trace e vídeo do Playwright ficam de fora de propósito: o trace registra o texto passado a `fill()`
e o vídeo mostra a digitação, ou seja, ambos guardariam a Ata. O screenshot mascara o textarea e o
seletor de arquivo, e preserva o resto da tela — estado do wizard, contadores e mensagens de erro.

## Como rodar a evidência end-to-end

Requer a stack local completa e um banco descartável. **Nunca aponte para o banco compartilhado:**
o runner cria Projetos e Tarefas de verdade.

1. Suba um Postgres descartável com as extensões do Supabase:

   ```bash
   docker run -d --name qa996-db -e POSTGRES_PASSWORD=<senha> -e POSTGRES_DB=castelo_qa996 \
     -p 55432:5432 public.ecr.aws/supabase/postgres:17.6.1.054
   docker exec qa996-db psql -U supabase_admin -d castelo_qa996 \
     -c 'CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;'
   ```

2. Aponte `DATABASE_URL` de `infra/.env` e de cada `services/*/.env` para esse banco, migre e
   semeie o cliente de teste:

   ```bash
   pnpm --filter @workspace/infra exec prisma migrate deploy
   pnpm --filter @workspace/infra prisma:seed:qa
   pnpm --filter @workspace/infra exec tsx prisma/seed-qa-wizard.ts
   ```

3. Configure a extração real em `services/task-service/.env`:

   ```env
   AI_EXTRACTION_MODE=openai
   OPENAI_API_KEY=<chave>
   OPENAI_MODEL=gpt-4o-mini
   ```

4. Suba gateway, user, organization, department, client, project, task e audit services, mais o app.

5. Rode o runner:

   ```bash
   WIZARD_QA_SENSITIVE_ATA=/caminho/fora/do/repo/ata.md node app/scripts/wizard-evidence.mjs
   ```

`WIZARD_QA_SENSITIVE_ATA` é opcional e aponta para uma Ata real **fora do repositório**. Sem ela o
runner executa só o cenário sintético. As capturas mascaram os campos da Ata nos dois casos.

## Dados de teste

`infra/prisma/seed-qa-wizard.ts` amplia as fixtures de `prisma:seed:qa` dentro da organização
`QA Integração Alfa`, e trabalha apenas com clientes de teste:

- Clientes: `Cliente QA Alfa` (cenário de texto) e `Cliente QA Wizard B` (cenário de arquivo). São
  dois porque um Modelo só admite uma Tarefa ativa por cliente — os cenários se atropelariam num só.
- Departamentos: Tributário, Fiscal, Contábil, Jurídico e Comercial QA.
- Modelos de Projeto: planejamento tributário, análise de operações financeiras, coleta de
  certificado digital, termo de confidencialidade, proposta comercial e acompanhamento
  pós-planejamento (este último só entra como dependência).
- Responsáveis: um por departamento. O de Contábil fica sem liderança de RH de propósito, para que a
  evidência sempre tenha uma Tarefa "Sem responsável".
- Antes de semear, o script apaga os Projetos cujo nome começa com `QA #996` nesses dois clientes,
  para o runner poder repetir.

## Achados

1. **Fixtures QA gravam `status: "active"` em departamentos e `type: "QA"` em Modelos**
   (`infra/prisma/seed-qa.ts`), mas o catálogo do wizard filtra `status: "Ativo"` e
   `type: "Projeto"` (`projectWizardExtractionService.listCatalog`). Com a fixture original o
   catálogo chega vazio na IA, que devolve departamento e Modelo em branco em todas as propostas — o
   wizard trava em "Preencha nome, departamento e Modelo de todas as tarefas". `seed-qa-wizard.ts`
   usa os valores corretos; `seed-qa.ts` continua divergente.
2. **A cadeia de migrations não é replayable do zero.** `20260713100000_platform_super_admin` e
   `20260821200000_add_platform_auth_sessions` criam ambos o tipo `PlatformRole` e a tabela
   `platform_users`, então `prisma migrate deploy` num banco vazio falha com
   `type "PlatformRole" already exists`. Foi preciso aplicar a segunda migration à mão e marcá-la
   como aplicada.
3. A IA não mapeia toda proposta a um Modelo. Nos dois cenários sobrou de uma a duas Tarefas sem
   departamento/Modelo, completadas na revisão — comportamento esperado, mas é o que torna a etapa
   de revisão obrigatória no fluxo real.
