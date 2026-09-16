import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const configuredBaseUrl = process.env.CLIENT_PICKER_BROWSER_BASE_URL?.replace(/\/$/, "");
const port = process.env.CLIENT_PICKER_BROWSER_PORT || "3134";
const baseUrl = configuredBaseUrl || `http://127.0.0.1:${port}`;
const evidenceDir = process.env.CLIENT_PICKER_BROWSER_ARTIFACT_DIR;
const sessionCookie = {
  name: "cw.session",
  value: "opaque-client-picker-test-session",
  httpOnly: true,
  sameSite: "Lax",
  url: baseUrl,
};
const clients = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Aurora Comércio",
    company_name: "Empresa Aurora Ltda",
    fantasy_name: "Loja do Bairro",
    cpf_cnpj: "00.000.000/0001-00",
    status: "Ativo",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Pessoa Exemplo",
    company_name: null,
    fantasy_name: null,
    cpf_cnpj: "000.000.000-00",
    status: "Ativo",
  },
];

function userFor(level, type = "user") {
  return {
    id: `client-picker-${type}-${level}`,
    name: "Pessoa QA",
    login: "client-picker@example.test",
    organization_id: "organization-client-picker",
    permission: 0,
    type,
    modules: { integracao: 0, contabil: level, pessoal: level, parcelamento: 1 },
  };
}

async function installApiMocks(page, user) {
  const requests = [];
  await page.route("**/user/me", (route) =>
    route.fulfill({ status: 200, json: { success: true, data: user } }),
  );
  await page.route("**/department/list**", (route) =>
    route.fulfill({ status: 200, json: { success: true, data: [] } }),
  );
  await page.route("**/socket.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: route.request().method() === "POST" ? "ok" : '0{"sid":"client-picker-smoke"}',
    }),
  );
  await page.route("**/parcelamento/**", (route) =>
    route.fulfill({
      status: 200,
      json: { success: true, data: { items: [], total: 0, page: 1, page_size: 50 } },
    }),
  );
  await page.route("**/pessoal/**", (route) =>
    route.fulfill({ status: 200, json: { success: true, data: [] } }),
  );
  await page.route("**/contabil/controls*", (route) =>
    route.fulfill({ status: 404, json: { success: false, message: "Controle não encontrado." } }),
  );
  await page.route("**/client/list*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(Object.fromEntries(params));
    assert.equal(params.get("status"), "Ativo");
    assert.equal(params.get("organization_id"), null);
    const search = params.get("search")?.toLocaleLowerCase() || "";
    if (search === "erro-fixture") {
      return route.fulfill({
        status: 503,
        json: { success: false, error: "Indisponível no cenário de QA." },
      });
    }
    const items = params.has("ref")
      ? []
      : clients.filter((client) =>
          [client.name, client.company_name, client.fantasy_name, client.cpf_cnpj].some((value) =>
            value?.toLocaleLowerCase().includes(search),
          ),
        );
    return route.fulfill({
      status: 200,
      json: {
        success: true,
        data: { items, total: items.length, page: 1, pageSize: 50, hasMore: false },
      },
    });
  });
  return requests;
}

async function capture(page, name) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: join(evidenceDir, name), fullPage: true });
}

async function assertIndependentPicker(browser, { path, linkName }) {
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1366, height: 900 },
  });
  try {
    await context.addCookies([sessionCookie]);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const requests = await installApiMocks(page, userFor(1));
    await page.goto("/parcelamento", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Selecionar cliente", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Nenhum cliente disponível");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].ref, "integracao");
    await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click();

    // Use the real SPA link: a reload would discard the cache and hide this regression.
    await page.getByRole("link", { name: linkName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.getByRole("button", { name: "Selecionar cliente", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Selecionar cliente", exact: true });
    await expect(dialog.getByRole("option", { name: /Empresa Aurora Ltda/ })).toBeVisible();
    assert.equal(
      requests.length,
      2,
      "O seletor deve consultar clientes sem reutilizar o filtro legado.",
    );
    assert.equal(requests[1].ref, undefined);
    await capture(page, `${path.slice(1)}-clientes-viewer.png`);

    const search = dialog.getByRole("searchbox", { name: "Buscar cliente" });
    for (const [term, visibleName] of [
      ["Aurora Comércio", "Empresa Aurora Ltda"],
      ["Empresa Aurora Ltda", "Empresa Aurora Ltda"],
      ["00.000.000/0001-00", "Empresa Aurora Ltda"],
      ["000.000.000-00", "Pessoa Exemplo"],
    ]) {
      await search.fill(term);
      await expect.poll(() => requests.at(-1)?.search).toBe(term);
      await expect(dialog.getByRole("option", { name: new RegExp(visibleName) })).toBeVisible();
      await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(1);
    }
    await search.fill("sem-correspondencia");
    await expect(dialog).toContainText("Nenhum cliente disponível");
    await search.fill("erro-fixture");
    await expect(dialog.getByRole("alert")).toContainText("Não foi possível carregar clientes");
    await expect(dialog.getByText("Nenhum cliente disponível", { exact: true })).toHaveCount(0);
    await search.fill("");
    await expect(dialog.getByRole("option", { name: /Empresa Aurora Ltda/ })).toBeVisible();
    await dialog.getByRole("option", { name: /Empresa Aurora Ltda/ }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Empresa Aurora Ltda/ })).toBeVisible();
    assert.deepEqual(pageErrors, []);
    console.log(
      `PASS ${linkName}: cache, busca por nome/razão social/CPF/CNPJ, seleção e recuperação`,
    );
  } finally {
    await context.close();
  }
}

async function assertProfilePicker(browser, target, level, type = "user") {
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 390, height: 844 },
  });
  try {
    await context.addCookies([sessionCookie]);
    const page = await context.newPage();
    const requests = await installApiMocks(page, userFor(level, type));
    await page.goto(target.path, { waitUntil: "networkidle" });
    if (level === 0 && type !== "owner") {
      await expect(
        page.getByRole("heading", { name: "Acesso indisponível", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Selecionar cliente", exact: true }),
      ).toHaveCount(0);
      assert.equal(requests.length, 0);
    } else {
      await page.getByRole("button", { name: "Selecionar cliente", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Selecionar cliente", exact: true });
      await expect(dialog.getByRole("option", { name: /Empresa Aurora Ltda/ })).toBeVisible();
      assert.equal(requests[0].ref, undefined);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
      );
      if (level === 2) await capture(page, `${target.path.slice(1)}-clientes-mobile.png`);
      await dialog.getByRole("option", { name: /Empresa Aurora Ltda/ }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole("button", { name: /Empresa Aurora Ltda/ })).toBeVisible();
    }
    console.log(`PASS ${target.linkName}: ${type} nível ${level} preserva acesso do seletor`);
  } finally {
    await context.close();
  }
}

async function runBrowser() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const target of [
      { path: "/contabil", linkName: "Contábil" },
      { path: "/departamento-pessoal", linkName: "Dep. Pessoal" },
    ]) {
      await assertIndependentPicker(browser, target);
      for (const level of [0, 2, 3]) await assertProfilePicker(browser, target, level);
      await assertProfilePicker(browser, target, 0, "owner");
    }
  } finally {
    await browser.close();
  }
}

async function withNextServer() {
  if (configuredBaseUrl) return runBrowser();
  const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const server = spawn(process.execPath, [nextBin, "dev", "--webpack", "--port", port], {
    cwd: appRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => {
    output = (output + chunk).slice(-8000);
  });
  server.stderr.on("data", (chunk) => {
    output = (output + chunk).slice(-8000);
  });
  try {
    const deadline = Date.now() + 120_000;
    for (;;) {
      if (server.exitCode !== null) throw new Error(`Next encerrou antes do smoke.\n${output}`);
      try {
        const response = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
        if (response.status < 500) break;
      } catch {
        /* Aguarda a porta local. */
      }
      if (Date.now() > deadline) throw new Error(`Next indisponível para o smoke.\n${output}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    for (const route of ["/parcelamento", "/contabil", "/departamento-pessoal"]) {
      await fetch(`${baseUrl}${route}`, {
        headers: { cookie: `${sessionCookie.name}=${sessionCookie.value}` },
        signal: AbortSignal.timeout(120_000),
      });
    }
    await runBrowser();
  } finally {
    server.kill("SIGTERM");
  }
}

await withNextServer();
