import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

import { EMPTY_SOLICITATION_INDICATORS } from "../triagem/triagemSmokeFixtures.mjs";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const port = process.env.TRIAGE_EXTERNAL_LINKS_SMOKE_PORT ?? "3124";
const baseUrl = configuredBaseUrl ?? `http://127.0.0.1:${port}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const screenshotPath =
  process.env.TRIAGE_EXTERNAL_LINKS_SCREENSHOT_PATH ??
  "output/playwright/issue-1152-triagem-external-links.png";
const clientId = "c1000000-0000-4000-8000-000000000001";
const competence = "2026-09";
const clouds = [];
const linkTypeCode = "SMOKE_LINK_TYPE";
const externalLinks = [];
const user = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Analista de Triagem",
  login: "analista",
  permission: 2,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  type: "admin",
  modules: { triagem: 2, contabil: 2 },
};
const triageOverviewFixture = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
  indicators: { urgent_open: 0, routine_pending: 0, bank_pending: 0, complete: 0 },
};

function json(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}

function newLink(input) {
  return {
    id: "l1000000-0000-4000-8000-000000000001",
    client_id: clientId,
    competence,
    archived_at: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    responsible: { id: user.id, name: user.name, status: "Ativo" },
    ...input,
    responsible_id: input.responsible_id ?? user.id,
  };
}

async function runBrowserProof() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 1200 },
  });
  await context.addCookies([
    { name: "cw.session", value: "fixture-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    { name: "cw.csrf", value: "fixture-csrf", url: baseUrl, sameSite: "Lax" },
  ]);

  const page = await context.newPage();
  const requests = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.startsWith("/api/")
      ? url.pathname.slice("/api".length)
      : url.port === "3010"
        ? url.pathname
        : null;
    if (!apiPath) return route.continue();

    const body = request.postDataJSON?.();
    requests.push({ method: request.method(), path: apiPath, body });
    if (request.method() === "GET" && apiPath === "/user/me") return json(route, user);
    if (request.method() === "GET" && apiPath === "/triagem/overview") {
      return json(route, triageOverviewFixture);
    }
    if (request.method() === "GET" && apiPath === "/client/list") {
      return json(route, {
        items: [{ id: clientId, name: "Cliente Demonstração", company_name: "Cliente Demonstração" }],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      });
    }
    if (request.method() === "GET" && apiPath === "/triagem/competencies") {
      return json(route, [{
        id: "t1000000-0000-4000-8000-000000000001",
        client_id: clientId,
        competence,
        configuration_snapshot: {},
        responsible_snapshot: {},
        archived_at: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      }]);
    }
    if (request.method() === "GET" && apiPath === "/rh/operational-users") {
      return json(route, [{ id: user.id, name: user.name, status: "Ativo", department: "Triagem" }]);
    }
    if (request.method() === "GET" && apiPath === "/triagem/external-links") {
      return json(route, externalLinks.filter((link) => link.archived_at === null));
    }
    if (request.method() === "GET" && apiPath === "/triagem/catalogs") {
      if (url.searchParams.get("kind") !== "LINK_TYPE") return json(route, []);
      return json(route, [
        {
          id: "catalog-link-type-smoke",
          kind: "LINK_TYPE",
          code: linkTypeCode,
          label: "Tipo de link do smoke",
          url: null,
          archived_at: null,
        },
      ]);
    }
    if (request.method() === "POST" && apiPath === "/triagem/external-links") {
      const created = newLink({ ...body, url: body.url, type: body.type, description: body.description ?? null });
      externalLinks.push(created);
      return json(route, created, 201);
    }
    if (request.method() === "PUT" && apiPath.startsWith("/triagem/external-links/")) {
      const updated = Object.assign(externalLinks[0], body, {
        responsible: body.responsible_id ? { id: user.id, name: user.name, status: "Ativo" } : null,
        updated_at: "2026-09-18T01:00:00.000Z",
      });
      return json(route, updated);
    }
    if (request.method() === "PATCH" && apiPath.endsWith("/archive")) {
      externalLinks[0].archived_at = "2026-09-18T02:00:00.000Z";
      return json(route, externalLinks[0]);
    }
    if (request.method() === "GET" && apiPath === "/triagem/clouds") return json(route, clouds);
    if (request.method() === "POST" && apiPath === "/triagem/clouds") {
      const cloud = { id: `cloud-${clouds.length + 1}`, updated_at: "2026-09-30T12:00:00.000Z", ...request.postDataJSON() };
      clouds.push(cloud);
      return json(route, cloud);
    }
    if (request.method() === "PATCH" && apiPath.startsWith("/triagem/clouds/")) {
      const cloud = clouds.find((item) => apiPath.endsWith(item.id));
      Object.assign(cloud, request.postDataJSON());
      return json(route, cloud);
    }
    if (request.method() === "GET" && apiPath === "/triagem/editability") return json(route, { can_edit: true });
    if (request.method() === "GET" && apiPath === "/triagem/monthly") {
      return json(route, {
        id: "m1000000-0000-4000-8000-000000000001",
        client_id: clientId,
        competence,
        type: "CONTABIL",
        checklist: {},
        item_notes: {},
        summary: { applicable: 0, completed: 0, attention: 0, pending: 0, notApplicable: 0, notPresent: 0, percentage: 0 },
      });
    }
    if (request.method() === "GET" && apiPath === "/triagem/statements") return json(route, []);
    if (request.method() === "GET" && apiPath === "/triagem/closing") return json(route, null);
    if (request.method() === "GET" && apiPath === "/triagem/solicitations/indicators") {
      return json(route, EMPTY_SOLICITATION_INDICATORS);
    }
    return json(route, []);
  });

  try {
    await page.goto("/triagem", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("button", { name: "Selecionar cliente" }).click();
    await page.getByRole("option", { name: /Cliente Demonstração/ }).click();
    await expect(page.getByRole("heading", { name: "Links externos" })).toBeVisible();

    await page.getByLabel("Tipo do link externo").selectOption(linkTypeCode);
    await page.getByLabel("Link HTTPS").fill("https://links.example.test/competencia");
    await page.getByLabel("Descrição do link externo").fill("Pasta da competência");
    await page.getByRole("button", { name: "Adicionar link" }).click();
    await expect(page.getByText("https://links.example.test/competencia")).toBeVisible();
    assert.ok(requests.some((request) => request.method === "POST" && request.path === "/triagem/external-links"));

    await page.getByRole("button", { name: "Revisar" }).click();
    await page.getByLabel("Link HTTPS").last().fill("https://links.example.test/revisado");
    await page.getByRole("button", { name: "Salvar revisão" }).click();
    await expect(page.getByText("https://links.example.test/revisado")).toBeVisible();
    assert.ok(requests.some((request) => request.method === "PUT" && request.path.includes("/triagem/external-links/")));

    await page
      .getByRole("list", { name: /Links externos da competência/ })
      .getByRole("button", { name: "Arquivar", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Arquivar link externo" })
      .getByRole("button", { name: "Arquivar", exact: true })
      .click();
    await expect(page.getByText("Nenhum link externo registrado para esta competência.")).toBeVisible();
    assert.ok(requests.some((request) => request.method === "PATCH" && request.path.endsWith("/archive")));

    // #1695: a nuvem é do cliente e convive com os links da competência.
    await page.getByLabel("Tipo da nova nuvem").fill("Google Drive");
    await page.getByLabel("Link da nova nuvem").fill("https://drive.example.test/cliente");
    await page.getByRole("button", { name: "Adicionar nuvem" }).click();
    await expect(page.getByRole("link", { name: "Google Drive" })).toHaveAttribute(
      "href",
      "https://drive.example.test/cliente",
    );
    await page.getByRole("button", { name: "Editar Google Drive" }).click();
    await page.getByLabel("Link da nuvem em edição").fill("https://drive.example.test/novo");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("link", { name: "Google Drive" })).toHaveAttribute(
      "href",
      "https://drive.example.test/novo",
    );
    assert.ok(requests.some((request) => request.method === "PATCH" && request.path.startsWith("/triagem/clouds/")));
    await expect(page.getByRole("heading", { name: "Links externos" })).toBeVisible();

    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({ url: page.url(), requestCount: requests.length, screenshotPath }));
  } finally {
    await browser.close();
  }
}

await withNextServer(runBrowserProof);

async function withNextServer(test) {
  if (configuredBaseUrl) {
    await test();
    return;
  }

  const serverProcess = spawn("pnpm", ["exec", "next", "start", "--port", port], {
    cwd: appRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  serverProcess.stdout.on("data", (chunk) => (output += chunk.toString()));
  serverProcess.stderr.on("data", (chunk) => (output += chunk.toString()));

  try {
    await waitForServer(serverProcess, () => output);
    await test();
  } finally {
    stopServer(serverProcess);
  }
}

async function waitForServer(serverProcess, getOutput) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (serverProcess.exitCode !== null) throw new Error(`Next encerrou antes do smoke.\n${getOutput()}`);
    try {
      const response = await fetch(`${baseUrl}/triagem`);
      if (response.ok || response.status < 500) return;
    } catch {
      // Continua até o Next abrir a porta.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout aguardando o build em ${baseUrl}.\n${getOutput()}`);
}

function stopServer(serverProcess) {
  if (!serverProcess.pid || serverProcess.exitCode !== null) return;
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }
  serverProcess.kill("SIGTERM");
}
