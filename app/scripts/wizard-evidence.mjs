/**
 * Evidência manual do wizard de Projetos contra a stack real (issue #996).
 *
 * Diferente de `app/src/modules/integracao/run-project-wizard-browser-smoke.mjs`, que roda no
 * `pnpm test` com a rede mockada, este runner exige serviços de pé, banco descartável e uma
 * OPENAI_API_KEY válida. Ele consome créditos reais, então fica fora da suíte e só roda sob demanda.
 *
 * Modo padrão: os dois cenários usam a Ata sintética de `docs/qa/fixtures/`, e as capturas podem ser
 * versionadas. Com WIZARD_QA_SENSITIVE_ATA o cenário de arquivo passa a usar uma Ata real: aí o
 * runner entra em modo sensível e registra somente contagens, sem capturas ou nomes extraídos.
 * Vídeo e trace ficam desativados em ambos os modos para não registrar a Ata.
 *
 * Uso:
 *   node app/scripts/wizard-evidence.mjs
 *   WIZARD_QA_SENSITIVE_ATA=/fora/do/repo/ata.md node app/scripts/wizard-evidence.mjs
 */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

import { INTEGRACAO_QA_PASSWORD } from "../../scripts/qa/integracao-fixtures.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const baseUrl = (process.env.WIZARD_QA_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const login = process.env.WIZARD_QA_LOGIN || "qa.alfa.owner";
const password = process.env.WIZARD_QA_PASSWORD || INTEGRACAO_QA_PASSWORD;
const textClient = {
  id: process.env.WIZARD_QA_CLIENT_ID || "34000000-0000-4000-8000-000000000001",
  name: process.env.WIZARD_QA_CLIENT_NAME || "Cliente QA Alfa",
};
const fileClient = {
  id: process.env.WIZARD_QA_FILE_CLIENT_ID || "34000000-0000-4000-8000-000000000010",
  name: process.env.WIZARD_QA_FILE_CLIENT_NAME || "Cliente QA Wizard B",
};
const publicAtaPath = path.resolve(
  repoRoot,
  process.env.WIZARD_QA_PUBLIC_ATA || "docs/qa/fixtures/ata-qa-alfa.md",
);

/**
 * Uma Ata real vaza pelo que a IA devolve, não só pelo campo onde ela é colada: as Tarefas propostas
 * repetem nomes e assuntos do cliente, e nenhuma máscara alcança isso. Por isso o modo sensível
 * não grava capturas. Os dois modos omitem o conteúdo das propostas dos logs.
 */
const sensitiveAtaPath = process.env.WIZARD_QA_SENSITIVE_ATA;
const isSensitiveRun = Boolean(sensitiveAtaPath);
const outputDir = path.resolve(
  repoRoot,
  process.env.WIZARD_QA_OUTPUT_DIR ||
    (isSensitiveRun ? "smoke-wizard-evidence-local" : "docs/qa/evidence/issue-996"),
);

let captureIndex = 0;

/** Mascara os campos onde a Ata aparece literalmente; o modo sensível cuida do resto. */
async function capture(page, name) {
  if (isSensitiveRun) return;
  captureIndex += 1;
  const file = path.join(outputDir, `${String(captureIndex).padStart(2, "0")}-${name}.png`);
  await page.screenshot({
    path: file,
    fullPage: true,
    mask: [
      page.getByLabel("Cole a Ata para extrair tarefas"),
      page.getByLabel("Selecione um arquivo .txt, .md, .docx ou .pdf"),
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

async function openWizard(page, { client, project }) {
  await page.goto(`${baseUrl}/projects?clientId=${client.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Projetos", level: 1 })).toBeVisible();
  await capture(page, "projetos-filtrado-por-cliente");

  await page.getByRole("button", { name: "Novo projeto" }).click();
  const wizard = page.getByRole("dialog", { name: "Novo projeto" });
  await expect(wizard).toBeVisible();

  // O cliente vem travado do filtro: some o combobox e sobra o nome como texto.
  await expect(wizard.getByText(client.name, { exact: true })).toBeVisible();
  await expect(wizard.getByRole("combobox", { name: "Cliente", exact: true })).toHaveCount(0);
  await capture(page, "wizard-etapa-1-cliente-travado");

  await wizard.getByLabel("Nome").fill(project.name);
  await wizard.getByLabel("Data de início").fill(project.startDate);
  if (project.endDate) await wizard.getByLabel("Data final prevista").fill(project.endDate);
  await wizard.getByLabel("Objetivo").fill(project.objective);
  await wizard.getByRole("button", { name: "Continuar" }).click();
  return wizard;
}

async function extractProposals(page, wizard, { label, text, file }) {
  const extractButton = wizard.getByRole("button", { name: "Extrair tarefas com IA" });
  await expect(wizard.getByText("Tentativas de extração: 0 de 3.", { exact: true })).toBeVisible();

  if (file) {
    await wizard
      .getByLabel("Selecione um arquivo .txt, .md, .docx ou .pdf")
      .setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: file.buffer });
  } else {
    await wizard.getByLabel("Cole a Ata para extrair tarefas").fill(text);
  }
  await capture(page, `${label}-etapa-2-ata-carregada`);

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
  await capture(page, `${label}-etapa-2-propostas-da-ia`);

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

  const mapped = extracted.filter(({ model }) => model).length;
  console.log(`  🤖 ${proposalCount} proposta(s), ${mapped} já com Modelo.`);

  return extracted;
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
    const departmentIds = (
      await departmentField
        .locator("option")
        .evaluateAll((options) => options.map((option) => option.value))
    ).filter(Boolean);

    let chosen = null;
    for (const departmentId of departmentIds) {
      await departmentField.selectOption(departmentId);
      const modelIds = (
        await modelField
          .locator("option")
          .evaluateAll((options) => options.map((option) => option.value))
      ).filter((value) => value && !usedModels.has(value));
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
  await capture(page, `${label}-etapa-2-revisao-manual`);
  await manual.getByRole("button", { name: "Remover tarefa", exact: true }).click();

  console.log(`  ✍️  ${completed.length} campo(s) completado(s) na revisão manual.`);
  return completed;
}

async function createProject(page, wizard, { client, source }, expected) {
  const reviewButton = wizard.getByRole("button", { name: "Revisar tarefas", exact: true });
  if (await reviewButton.isDisabled()) {
    const alerts = await wizard.getByRole("alert").allInnerTexts();
    throw new Error(`"Revisar tarefas" bloqueado. Alertas: ${JSON.stringify(alerts)}`);
  }
  await reviewButton.click();
  const review = wizard.getByRole("table");
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(
    review.getByRole("cell", { name: "Sem responsável", exact: true }).first(),
  ).toBeVisible();
  await capture(page, `${source.label}-etapa-3-revisao-final`);

  await wizard.getByRole("button", { name: "Criar projeto", exact: true }).click();
  await page.waitForURL(`${baseUrl}/tasks?clientId=${client.id}`, { timeout: 30_000 });
  const success = await page
    .getByText(/Projeto criado com sucesso\./)
    .first()
    .innerText();

  // A listagem chega filtrada pelo cliente: espera a Tarefa criada antes de fotografar.
  await expect(page.getByRole("cell", { name: expected.anyTaskName, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await capture(page, `${source.label}-etapa-4-sucesso-e-listagem-filtrada`);

  // AC "Sem responsável" precisa ser visível E filtrável: o filtro de atribuição prova as duas.
  await page.getByLabel("Atribuição").selectOption("unassigned");
  await expect(
    page.getByRole("cell", { name: expected.unassignedTaskName, exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await capture(page, `${source.label}-etapa-4b-filtro-sem-responsavel`);
  await page.getByLabel("Atribuição").selectOption("all");

  // Limpar o cliente derruba o parâmetro e devolve a listagem permitida.
  await page
    .getByRole("button", { name: new RegExp(client.name, "i") })
    .first()
    .click();
  await page.getByRole("option", { name: "Sem cliente selecionado" }).click();
  await page.waitForURL(`${baseUrl}/tasks`, { timeout: 30_000 });
  await capture(page, `${source.label}-etapa-5-cliente-limpo`);

  return success;
}

async function runScenario(page, scenario) {
  console.log(`\n▶️  ${scenario.title}`);
  const wizard = await openWizard(page, scenario);
  const extracted = await extractProposals(page, wizard, scenario.source);
  const completedByHand = await reviewProposals(page, wizard, scenario.source.label);
  const success = await createProject(page, wizard, scenario, {
    anyTaskName: extracted[0].name,
    unassignedTaskName: completedByHand.at(-1) ?? extracted[0].name,
  });

  console.log(`  ✅ ${success}`);
  return {
    title: scenario.title,
    client: scenario.client.name,
    project: scenario.project.name,
    proposalCount: extracted.length,
    mappedByAi: extracted.filter(({ model }) => model).length,
    completedByHand: completedByHand.length,
    success,
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  console.log(
    isSensitiveRun
      ? "Ata real em uso: somente contagens, sem capturas."
      : `Evidência pública em ${path.relative(repoRoot, outputDir)}.`,
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const results = [];

  try {
    await signIn(page);
    await capture(page, "sessao-autenticada");

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
        source: { label: "cenario-a-texto", text: await readFile(publicAtaPath, "utf8") },
      }),
    );

    results.push(
      await runScenario(page, {
        title: isSensitiveRun
          ? "Ata real do cliente (upload .md)"
          : "Ata sintética de QA (upload .md)",
        client: fileClient,
        project: {
          name: "QA #996 — Ata por arquivo",
          startDate: "2026-09-10",
          endDate: "2026-10-31",
          objective: "Validar extração por upload de arquivo com a IA real.",
        },
        source: {
          label: "cenario-b-arquivo",
          file: {
            name: "ata.md",
            mimeType: "text/markdown",
            buffer: await readFile(path.resolve(repoRoot, sensitiveAtaPath ?? publicAtaPath)),
          },
        },
      }),
    );

    console.log(`\n${JSON.stringify(results, null, 2)}`);
  } catch {
    await capture(page, "falha").catch(() => {
      // A falha da captura também não pode expor DOM ou conteúdo da Ata.
    });
    // Erros do Playwright podem incluir DOM, valores de campos e respostas.
    throw new Error(
      "Smoke real do wizard falhou; confira o estado da stack e a captura mascarada, se disponível.",
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
