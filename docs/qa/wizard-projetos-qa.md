# QA do wizard de Projetos — issue #996

Validação do fluxo principal e da persistência do wizard de criação de Projetos com extração de
Tarefas por IA. Duas camadas cobrem a issue:

| Camada | Onde | Rede da IA | Roda no `pnpm test` |
| --- | --- | --- | --- |
| Smoke determinístico | `app/src/modules/integracao/run-project-wizard-browser-smoke.mjs` | mockada por `page.route` | sim (`test:project-wizard-browser`) |
| Evidência end-to-end | `app/scripts/wizard-evidence.mjs` | OpenAI real | não (`qa:wizard-evidence`, sob demanda) |

O smoke é o gate de regressão e é ele que satisfaz o critério "nenhuma credencial ou crédito real é
usado". O runner de evidência foi pedido à parte, para provar manualmente que os serviços reais e a
OpenAI entregam o mesmo comportamento; ele fica fora da suíte justamente por consumir crédito.

## Cobertura dos critérios de aceite

| Critério | Gate determinístico | Evidência manual |
| --- | --- | --- |
| Wizard abre pelo cliente selecionado e o cliente permanece bloqueado | `expectLockedClient` | `03`/`12` |
| Cenário sem Ata cria Projeto sem Tarefas e cai na listagem filtrada | contagens `0/0/0` + `/tasks?clientId=` | — |
| Cenário com texto extrai, revisa, adiciona e remove itens | sim | `04`–`06` |
| Ao menos um cenário de arquivo cobre upload e propostas | `setInputFiles` (.txt/.md/.docx/.pdf) | `13`–`15` |
| Revisão final mostra Tarefas, dependências, estados, avisos e responsáveis | sim | `07`/`16` |
| Sucesso mostra contagens exatas e navega para `/tasks?clientId=` com filtro restaurado | sim | `08`/`17` |
| Limpar o cliente remove o parâmetro e restaura a listagem permitida | `run-task-eligibility-filters-browser-smoke.mjs` | `10`/`19` |
| Tarefa "Sem responsável" visível e filtrável | `run-task-eligibility-filters-browser-smoke.mjs` (`assignment=unassigned`) | `09`/`18` |
| Rede da OpenAI substituída por contrato determinístico | mock de `**/task/project-wizard/extract-tasks` | não se aplica |
| Falhas produzem artefato útil sem capturar a Ata | `captureFailureArtifact` | captura de `falha` |

## Artefato de falha

Quando o smoke quebra, ele grava um screenshot em `app/smoke-artifacts/`
(`PROJECT_WIZARD_BROWSER_ARTIFACT_DIR` muda o destino). Trace e vídeo do Playwright ficam de fora de
propósito: o trace registra o texto passado a `fill()` e o vídeo mostra a digitação, ou seja, ambos
guardariam a Ata. O screenshot mascara o textarea e o seletor de arquivo, que são os pontos onde a
Ata aparece **literalmente**.

A máscara não é blindagem geral: as Tarefas propostas pela IA derivam da Ata e podem repetir nomes e
assuntos do cliente. No smoke isso é inofensivo porque a Ata é uma fixture sintética; num fluxo com
Ata real, o screenshot também é dado sensível — ver a regra do modo sensível abaixo.

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
   pnpm --filter @workspace/infra prisma:seed:qa:wizard
   ```

3. Configure uma chave OpenAI temporária, com limite de uso, somente no ambiente do task-service
   descartável. Não use a chave de produção nem registre seu valor em comandos, logs ou artefatos.
   Revogue a chave ao terminar. Configure a extração real em `services/task-service/.env`:

   ```env
   AI_EXTRACTION_MODE=openai
   OPENAI_API_KEY=<chave>
   OPENAI_MODEL=gpt-4o-mini
   ```

4. Suba gateway, user, organization, department, client, project, task e audit services, mais o app.

5. Rode o runner:

   ```bash
   pnpm --filter @workspace/app qa:wizard-evidence
   ```

### Modo sensível

Por padrão os dois cenários usam a Ata sintética de `docs/qa/fixtures/ata-qa-alfa.md`, e as capturas
podem ser versionadas — é o que está em `docs/qa/evidence/issue-996/`.

`WIZARD_QA_SENSITIVE_ATA=/fora/do/repo/ata.md` troca o cenário de arquivo por uma Ata real. Nesse
modo o runner registra somente contagens, sem capturas ou nomes de Tarefas. Desde a #997,
nenhum modo grava vídeo ou trace, e os logs não incluem propostas extraídas nem erros brutos do
Playwright. Os vídeos da evidência histórica da #996 não são gerados novamente.

## Dados de teste

`infra/prisma/seed-qa-wizard.ts` amplia as fixtures de `prisma:seed:qa` dentro da organização
`QA Integração Alfa`, reaproveitando organização, cliente e senha de `scripts/qa/integracao-fixtures.mjs`.
Trabalha apenas com clientes de teste:

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

1. **Fixtures QA gravavam `status: "active"` em departamentos**, mas o produto grava `"Ativo"`
   (`departmentService.create`) e todo filtro procura `"Ativo"` — inclusive o catálogo do wizard
   (`projectWizardExtractionService.listCatalog`). Com a fixture original o catálogo chega vazio na
   IA, que devolve departamento e Modelo em branco em todas as propostas, e o wizard trava em
   "Preencha nome, departamento e Modelo de todas as tarefas". Corrigido em `seed-qa.ts`.
   Os Modelos do fixture base seguem com `type: "QA"` de propósito: só `type: "Projeto"` entra no
   catálogo do wizard, e os Modelos de Projeto vêm do `seed-qa-wizard.ts`.
2. **`seed-qa.ts` grava clientes com `status: "active"`** enquanto o client-service usa `"Ativo"`
   (`clientService` na restauração, `clientListQueryService` no filtro por departamento). Não afeta o
   wizard e não foi alterado aqui por não ter sido validado ponta a ponta, mas é a mesma divergência
   do achado 1 e provavelmente esconde outro filtro cego.
3. **A cadeia de migrations não é replayable do zero.** `20260713100000_platform_super_admin` e
   `20260821200000_add_platform_auth_sessions` criam ambos o tipo `PlatformRole` e a tabela
   `platform_users`, então `prisma migrate deploy` num banco vazio falha com
   `type "PlatformRole" already exists`. Foi preciso aplicar a segunda migration à mão e marcá-la
   como aplicada.
4. A IA não mapeia toda proposta a um Modelo: sobram de uma a duas Tarefas sem departamento/Modelo,
   completadas na revisão. Comportamento esperado, e é o que torna a etapa de revisão obrigatória.


## QA adversarial — issue #997

O runner determinístico cobre rejeições locais (tipo, vazio e tamanho), respostas HTTP 400 de
DOCX corrompido/PDF sem camada textual, três tentativas válidas, reextração, troca de fonte,
rascunho transitório, permissões 0/1/2/3/owner, foco inicial/teclado e erros associados aos campos.
Os testes de rota do task-service complementam o browser: analisam os arquivos reais e comprovam
que rejeições não chamam o provedor, além da autorização HTTP. Mock de UI não prova autorização
no servidor.

```bash
pnpm --filter @workspace/app test:projects
pnpm --filter @workspace/app typecheck
pnpm --filter @workspace/app build
PROJECT_WIZARD_BROWSER_BASE_URL=http://127.0.0.1:33129 \
  PROJECT_WIZARD_BROWSER_CAPTURE=1 \
  PROJECT_WIZARD_BROWSER_ARTIFACT_DIR="$PWD/output/playwright/issue-997" \
  pnpm --filter @workspace/app test:project-wizard-browser
pnpm --filter @workspace/task-service exec vitest run src/test/projectWizard.routes.test.ts
```

`PROJECT_WIZARD_BROWSER_BASE_URL` deve apontar para o app compilado deste checkout; sem essa
variável, o runner inicia seu próprio Next local. O runner substitui as chamadas HTTP por fixtures
sintéticas e não envia Ata à OpenAI. O teste do comando opt-in usa fronteiras simuladas de browser
e arquivos para provar ausência de vídeo, máscaras e sanitização de falhas; não acessa a stack.

A execução real continua opcional e fora de `pnpm test`. Requer banco descartável sem dados de
clientes e chave temporária; sua ausência deve ser registrada separadamente das validações
locais. Não reutilize banco compartilhado para satisfazer esse critério. Evidências e limitações
por head ficam em `output/playwright/issue-997/README.md`.
