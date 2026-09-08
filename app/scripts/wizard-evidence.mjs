/**
 * Evidência manual do wizard de Projetos contra a stack real (issue #996).
 *
 * Diferente de `app/src/modules/integracao/run-project-wizard-browser-smoke.mjs`, que roda no
 * `pnpm test` com a rede mockada, este runner exige serviços de pé, banco descartável e uma
 * OPENAI_API_KEY válida. Ele consome créditos reais, então fica fora da suíte e só roda sob demanda.
 *
 * Uso:
 *   WIZARD_QA_BASE_URL=http://localhost:3000 \
 *   WIZARD_QA_LOGIN=qa.alfa.owner WIZARD_QA_PASSWORD=senha123 \
 *   WIZARD_QA_CLIENT_ID=<uuid do cliente de teste> \
 *   WIZARD_QA_OUTPUT_DIR=docs/qa/evidence/issue-996 \
 *   node app/scripts/wizard-evidence.mjs
 */
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const baseUrl = (process.env.WIZARD_QA_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const login = process.env.WIZARD_QA_LOGIN || "qa.alfa.owner";
const password = process.env.WIZARD_QA_PASSWORD || "senha123";
const textClient = {
  id: process.env.WIZARD_QA_CLIENT_ID || "34000000-0000-4000-8000-000000000001",
  name: process.env.WIZARD_QA_CLIENT_NAME || "Cliente QA Alfa",
};
const fileClient = {
  id: process.env.WIZARD_QA_FILE_CLIENT_ID || "34000000-0000-4000-8000-000000000010",
  name: process.env.WIZARD_QA_FILE_CLIENT_NAME || "Cliente QA Wizard B",
};
const outputDir = path.resolve(
  repoRoot,
  process.env.WIZARD_QA_OUTPUT_DIR || "docs/qa/evidence/issue-996",
);
const sensitiveAtaPath = process.env.WIZARD_QA_SENSITIVE_ATA;
const publicAtaPath = path.resolve(
  repoRoot,
  process.env.WIZARD_QA_PUBLIC_ATA || "docs/qa/fixtures/ata-qa-alfa.md",
);

let shotIndex = 0;

/**
 * A Ata pode conter dado sensível do cliente, então toda captura mascara os campos que a exibem.
 * Sem isso a evidência viraria vazamento — é o mesmo contrato do smoke mockado.
 */
async function shot(page, name) {
  shotIndex += 1;
  const file = path.join(outputDir, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
  await page.screenshot({
    path: file,
    fullPage: true,
    mask: [
      page.getByLabel("Cole a Ata para extrair tarefas"),
      page.locator('[data-testid="wizard-minutes-text"]'),
    ],
    maskColor: "#94a3b8",
  });
  console.log(`  📸 ${path.relative(repoRoot, file)}`);
  return file;
}

async function signIn(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Login", { exact: true }).fill(login);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Entrar no Office/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function openWizard(page, client, { name, startDate, endDate, objective }) {
  await page.goto(`${baseUrl}/projects?clientId=${client.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Projetos", level: 1 })).toBeVisible();
  await shot(page, "projetos-filtrado-por-cliente");

  await page.getByRole("button", { name: "Novo projeto" }).click();
  const wizard = page.getByRole("dialog", { name: "Novo projeto" });
  await expect(wizard).toBeVisible();

  // O cliente vem travado do filtro: some o combobox e sobra o nome como texto.
  await expect(wizard.getByText(client.name, { exact: true })).toBeVisible();
  await expect(wizard.getByRole("combobox", { name: "Cliente", exact: true })).toHaveCount(0);
  await shot(page, "wizard-etapa-1-cliente-travado");

  await wizard.getByLabel("Nome").fill(name);
  await wizard.getByLabel("Data de início").fill(startDate);
  if (endDate) await wizard.getByLabel("Data final prevista").fill(endDate);
  await wizard.getByLabel("Objetivo").fill(objective);
  await wizard.getByRole("button", { name: "Continuar" }).click();
  return wizard;
}

async function extractAndReview(page, wizard, { label, text, file }) {
  const extractButton = wizard.getByRole("button", { name: "Extrair tarefas com IA" });
  await expect(wizard.getByText("Tentativas de extração: 0 de 3.", { exact: true })).toBeVisible();

  if (file) {
    await wizard
      .getByLabel("Selecione um arquivo .txt, .md, .docx ou .pdf")
      .setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: file.buffer });
  } else {
    await wizard.getByLabel("Cole a Ata para extrair tarefas").fill(text);
  }
  await shot(page, `${label}-etapa-2-ata-carregada`);

  const startedAt = Date.now();
  await extractButton.click();
  await expect(wizard.getByText("Tentativas de extração: 1 de 3.", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(wizard.getByRole("group", { name: /\(proposta pela IA\)$/ }).first()).toBeVisible({
    timeout: 90_000,
  });
  console.log(`  ⏱️  extração real da OpenAI em ${Math.round((Date.now() - startedAt) / 1000)}s`);

  const proposals = wizard.getByRole("group", { name: /\(proposta pela IA\)$/ });
  const proposalCount = await proposals.count();
  assert.ok(proposalCount > 0, "A IA precisa propor ao menos uma Tarefa.");
  await shot(page, `${label}-etapa-2-propostas-da-ia`);

  const extracted = [];
  for (let index = 0; index < proposalCount; index += 1) {
    const group = proposals.nth(index);
    extracted.push({
      name: await group.getByLabel(/^Nome/).inputValue(),
      department: await group.getByLabel(/^Departamento/).inputValue(),
      model: await group.getByLabel(/^Modelo/).inputValue(),
      responsible: await group.getByLabel(/^Responsável/).inputValue(),
      prevision_date: await group.getByLabel("Prazo", { exact: true }).inputValue(),
    });
  }

  console.log(`  🤖 ${proposalCount} proposta(s):`);
  for (const item of extracted) console.log(`     ${JSON.stringify(item)}`);

  return { extracted, proposalCount };
}

/**
 * O revisor humano da etapa 2: completa o que a IA não conseguiu mapear, inclui uma Tarefa manual
 * e remove outra. Cada Modelo só pode aparecer uma vez no Projeto, então a escolha pula os já
 * usados — é a mesma regra que o wizard cobra em "Selecione um Modelo diferente para cada tarefa".
 */
async function reviewProposals(page, wizard, label) {
  const groups = wizard.getByRole("group", { name: /^Tarefa \d+/ });
  const total = await groups.count();
  const usedModels = new Set();
  const incomplete = [];

  for (let index = 0; index < total; index += 1) {
    const group = groups.nth(index);
    const modelId = await group.getByLabel(/^Modelo/).inputValue();
    if (modelId) usedModels.add(modelId);
    else incomplete.push(index);
  }

  const completed = [];
  for (const index of incomplete) {
    const group = groups.nth(index);
    const departmentField = group.getByLabel(/^Departamento/);
    const modelField = group.getByLabel(/^Modelo/);
    const departmentIds = (await departmentField.locator("option").evaluateAll((options) =>
      options.map((option) => option.value),
    )).filter(Boolean);

    let chosen = null;
    for (const departmentId of departmentIds) {
      await departmentField.selectOption(departmentId);
      const modelIds = (await modelField.locator("option").evaluateAll((options) =>
        options.map((option) => option.value),
      )).filter((value) => value && !usedModels.has(value));
      if (modelIds.length > 0) {
        await modelField.selectOption(modelIds[0]);
        usedModels.add(modelIds[0]);
        chosen = modelIds[0];
        break;
      }
    }

    assert.ok(chosen, "Não sobrou Modelo livre para completar a Tarefa proposta pela IA.");
    completed.push(await group.getByLabel(/^Nome/).inputValue());
  }

  await wizard.getByRole("button", { name: "Adicionar tarefa", exact: true }).click();
  const manual = wizard.getByRole("group", { name: `Tarefa ${total + 1}`, exact: true });
  await manual.getByLabel(/^Nome/).fill("Tarefa manual de QA (será removida)");
  await shot(page, `${label}-etapa-2-revisao-manual`);
  await manual.getByRole("button", { name: "Remover tarefa", exact: true }).click();

  console.log(`  ✍️  campos completados manualmente: ${JSON.stringify(completed)}`);
  return completed;
}

async function confirm(page, wizard, client, label, expectedTaskName, unassignedTaskName) {
  const reviewButton = wizard.getByRole("button", { name: "Revisar tarefas", exact: true });
  if (await reviewButton.isDisabled()) {
    const alerts = await wizard.getByRole("alert").allInnerTexts();
    throw new Error(`"Revisar tarefas" bloqueado. Alertas: ${JSON.stringify(alerts)}`);
  }
  await reviewButton.click();
  const review = wizard.getByRole("table");
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(review.getByRole("cell", { name: "Sem responsável", exact: true }).first()).toBeVisible();
  await shot(page, `${label}-etapa-3-revisao-final`);

  await wizard.getByRole("button", { name: "Criar projeto", exact: true }).click();
  await page.waitForURL(`${baseUrl}/tasks?clientId=${client.id}`, { timeout: 30_000 });
  const success = await page.getByText(/Projeto criado com sucesso\./).first().innerText();

  // A listagem chega filtrada pelo cliente: espera a Tarefa criada antes de fotografar.
  await expect(page.getByRole("cell", { name: expectedTaskName, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, `${label}-etapa-4-sucesso-e-listagem-filtrada`);

  // AC "Sem responsável" precisa ser visível E filtrável: o filtro de atribuição prova as duas.
  await page.getByLabel("Atribuição").selectOption("unassigned");
  await expect(page.getByRole("cell", { name: unassignedTaskName, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, `${label}-etapa-4b-filtro-sem-responsavel`);
  await page.getByLabel("Atribuição").selectOption("all");

  // Limpar o cliente derruba o parâmetro e devolve a listagem permitida.
  await page.getByRole("button", { name: new RegExp(client.name, "i") }).first().click();
  await page.getByRole("option", { name: "Sem cliente selecionado" }).click();
  await page.waitForURL(`${baseUrl}/tasks`, { timeout: 30_000 });
  await shot(page, `${label}-etapa-5-cliente-limpo`);

  return success;
}

async function runScenario(page, scenario) {
  console.log(`\n▶️  ${scenario.title}`);
  const wizard = await openWizard(page, scenario.client, scenario.project);
  const { extracted, proposalCount } = await extractAndReview(page, wizard, scenario.source);
  const completedByHand = await reviewProposals(page, wizard, scenario.source.label);
  const success = await confirm(
    page,
    wizard,
    scenario.client,
    scenario.source.label,
    extracted[0].name,
    completedByHand.at(-1) ?? extracted[0].name,
  );

  console.log(`  ✅ ${success}`);
  return {
    title: scenario.title,
    client: scenario.client.name,
    project: scenario.project.name,
    proposalCount,
    extracted,
    completedByHand,
    success,
  };
}

async function main() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: path.join(outputDir, "video"), size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  const results = [];

  try {
    await signIn(page);
    await shot(page, "sessao-autenticada");

    results.push(
      await runScenario(page, {
        title: "Ata sintética de QA (texto colado)",
        client: textClient,
        project: {
          name: "QA #996 — Ata sintética",
          startDate: "2026-09-10",
          endDate: "2026-10-31",
          objective: "Validar extração por texto colado com a IA real.",
        },
        source: {
          label: "cenario-a-texto",
          text: await readFile(publicAtaPath, "utf8"),
        },
      }),
    );

    if (sensitiveAtaPath) {
      const buffer = await readFile(path.resolve(repoRoot, sensitiveAtaPath));
      results.push(
        await runScenario(page, {
          title: "Ata real do cliente (upload .md)",
          client: fileClient,
          project: {
            name: "QA #996 — Ata por arquivo",
            startDate: "2026-09-10",
            endDate: "2026-10-31",
            objective: "Validar extração por upload de arquivo com a IA real.",
          },
          source: {
            label: "cenario-b-arquivo",
            file: { name: "ata.md", mimeType: "text/markdown", buffer },
          },
        }),
      );
    } else {
      console.log("\n⚠️  WIZARD_QA_SENSITIVE_ATA não definida; cenário de arquivo ignorado.");
    }

    console.log(`\n${JSON.stringify(results, null, 2)}`);
  } catch (error) {
    await shot(page, "falha");
    throw error;
  } finally {
    await context.close();
    await browser.close();
    const [video] = await readdir(path.join(outputDir, "video"));
    if (video) {
      await rename(
        path.join(outputDir, "video", video),
        path.join(outputDir, "video", "wizard-projetos-e2e.webm"),
      );
    }
  }
}

await main();
