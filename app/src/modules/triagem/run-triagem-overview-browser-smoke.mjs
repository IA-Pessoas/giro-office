import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const port = process.env.TRIAGE_OVERVIEW_SMOKE_PORT ?? "3131";
const baseUrl = configuredBaseUrl ?? `http://127.0.0.1:${port}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const screenshotPath =
  process.env.TRIAGE_OVERVIEW_SCREENSHOT_PATH ??
  "output/playwright/issue-1153-triagem-overview.png";
const user = {
  id: "c0000000-0000-4000-8000-000000000001",
  name: "Analista de Triagem",
  login: "analista",
  permission: 2,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  type: "admin",
  modules: { triagem: 2 },
};

function json(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}

function overviewFor(url) {
  const status = url.searchParams.get("status");
  const competence = url.searchParams.get("competence");
  if (competence === "2026-08") {
    return {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      indicators: { urgent_open: 0, routine_pending: 0, bank_pending: 0, complete: 0 },
    };
  }

  const items = status === "COMPLETE"
    ? [{ client_id: "b0000000-0000-4000-8000-000000000002", legal_name: "Cliente Completo", competence: "2026-09", status: "COMPLETE" }]
    : [
        { client_id: "b0000000-0000-4000-8000-000000000001", legal_name: "Cliente Urgente", competence: "2026-09", status: "URGENT_OPEN" },
        { client_id: "b0000000-0000-4000-8000-000000000002", legal_name: "Cliente Completo", competence: "2026-09", status: "COMPLETE" },
      ];
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 20,
    indicators: {
      urgent_open: status === "COMPLETE" ? 0 : 1,
      routine_pending: 0,
      bank_pending: 0,
      complete: status === "COMPLETE" ? 1 : 1,
    },
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
  const requestLog = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.startsWith("/api/")
      ? url.pathname.slice("/api".length)
      : url.port === "3010"
        ? url.pathname
        : null;
    if (!apiPath) return route.continue();
    requestLog.push({ method: request.method(), path: apiPath, url });
    if (request.method() === "GET" && apiPath === "/user/me") return json(route, user);
    if (request.method() === "GET" && apiPath === "/triagem/catalogs") return json(route, []);
    if (request.method() === "GET" && apiPath === "/triagem/overview") {
      return json(route, overviewFor(url));
    }
    return json(route, []);
  });

  try {
    await page.goto("/triagem", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Painel operacional" })).toBeVisible();
    await expect(page.getByText("Cliente Urgente")).toBeVisible();
    assert.ok(
      requestLog.some(
        ({ method, path, url }) =>
          method === "GET" && path === "/triagem/overview" && url.searchParams.get("page_size") === "20",
      ),
    );

    await page.getByLabel("Status do painel").selectOption("COMPLETE");
    await expect(page.getByText("Cliente Completo")).toBeVisible();
    assert.ok(
      requestLog.some(
        ({ method, path, url }) =>
          method === "GET" && path === "/triagem/overview" && url.searchParams.get("status") === "COMPLETE",
      ),
    );

    await page.getByLabel("Competência do painel").fill("2026-08");
    await expect(page.getByText("Nenhuma competência elegível encontrada com os filtros atuais.")).toBeVisible();
    assert.ok(
      requestLog.some(
        ({ method, path, url }) =>
          method === "GET" && path === "/triagem/overview" && url.searchParams.get("competence") === "2026-08",
      ),
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(JSON.stringify({ url: page.url(), requestCount: requestLog.length, screenshotPath }));
  } finally {
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) {
    await run();
    return;
  }

  const server = spawn("pnpm", ["exec", "next", "dev", "--webpack", "--port", port], {
    cwd: appRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => (output += chunk.toString()));
  server.stderr.on("data", (chunk) => (output += chunk.toString()));

  try {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 60_000) {
      if (server.exitCode !== null) throw new Error(`Next encerrou antes do smoke.\n${output}`);
      try {
        const response = await fetch(baseUrl);
        if (response.status < 500) break;
      } catch {
        // Aguarda o bind do Next.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await run();
  } finally {
    if (server.pid && server.exitCode === null) server.kill("SIGTERM");
  }
}

await withNextServer(runBrowserProof);
console.log("PASS painel operacional cobre filtros, indicadores e estados vazios");
