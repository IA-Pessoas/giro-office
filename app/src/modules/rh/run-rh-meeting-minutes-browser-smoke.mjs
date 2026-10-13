import { execFileSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const port = process.env.RH_MEETING_MINUTES_PORT || "3137";
const configuredBaseUrl = process.env.RH_MEETING_MINUTES_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://127.0.0.1:${port}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const screenshotDir = resolve(appRoot, "output/playwright/issue-1907");
const employeeId = "00000000-0000-4000-8000-000000000003";
const minuteId = "00000000-0000-4000-8000-000000000020";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Ana QA Ata RH",
  login: "rh.meeting.minutes.smoke",
  permission: 1,
  department_id: "00000000-0000-4000-8000-000000000010",
  organization_id: "00000000-0000-4000-8000-000000000002",
  type: "admin",
  modules: { rh: 2 },
};
const employee = {
  id: employeeId,
  full_name: "Bruno QA Colaborador",
  job_title: "Analista",
  department: { id: user.department_id, name: "Recursos Humanos" },
  photo_url: null,
  status: "active",
};
const requestLog = [];
let minutes = [];

function success(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data }),
  });
}

async function installApiMocks(page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.startsWith("/api/")
      ? url.pathname.slice("/api".length)
      : url.port === "3010"
        ? url.pathname
        : null;
    if (!apiPath) return route.continue();
    requestLog.push(`${request.method()} ${apiPath}`);

    if (request.method() === "GET" && apiPath === "/user/me") return success(route, user);
    if (request.method() === "POST" && apiPath === "/user/session/refresh") return success(route, user);
    if (request.method() === "GET" && apiPath === "/rh/profile/colaborator/list") {
      return success(route, [employee]);
    }
    if (request.method() === "GET" && apiPath === "/rh/profile/colaborator/meeting-minutes") {
      return success(route, minutes);
    }
    if (request.method() === "POST" && apiPath === "/rh/profile/colaborator/meeting-minutes") {
      const input = JSON.parse(request.postData() ?? "{}");
      const now = new Date().toISOString();
      const revision = {
        id: "00000000-0000-4000-8000-000000000021",
        version: 1,
        action: "Created",
        meeting_date: input.meeting_date,
        agenda: input.agenda,
        participants: input.participants,
        report: input.report,
        changed_by_id: user.id,
        changed_by_name: user.name,
        changed_at: now,
      };
      minutes = [
        {
          id: minuteId,
          user_id: employeeId,
          meeting_date: input.meeting_date,
          agenda: input.agenda,
          participants: input.participants,
          report: input.report,
          version: 1,
          created_by_id: user.id,
          updated_by_id: user.id,
          created_at: now,
          updated_at: now,
          revisions: [revision],
        },
      ];
      return success(route, minutes[0], 201);
    }
    if (
      request.method() === "PATCH" &&
      apiPath === `/rh/profile/colaborator/meeting-minutes/${minuteId}`
    ) {
      const input = JSON.parse(request.postData() ?? "{}");
      const now = new Date().toISOString();
      const current = minutes[0];
      const revision = {
        id: "00000000-0000-4000-8000-000000000022",
        version: 2,
        action: "Updated",
        meeting_date: input.meeting_date ?? current.meeting_date,
        agenda: input.agenda ?? current.agenda,
        participants: input.participants ?? current.participants,
        report: input.report,
        changed_by_id: user.id,
        changed_by_name: user.name,
        changed_at: now,
      };
      minutes[0] = {
        ...current,
        ...input,
        version: 2,
        updated_at: now,
        revisions: [revision, ...current.revisions],
      };
      return success(route, minutes[0]);
    }
    if (request.method() === "GET" && apiPath === "/rh/requests") {
      return success(route, { items: [], total: 0, page: 1, pageSize: 20, hasMore: false });
    }
    return success(route, []);
  });
}

async function runBrowserProof() {
  await mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 1100 },
  });
  await context.addCookies([
    { name: "cw.session", value: "rh-meeting-minutes-smoke", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    { name: "cw.csrf", value: "rh-meeting-minutes-csrf", url: baseUrl, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installApiMocks(page);

  try {
    await page.goto("/rh", { waitUntil: "domcontentloaded", timeout: 120_000 });
    try {
      await page.getByRole("tab", { name: "Dossiê", exact: true }).waitFor({ timeout: 15_000 });
    } catch (error) {
      console.error("Browser smoke context", {
        url: page.url(),
        text: await page.locator("body").innerText().catch(() => "<unavailable>"),
        requestLog,
        pageErrors,
      });
      await page.screenshot({ path: resolve(screenshotDir, "rh-meeting-minutes-debug.png"), fullPage: true });
      throw error;
    }
    await page.getByRole("tab", { name: "Dossiê", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Dossiê do colaborador" })).toBeVisible();
    await page.getByRole("button", { name: /Bruno QA Colaborador Analista/ }).click();
    await expect(page.getByRole("heading", { name: "Atas de reunião de RH" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dados cadastrais" })).toHaveCount(0);
    await expect(page.getByLabel("Pauta da reunião")).toBeVisible();
    await page.getByLabel("Data da reunião").fill("2026-04-15");
    await page.getByLabel("Pauta da reunião").fill("Acompanhamento de integração");
    await page.getByLabel("Participantes da reunião").fill("Ana e Bruno");
    await page.getByLabel("Relato da reunião").fill("Plano de acompanhamento combinado.");
    await page.getByRole("button", { name: "Adicionar ata" }).click();
    await expect(page.getByRole("heading", { name: "Acompanhamento de integração" })).toBeVisible();
    await page.getByText(/Histórico · 1 versão/).click();
    await expect(page.getByText("Plano de acompanhamento combinado.").first()).toBeVisible();
    await page.screenshot({ path: resolve(screenshotDir, "rh-meeting-minutes-history.png"), fullPage: true });
    expect(requestLog).toContain(`GET /rh/profile/colaborator/meeting-minutes`);
    expect(requestLog).toContain("POST /rh/profile/colaborator/meeting-minutes");
    expect(pageErrors).toEqual([]);
  } finally {
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) return run();
  const nextBin = resolve(appRoot, "node_modules/next/dist/bin/next");
  const serverProcess = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", port],
    { cwd: appRoot, env: browserSmokeEnv(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  let output = "";
  serverProcess.stdout.on("data", (chunk) => (output += chunk.toString()));
  serverProcess.stderr.on("data", (chunk) => (output += chunk.toString()));
  try {
    await waitForServer(serverProcess, () => output);
    await run();
  } finally {
    await stopServer(serverProcess);
  }
}

async function waitForServer(serverProcess, getOutput) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    if (serverProcess.exitCode !== null) throw new Error(`Next.js exited before smoke.\n${getOutput()}`);
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {
      // Wait for the local server to start.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Timed out waiting for Next.js at ${baseUrl}.\n${getOutput()}`);
}

async function stopServer(serverProcess) {
  if (!serverProcess.pid || serverProcess.exitCode !== null || serverProcess.signalCode !== null) return;
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  await new Promise((resolvePromise) => {
    serverProcess.once("exit", resolvePromise);
    serverProcess.kill("SIGTERM");
  });
}

await withNextServer(runBrowserProof);
console.log("PASS atas de RH: escopo de departamento, criação, histórico e proteção do dossiê");
