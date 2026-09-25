import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

// Roda contra um app já no ar (`next start`), como o smoke do modal de certificados.
const baseUrl = process.env.OVERLAY_FIRST_CLICK_SMOKE_BASE_URL || "http://127.0.0.1:5177";

const MODULE_KEYS = [
  "certificado",
  "comercial",
  "contabil",
  "financeiro",
  "fiscal",
  "integracao",
  "marketing",
  "parcelamento",
  "pessoal",
  "regularize",
  "rh",
  "ti",
  "triagem",
];

const smokeUser = {
  id: "user-overlay-first-click-smoke",
  name: "Overlay Smoke",
  login: "overlay.smoke@castelo.test",
  permission: 3,
  organization_id: "org-smoke",
  type: "admin",
  modules: Object.fromEntries(MODULE_KEYS.map((moduleKey) => [moduleKey, 3])),
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

/**
 * Abre um overlay, fecha e clica no alvo logo em seguida, sem esperar animação.
 * Falha se algum elemento (backdrop, overlay em saída, `body { pointer-events: none }`)
 * estiver na frente do alvo ou se o clique não chegar nele.
 */
async function assertFirstClickReachesTarget(page, { name, target, open, close }) {
  // O alvo é resolvido antes de abrir: com o modal aberto o Radix o esconde da árvore de acessibilidade.
  const targetHandle = await target.elementHandle();
  assert.ok(targetHandle, `${name}: alvo não encontrado.`);
  const box = await targetHandle.boundingBox();
  assert.ok(box, `${name}: alvo sem área visível.`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await open();
  await close();

  const hitReachesTarget = await page.evaluate(
    ({ element, x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return (
        getComputedStyle(document.body).pointerEvents !== "none" &&
        Boolean(hit) &&
        (hit === element || element.contains(hit))
      );
    },
    { element: targetHandle, ...point },
  );
  assert.equal(hitReachesTarget, true, `${name}: um elemento invisível intercepta o clique após fechar.`);

  await page.evaluate((element) => {
    window.__overlaySmokeClicked = false;
    element.addEventListener(
      "click",
      () => {
        window.__overlaySmokeClicked = true;
      },
      { capture: true, once: true },
    );
  }, targetHandle);
  await page.mouse.click(point.x, point.y);
  assert.equal(
    await page.evaluate(() => window.__overlaySmokeClicked),
    true,
    `${name}: o primeiro clique após fechar não chegou ao alvo.`,
  );
  console.log(`PASS ${name}`);
}

async function openDialogWith(page, buttonName) {
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
}

async function goto(page, path, readyLocator) {
  await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
  await readyLocator.waitFor({ state: "visible", timeout: 60_000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });

try {
  await context.addInitScript(() => {
    window.localStorage.setItem("workspace-theme", "light");
  });
  await context.addCookies([
    { name: "cw.session", value: "opaque-test-session", url: baseUrl, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  await installApiMocks(page);
  const pressEscape = () => page.keyboard.press("Escape");

  await goto(page, "/certificados", page.getByRole("button", { name: "Novo PJ", exact: true }));
  await assertFirstClickReachesTarget(page, {
    name: "Certificados: fechar modal Novo PJ com Esc e clicar na aba PF",
    target: page.getByRole("button", { name: "PF", exact: true }),
    open: () => openDialogWith(page, "Novo PJ"),
    close: pressEscape,
  });

  await goto(page, "/rh", page.getByRole("button", { name: "Gerenciar feriados", exact: true }));
  await assertFirstClickReachesTarget(page, {
    name: "RH: fechar Gerenciar feriados com Esc e clicar em Solicitações",
    target: page.getByRole("button", { name: "Solicitações", exact: true }),
    open: () => openDialogWith(page, "Gerenciar feriados"),
    close: pressEscape,
  });

  await goto(page, "/clients", page.getByRole("button", { name: "Novo cliente", exact: true }));
  await assertFirstClickReachesTarget(page, {
    name: "Clientes: fechar Novo cliente no X e reabrir no primeiro clique",
    target: page.getByRole("button", { name: "Novo cliente", exact: true }),
    open: () => openDialogWith(page, "Novo cliente"),
    close: () => page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click(),
  });

  await goto(page, "/parcelamento", page.getByRole("button", { name: "Selecionar cliente", exact: true }));
  await assertFirstClickReachesTarget(page, {
    name: "Parcelamento: fechar Selecionar cliente com Esc e clicar na aba Parcelamentos",
    target: page.getByRole("tab", { name: "Parcelamentos" }),
    open: () => openDialogWith(page, "Selecionar cliente"),
    close: pressEscape,
  });

  await goto(page, "/tecnologia", page.getByRole("tab", { name: "Ramais" }));
  await assertFirstClickReachesTarget(page, {
    name: "Tecnologia: sino de notificações aberto não engole o clique na aba Ramais",
    target: page.getByRole("tab", { name: "Ramais" }),
    open: () => page.getByRole("button", { name: "Abrir notificações" }).click(),
    close: async () => {},
  });

  await assertFirstClickReachesTarget(page, {
    name: "Tecnologia: menu do usuário aberto não engole o clique na aba Senhas",
    target: page.getByRole("tab", { name: "Senhas" }),
    open: () => page.getByRole("button", { name: /Overlay Smoke/ }).click(),
    close: async () => {},
  });

  await assertFirstClickReachesTarget(page, {
    name: "Tecnologia: sidebar recebe o clique logo após fechar notificações com Esc",
    target: page.locator("aside").getByRole("link", { name: "Clientes", exact: true }),
    open: () => page.getByRole("button", { name: "Abrir notificações" }).click(),
    close: pressEscape,
  });
} finally {
  await context.close();
  await browser.close();
}
