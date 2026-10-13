import { execFileSync, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";

import { browserSmokeEnv } from "../../shared/testing/browserSmokeEnv.mjs";

const port = process.env.RH_LIFE_PROJECT_PORT || "3136";
const configuredBaseUrl = process.env.RH_LIFE_PROJECT_BASE_URL?.replace(/\/$/, "");
const baseUrl = configuredBaseUrl || `http://127.0.0.1:${port}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const repositoryRoot = resolve(appRoot, "..");
const screenshotDir = resolve(repositoryRoot, "output/playwright/issue-1906");
const currentYear = new Date().getFullYear();

const user = {
  id: "rh-life-project-smoke-user",
  name: "Ana QA Projeto de Vida",
  login: "rh.life-project.smoke",
  permission: 1,
  department_id: "rh-life-project-smoke-department",
  organization_id: "rh-life-project-smoke-organization",
  type: "user",
  modules: { rh: 1 },
};

let project = null;
let nextObjectiveId = 1;

function success(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data }),
  });
}

function projectWithProgress() {
  const objectives = project.objectives;
  const completedObjectiveCount = objectives.filter((objective) => objective.status === "Realized").length;
  return {
    ...project,
    objective_count: objectives.length,
    completed_objective_count: completedObjectiveCount,
    progress: objectives.length === 0 ? 0 : completedObjectiveCount / objectives.length,
  };
}

async function installApiMocks(page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.startsWith("/api/") ? url.pathname.slice(4) : null;
    if (!apiPath) return route.continue();

    if (request.method() === "GET" && apiPath === "/user/me") return success(route, user);
    if (request.method() === "POST" && apiPath === "/user/session/refresh") return success(route, user);
    if (request.method() === "GET" && apiPath === "/rh/requests") {
      return success(route, { items: [], total: 0, page: 1, pageSize: 20, hasMore: false });
    }
    if (apiPath === "/rh/life-projects" && request.method() === "GET") {
      return success(route, project ? projectWithProgress() : null);
    }
    if (apiPath === "/rh/life-projects" && request.method() === "POST") {
      project = {
        id: "rh-life-project-smoke-project",
        organization_id: user.organization_id,
        user_id: user.id,
        year: JSON.parse(request.postData() ?? "{}").year,
        life_story: "",
        company_story: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        objectives: [],
      };
      return success(route, projectWithProgress(), 201);
    }
    if (apiPath === `/rh/life-projects/${project?.id}` && request.method() === "PATCH") {
      Object.assign(project, JSON.parse(request.postData() ?? "{}"));
      return success(route, projectWithProgress());
    }
    if (
      project &&
      apiPath === `/rh/life-projects/${project.id}/objectives` &&
      request.method() === "POST"
    ) {
      const input = JSON.parse(request.postData() ?? "{}");
      project.objectives.push({
        id: `rh-life-project-smoke-objective-${nextObjectiveId++}`,
        organization_id: user.organization_id,
        project_id: project.id,
        title: input.title,
        forecast_date: input.forecast_date ?? null,
        completed_at: null,
        status: "ToDo",
        rh_observations: "",
        employee_observations: "",
      });
      return success(route, projectWithProgress(), 201);
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
    { name: "cw.session", value: "rh-life-project-smoke-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    { name: "cw.csrf", value: "rh-life-project-smoke-csrf", url: baseUrl, sameSite: "Lax" },
  ]);

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installApiMocks(page);

  try {
    await page.goto("/rh", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("tab", { name: "Projeto de Vida", exact: true }).waitFor({ timeout: 60_000 });
    await page.getByRole("tab", { name: "Projeto de Vida", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Projeto de Vida", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: `Sem projeto para ${currentYear}` })).toBeVisible();
    await page.screenshot({ path: resolve(screenshotDir, "rh-life-project-empty.png"), fullPage: true });

    await page.getByRole("button", { name: "Criar projeto anual" }).click();
    await expect(page.getByRole("heading", { name: "Histórias" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Progresso dos objetivos" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await page.getByLabel("História de vida").fill("Uma trajetória com propósito.");
    await page.getByLabel("História na empresa").fill("Crescimento junto da equipe.");
    await page.getByRole("button", { name: "Salvar histórias" }).click();

    await page.getByLabel("Novo objetivo").fill("Concluir formação profissional");
    await page.getByLabel("Previsão").fill(`${currentYear}-12-15`);
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByLabel("Objetivo", { exact: true })).toHaveValue(
      "Concluir formação profissional",
    );
    await expect(page.getByText("1 objetivo", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Novo objetivo")).toHaveValue("");
    await expect(page.getByRole("progressbar", { name: "Progresso dos objetivos" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await page.screenshot({ path: resolve(screenshotDir, "rh-life-project-objective.png"), fullPage: true });

    expect(pageErrors).toEqual([]);
  } finally {
    await browser.close();
  }
}

async function withNextServer(run) {
  if (configuredBaseUrl) {
    await run();
    return;
  }

  const nextBin = resolve(appRoot, "node_modules/next/dist/bin/next");
  const serverProcess = spawn(
    process.execPath,
    [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", port],
    {
      cwd: appRoot,
      env: browserSmokeEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
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
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next.js exited before the browser smoke.\n${getOutput()}`);
    }

    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {
      // Wait until the local Next server accepts connections.
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
console.log("PASS Projeto de Vida anual: vazio, criação, histórias e objetivo com progresso inicial zero");
