import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const appRoot = new URL("../../..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const repoRoot = new URL("../../../..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const baseUrl = "http://127.0.0.1:5178";
const evidenceDir = `${repoRoot}/output/playwright`;
const organizationId = "00000000-0000-4000-8000-000000000002";
const client = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Empresa de teste",
  company_name: "Empresa de teste Ltda.",
  fantasy_name: "Teste",
  cpf_cnpj: "12345678000195",
  status: "Ativo",
  service_unique: false,
  deletion_date: null,
  organization_id: organizationId,
};
const user = {
  id: "client-groups-smoke-user",
  name: "Pessoa de teste",
  login: "client-groups.smoke@castelo.test",
  permission: 3,
  organization_id: organizationId,
  type: "admin",
  modules: { integracao: 3 },
};
const groups = [];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    { name: "cw.session", value: "client-groups-fixture", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    { name: "cw.csrf", value: "A".repeat(43), url: baseUrl, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/socket.io/**", (route) => route.fulfill({ status: 200, body: "ok" }));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const success = (data, status = 200) => route.fulfill({ status, json: { success: true, data } });
    if (path === "/user/me") return success(user);
    if (path === "/client/list") {
      return success({ items: [client], total: 1, page: 1, pageSize: 100, hasMore: false });
    }
    if (path === "/client/groups" && request.method() === "GET") return success(groups);
    if (path === "/client/groups" && request.method() === "POST") {
      const group = { id: randomUUID(), name: request.postDataJSON().name, status: true, organization_id: organizationId, clients: [] };
      groups.push(group);
      return success(group, 201);
    }
    const groupMatch = path.match(/^\/client\/groups\/([0-9a-f-]+)(?:\/clients)?$/u);
    if (groupMatch) {
      const group = groups.find((item) => item.id === groupMatch[1]);
      assert.ok(group, `Grupo não encontrado no mock: ${path}`);
      if (path.endsWith("/clients") && request.method() === "PUT") {
        group.clients = request.postDataJSON().client_ids.map((id) => ({ ...client, id }));
        return success({ id: group.id, clients: group.clients.map(({ id }) => ({ id })) });
      }
      if (request.method() === "PATCH") {
        group.name = request.postDataJSON().name;
        return success(group);
      }
    }
    return success({});
  });

  try {
    await page.goto("/clients", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Grupos de empresas" }).waitFor();
    await page.getByLabel("Novo grupo").fill("Grupo A");
    await page.getByRole("button", { name: "Criar grupo" }).click();
    await page.getByText("Este grupo ainda não tem empresas.").waitFor();
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: `${evidenceDir}/client-groups-empty.png`, fullPage: true });

    await page.getByLabel("Buscar empresas").fill("Empresa de teste");
    const checkbox = page.getByRole("checkbox").first();
    await checkbox.waitFor();
    await checkbox.check();
    await page.getByRole("button", { name: "Substituir clientes do grupo" }).click();
    await page.getByText("1 empresa", { exact: true }).waitFor();

    await page.getByLabel("Novo grupo").fill("Grupo B");
    await page.getByRole("button", { name: "Criar grupo" }).click();
    await page.getByText("Este grupo ainda não tem empresas.").waitFor();
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Substituir clientes do grupo" }).click();
    await page.getByLabel("Nome do grupo").fill("Grupo B Renomeado");
    await page.getByRole("button", { name: "Salvar nome" }).click();
    await page.getByRole("button", { name: "Grupo B Renomeado" }).waitFor();
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => group.clients.map((member) => member.id)), [[client.id], [client.id]]);
    await page.screenshot({ path: `${evidenceDir}/client-groups-linked.png`, fullPage: true });
    assert.deepEqual(pageErrors, []);
    console.log("PASS grupos vazios, renomeação e múltiplos vínculos de cliente");
    console.log(`Evidências: ${evidenceDir}`);
  } catch (error) {
    await page.screenshot({ path: `${evidenceDir}/client-groups-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "--port", "5178", "--hostname", "127.0.0.1"],
  { cwd: appRoot, env: browserSmokeEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let output = "";
server.stdout.on("data", (chunk) => { output += chunk; });
server.stderr.on("data", (chunk) => { output += chunk; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(`${baseUrl}/login`)).status < 500) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Next dev não iniciou: ${output}`);
  await run();
} finally {
  server.kill();
}
