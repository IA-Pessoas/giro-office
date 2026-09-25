import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

// Roda contra um app já no ar (`next start`), como o smoke do modal de certificados.
const baseUrl = process.env.TOAST_PLACEMENT_SMOKE_BASE_URL || "http://127.0.0.1:5177";

const smokeUser = {
  id: "user-toast-placement-smoke",
  name: "Toast Smoke",
  login: "toast.smoke@castelo.test",
  permission: 3,
  organization_id: "org-smoke",
  type: "admin",
  modules: { integracao: 3 },
};

async function installApiMocks(page) {
  await page.route("**/api/**", async (route) => {
    const data = route.request().url().includes("/user/me") ? smokeUser : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data }),
    });
  });
  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
}

function intersects(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const scenarios = [
  {
    name: "modal Novo cliente",
    path: "/clients",
    open: async (page) => {
      await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      return dialog;
    },
  },
  {
    // Caso da issue: o clique no Salvar de Nova integração acertava o toast.
    name: "formulário Nova integração",
    path: "/clients/integration/new",
    open: async (page) => page.locator("main"),
  },
];

async function assertToastLeavesActionsFree(viewport, scenario) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl, viewport });

  try {
    await context.addCookies([
      { name: "cw.session", value: "opaque-test-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
    ]);
    const page = await context.newPage();
    await installApiMocks(page);
    await page.goto(scenario.path, { waitUntil: "networkidle", timeout: 120_000 });

    const container = await scenario.open(page);
    const save = container.getByRole("button", { name: "Salvar", exact: true });

    // Salvar com o formulário vazio gera o mesmo toast de erro a cada clique.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await save.click();
    }
    const toasts = page.locator(".Toastify__toast");
    await toasts.first().waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    assert.equal(await toasts.count(), 1, "Mensagens idênticas não devem empilhar.");

    const toastBox = await toasts.first().boundingBox();
    for (const button of await container.getByRole("button").all()) {
      const box = await button.boundingBox();
      if (!box) continue;
      const label = (await button.getAttribute("aria-label")) || (await button.innerText());
      assert.equal(
        intersects(toastBox, box),
        false,
        `${scenario.name}: o toast cobre o botão "${label}" em ${viewport.width}x${viewport.height}.`,
      );
    }

    // O clique no Salvar continua chegando ao botão com o toast na tela.
    const saveBox = await save.boundingBox();
    const hitsSave = await save.evaluate(
      (element, point) => element.contains(document.elementFromPoint(point.x, point.y)),
      { x: saveBox.x + saveBox.width / 2, y: saveBox.y + saveBox.height / 2 },
    );
    assert.equal(hitsSave, true, "O toast não pode interceptar o clique no Salvar.");
  } finally {
    await context.close();
    await browser.close();
  }
}

for (const scenario of scenarios) {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await assertToastLeavesActionsFree(viewport, scenario);
    console.log(
      `PASS ${scenario.name}: toast não empilha nem cobre ações em ${viewport.width}x${viewport.height}`,
    );
  }
}
