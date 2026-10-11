import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

// Mapa de grupo (#1748, #1749) e agenda do Regularize (#1747) no navegador, com a API simulada:
// gerar → editar → salvar → recarregar → PNG, e criar → editar → remover evento.

const PORT = process.env.REGULARIZE_GROUPS_AGENDA_BROWSER_PORT || "3136";
const configuredBaseUrl = process.env.REGULARIZE_GROUPS_AGENDA_BROWSER_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://localhost:${PORT}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const repoRoot = path.resolve(appRoot, "..");
const evidenceDir = path.join(repoRoot, "output/playwright/issue-1738");

const GROUP_ID = "group-1";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const group = {
  id: GROUP_ID,
  name: "Grupo Smoke",
  status: true,
  organization_id: "org-regularize-groups-smoke",
  clients: [],
};

// Resposta de GET /regularize/groups/:id/map (GroupMap em groupMapService.ts).
const generatedMap = {
  group: { id: GROUP_ID, name: "Grupo Smoke" },
  cities: [
    {
      name: "Salvador",
      partners: [
        {
          pf_id: "pf-1",
          name: "Maria Sócia",
          companies: [
            {
              client_id: "client-1",
              name: "Alfa Comércio Ltda",
              cpf_cnpj: "12345678000199",
              status: "Ativo",
              address: "Rua das Flores, 10 (Centro)",
              regime: "Simples Nacional",
            },
            {
              client_id: "client-2",
              name: "Beta Serviços Ltda",
              cpf_cnpj: "98765432000155",
              status: "Ativo",
              address: null,
              regime: null,
            },
          ],
        },
      ],
    },
  ],
};

const smokeUser = {
  id: "user-regularize-groups-smoke",
  name: "Editor Regularize",
  login: "regularize.groups.smoke@castelo.test",
  permission: 1,
  organization_id: "org-regularize-groups-smoke",
  type: "user",
  modules: { regularize: 2 },
};

function findNode(node, id) {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

async function installApiMocks(page) {
  const json = (route, data) =>
    route.fulfill({ status: 200, contentType: "application/json", json: { success: true, data } });
  const state = {
    savedMap: null,
    mapPuts: [],
    agendaEvents: [],
    agendaLists: [],
    agendaWrites: [],
  };

  await page.route("**/user/me", (route) => json(route, smokeUser));
  await page.route("**/client/list**", (route) =>
    json(route, { items: [], total: 0, page: 1, pageSize: 50, hasMore: false }),
  );
  await page.route("**/client/groups", (route) => json(route, [group]));
  await page.route("**/task/notifications", (route) => json(route, { items: [], unread_count: 0 }));
  await page.route("**/regularize/dashboard**", (route) =>
    json(route, {
      year: 2026,
      metrics: {
        openProcesses: 0,
        activeLicenses: 0,
        activeClientPfs: 0,
        activeSites: 0,
        municipalTaxesCompleted: 0,
        municipalTaxesPending: 0,
        municipalTaxesTotal: 0,
      },
      recentProcesses: [],
      trackedLicenses: [],
    }),
  );
  await page.route("**/regularize/guidance/list**", (route) => json(route, []));
  await page.route("**/regularize/pfs**", (route) =>
    json(route, { data: [], total: 0, page: 1, limit: 20, hasMore: false }),
  );
  await page.route("**/regularize/process**", (route) => json(route, []));

  await page.route(`**/regularize/groups/${GROUP_ID}/map`, (route) => json(route, generatedMap));
  await page.route(`**/regularize/groups/${GROUP_ID}/map/saved`, (route) => {
    const request = route.request();
    if (request.method() === "GET") return json(route, state.savedMap);

    assert.equal(request.method(), "PUT", "The saved map only accepts GET and PUT.");
    const body = request.postDataJSON();
    state.mapPuts.push(body);
    state.savedMap = {
      tree: body.tree,
      updated_at: "2026-10-10T15:00:00.000Z",
      updated_by_user_id: smokeUser.id,
    };
    return json(route, state.savedMap);
  });

  await page.route("**/task/agenda**", (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") {
      state.agendaLists.push(Object.fromEntries(new URL(request.url()).searchParams));
      return json(route, state.agendaEvents);
    }

    const body = request.postDataJSON();
    state.agendaWrites.push({ method, body });
    if (method === "POST") {
      state.agendaEvents.push({
        id: "agenda-1",
        agenda: body.agenda,
        date: body.date,
        status: body.status,
        obs: body.obs,
        location: null,
        recurring_agenda_id: body.recurrent ? "recurring-1" : null,
      });
    } else if (method === "PUT") {
      const { module: _module, agenda_id: agendaId, recurrent: _recurrent, ...changes } = body;
      state.agendaEvents = state.agendaEvents.map((event) =>
        event.id === agendaId ? { ...event, ...changes } : event,
      );
    } else {
      assert.equal(method, "DELETE", `Unexpected agenda method ${method}.`);
      state.agendaEvents = state.agendaEvents.filter((event) => event.id !== body.agenda_id);
    }
    return json(route, null);
  });

  return state;
}

// O select fica na linha de baixo do rótulo, não ao lado do texto dele.
async function assertSelectBelowLabel(select, name) {
  const labelBox = await select.locator("xpath=ancestor::label").boundingBox();
  const selectBox = await select.boundingBox();
  assert.ok(
    labelBox && selectBox && selectBox.x - labelBox.x < 1,
    `The "${name}" select must sit under its label, not beside the label text.`,
  );
}

async function openGroupMap(page) {
  await page.goto("/regularize", { waitUntil: "domcontentloaded" });
  // Com a aba Agenda a barra passou da largura da tela: a primeira aba não pode ficar cortada.
  const tabs = page.getByRole("navigation", { name: "Abas do Regularize" });
  const tabsBox = await tabs.boundingBox();
  const firstTabBox = await tabs.getByRole("button", { name: "Dashboard", exact: true }).boundingBox();
  assert.ok(
    tabsBox && firstTabBox && firstTabBox.x >= tabsBox.x,
    "The first tab must stay reachable when the tab bar overflows.",
  );
  await page.getByRole("button", { name: "Grupos", exact: true }).click();
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Mapa do grupo", exact: true }) })
    .last();
  // O rótulo envolve o select: o nome acessível traz também o texto das opções.
  const groupSelect = section.getByRole("combobox", { name: /^Grupo/ });
  await assertSelectBelowLabel(groupSelect, "Grupo");
  await groupSelect.selectOption(GROUP_ID);
  const diagram = section.getByRole("img", { name: "Mapa do grupo Grupo Smoke" });
  await expect(diagram, "The group map should be drawn after picking a group.").toBeVisible();
  return { section, diagram };
}

async function proveGroupMap(page, api) {
  // 1. Mapa gerado do cadastro.
  let { section, diagram } = await openGroupMap(page);
  await expect(section.getByRole("status")).toHaveText("Mapa gerado do cadastro, ainda não salvo.");
  for (const text of [
    "Grupo Smoke",
    "Salvador",
    "Maria Sócia",
    "Empresa: Alfa Comércio Ltda",
    "CNPJ: 12.345.678/0001-99",
    "Regime: Simples Nacional",
    "Empresa: Beta Serviços Ltda",
    "Sede: não informado",
  ]) {
    await expect(diagram.getByText(text, { exact: true }), `Generated map must show "${text}".`)
      .toBeVisible();
  }

  // 2. Editar texto e cor de um item e salvar.
  await diagram.getByText("Maria Sócia", { exact: true }).click();
  await section.getByLabel("Texto do item selecionado").fill("Maria Sócia Editada");
  const colorSelect = section.getByRole("combobox", { name: /^Cor/ });
  await assertSelectBelowLabel(colorSelect, "Cor");
  await colorSelect.selectOption({ label: "Amarelo" });
  await section.getByRole("button", { name: "Atualizar item" }).click();
  await expect(diagram.getByText("Maria Sócia Editada", { exact: true })).toBeVisible();
  await expect(section.getByRole("status")).toContainText("Há alterações não salvas.");
  await page.screenshot({ path: path.join(evidenceDir, "01-mapa-editado.png"), fullPage: true });
  await section.getByRole("button", { name: "Salvar mapa" }).click();
  await expect.poll(() => api.mapPuts.length, "Salvar mapa must PUT the saved map.").toBe(1);

  const partnerId = "city:0/partner:pf-1";
  const savedPartner = findNode(api.mapPuts[0].tree, partnerId);
  assert.deepEqual(Object.keys(api.mapPuts[0]), ["tree"], "The PUT body carries only the tree.");
  assert.equal(api.mapPuts[0].tree.id, `group:${GROUP_ID}`);
  assert.ok(savedPartner, "The edited item must be in the saved tree.");
  assert.deepEqual(savedPartner.lines, ["Maria Sócia Editada"]);
  assert.equal(savedPartner.color, "#ffff00");
  assert.equal(savedPartner.children.length, 2, "Editing an item must keep its companies.");
  await expect(section.getByRole("status")).toHaveText(/^Versão salva em .+\.$/);
  await expect(section.getByRole("button", { name: "Salvar mapa" })).toBeDisabled();
  console.log(`PUT do mapa: ${JSON.stringify(savedPartner).slice(0, 120)}…`);

  // 3. Recarregar reabre a versão salva, não o mapa do cadastro.
  ({ section, diagram } = await openGroupMap(page));
  await expect(section.getByRole("status")).toHaveText(/^Versão salva em .+\.$/);
  const reopened = diagram.getByText("Maria Sócia Editada", { exact: true });
  await expect(reopened, "The saved version must reopen after a reload.").toBeVisible();
  await expect(diagram.getByText("Maria Sócia", { exact: true })).toHaveCount(0);
  assert.equal(
    await reopened.evaluate((tspan) => tspan.closest("g")?.querySelector("rect")?.getAttribute("fill")),
    "#ffff00",
    "The saved colour must reopen with the item.",
  );
  assert.equal(api.mapPuts.length, 1, "Reopening the map must not save it again.");
  await page.screenshot({ path: path.join(evidenceDir, "02-mapa-salvo.png"), fullPage: true });

  // 4. PNG do mapa.
  const size = await diagram.evaluate((svg) => ({
    width: svg.viewBox.baseVal.width,
    height: svg.viewBox.baseVal.height,
  }));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    section.getByRole("button", { name: "Baixar PNG" }).click(),
  ]);
  assert.equal(download.suggestedFilename(), "mapa-do-grupo-grupo-smoke.png");
  const pngPath = path.join(evidenceDir, "03-mapa-exportado.png");
  await download.saveAs(pngPath);
  const png = await readFile(pngPath);
  assert.deepEqual([...png.subarray(0, 8)], PNG_SIGNATURE, "The download must be a PNG file.");
  assert.ok(png.length > 5_000, `The PNG is too small to hold the map (${png.length} bytes).`);
  // IHDR: largura e altura logo depois da assinatura e do cabeçalho do bloco. O PNG sai em 2x.
  assert.equal(png.readUInt32BE(16), Math.round(size.width * 2), "PNG width must be 2x the map.");
  assert.equal(png.readUInt32BE(20), Math.round(size.height * 2), "PNG height must be 2x the map.");
  await expect(section.getByRole("alert")).toHaveCount(0);
  console.log(`PNG do mapa: ${download.suggestedFilename()}, ${png.length} bytes (${pngPath})`);
}

async function proveAgenda(page, api) {
  // 5. Agenda do departamento na agenda compartilhada.
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  const agenda = page.getByRole("region", { name: "Agenda do departamento Regularize" });
  await expect(agenda.getByText("Nenhum evento neste mês")).toBeVisible();
  assert.ok(api.agendaLists.length > 0, "The agenda must list events from GET /task/agenda.");
  assert.equal(api.agendaLists[0].module, "regularize");
  assert.match(api.agendaLists[0].month, /^\d{4}-\d{2}$/);

  await agenda.getByRole("button", { name: "Novo evento" }).click();
  const createForm = agenda.getByRole("form", { name: "Novo evento" });
  await createForm.getByLabel("Título").fill("Renovar alvará");
  await createForm.getByLabel("Assunto").fill("Prefeitura");
  await createForm.getByLabel("Repetir todo mês").check();
  await createForm.getByRole("button", { name: "Salvar" }).click();
  await expect(agenda.getByText("Renovar alvará", { exact: true })).toBeVisible();
  await expect(agenda.getByText("Mensal", { exact: true })).toBeVisible();
  assert.deepEqual(api.agendaWrites[0], {
    method: "POST",
    body: {
      module: "regularize",
      agenda: "Renovar alvará",
      obs: "Prefeitura",
      date: `${api.agendaLists[0].month}-01T12:00:00.000Z`,
      status: "Pendente",
      recurrent: true,
    },
  });
  await page.screenshot({ path: path.join(evidenceDir, "04-agenda-evento.png"), fullPage: true });

  await agenda.getByRole("button", { name: "Editar Renovar alvará" }).click();
  const editForm = agenda.getByRole("form", { name: "Editar evento" });
  await expect(editForm.getByLabel("Repetir todo mês")).toBeChecked();
  await editForm.getByLabel("Título").fill("Renovar alvará sanitário");
  await editForm.getByLabel("Estado").selectOption("Realizado");
  await editForm.getByRole("button", { name: "Salvar" }).click();
  await expect(agenda.getByText("Renovar alvará sanitário", { exact: true })).toBeVisible();
  await expect(agenda.getByText("Realizado", { exact: true })).toBeVisible();
  // Só o que mudou: data e recorrência iguais não vão no PUT.
  assert.deepEqual(api.agendaWrites[1], {
    method: "PUT",
    body: {
      module: "regularize",
      agenda_id: "agenda-1",
      agenda: "Renovar alvará sanitário",
      obs: "Prefeitura",
      status: "Realizado",
    },
  });

  await agenda.getByRole("button", { name: "Remover Renovar alvará sanitário" }).click();
  const dialog = page.getByRole("dialog", { name: "Remover evento" });
  await expect(dialog).toContainText("a repetição mensal continua");
  await dialog.getByRole("button", { name: "Remover", exact: true }).click();
  await expect(agenda.getByText("Nenhum evento neste mês")).toBeVisible();
  assert.deepEqual(api.agendaWrites[2], {
    method: "DELETE",
    body: { module: "regularize", agenda_id: "agenda-1" },
  });
  assert.equal(api.agendaWrites.length, 3, "The agenda flow makes exactly one write per action.");
  console.log(`Escritas da agenda: ${JSON.stringify(api.agendaWrites)}`);
}

async function proveReadOnly(page, api) {
  // 6. Nível 1 consulta o mapa e a agenda, sem nada que edite ou salve.
  smokeUser.modules.regularize = 1;
  api.agendaEvents.push({
    id: "agenda-2",
    agenda: "Vistoria dos bombeiros",
    date: `${api.agendaLists[0].month}-15T12:00:00.000Z`,
    status: "Pendente",
    obs: null,
    location: null,
    recurring_agenda_id: null,
  });
  const { section, diagram } = await openGroupMap(page);
  const item = diagram.getByText("Maria Sócia Editada", { exact: true });
  await expect(item, "Level 1 must still see the saved map.").toBeVisible();
  await item.click();
  await expect(section.getByRole("button", { name: "Baixar PNG" })).toBeVisible();
  for (const name of ["Salvar mapa", "Atualizar item", "Remover item", "Adicionar item"]) {
    await expect(section.getByRole("button", { name }), `Level 1 must not get "${name}".`)
      .toHaveCount(0);
  }
  await expect(section.getByRole("textbox")).toHaveCount(0);
  await expect(section.getByText("Clique em um item do mapa para editar.")).toHaveCount(0);
  await page.screenshot({ path: path.join(evidenceDir, "05-nivel-1.png"), fullPage: true });

  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  const agenda = page.getByRole("region", { name: "Agenda do departamento Regularize" });
  await expect(agenda.getByText("Vistoria dos bombeiros", { exact: true })).toBeVisible();
  await expect(agenda.getByRole("button", { name: "Novo evento" })).toHaveCount(0);
  await expect(agenda.getByRole("button", { name: /^(Editar|Remover) / })).toHaveCount(0);
  assert.equal(api.mapPuts.length, 1, "Level 1 must not save the map.");
  assert.equal(api.agendaWrites.length, 3, "Level 1 must not write to the agenda.");
}

async function runBrowserProof() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
  });
  await context.addCookies([
    {
      name: "cw.session",
      value: "opaque-test-session",
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  const apiRequests = [];
  const failedResponses = [];
  const pageErrors = [];
  page.on("request", (request) => {
    if (/\/user\/me|\/regularize\/|\/client\/groups|\/task\/agenda/.test(request.url())) {
      apiRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const api = await installApiMocks(page);

  try {
    await proveGroupMap(page, api);
    await proveAgenda(page, api);
    await proveReadOnly(page, api);
    assert.deepEqual(failedResponses, [], "The flow should not surface API failures.");
    assert.deepEqual(pageErrors, [], "The flow should not throw in the page.");
  } catch (error) {
    console.error(`URL: ${page.url()}`);
    console.error(`Texto da página: ${(await page.locator("body").innerText()).slice(0, 1500)}`);
    console.error(`Requisições: ${apiRequests.join("\n")}`);
    console.error(`Respostas com erro: ${failedResponses.join("\n")}`);
    console.error(`Erros da página: ${pageErrors.join("\n")}`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) return run();
  const nextCli = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const server = spawn(process.execPath, [nextCli, "dev", "--webpack", "--port", PORT], {
    cwd: appRoot,
    env: browserSmokeEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  try {
    const startedAt = Date.now();
    let ready = false;
    while (Date.now() - startedAt < 45_000) {
      if (server.exitCode !== null) throw new Error(`Next encerrou antes do smoke.\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.ok || response.status < 500) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error(`Tempo esgotado aguardando Next em ${baseUrl}.\n${output}`);
    const response = await fetch(`${baseUrl}/regularize`, {
      headers: { Cookie: "cw.session=opaque-test-session" },
      signal: AbortSignal.timeout(120_000),
    });
    assert.equal(response.status, 200, "Next must serve /regularize before the smoke.");
    await run();
  } finally {
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") {
        execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        server.kill("SIGTERM");
      }
    }
  }
}

await mkdir(evidenceDir, { recursive: true });
await withNextServer(runBrowserProof);
console.log("PASS Regularize gera, edita, salva, reabre e exporta o mapa de grupo e mantém a agenda");
