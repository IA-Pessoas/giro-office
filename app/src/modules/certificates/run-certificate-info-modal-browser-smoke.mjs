import assert from "node:assert/strict";

import { chromium } from "@playwright/test";

const baseUrl = process.env.CERTIFICATE_INFO_SMOKE_BASE_URL || "http://127.0.0.1:5177";

const smokeUser = {
  id: "user-certificate-info-smoke",
  name: "Certificate Info Smoke",
  login: "certificate.info.smoke@castelo.test",
  permission: 0,
  organization_id: "org-smoke",
  type: "user",
  modules: { certificado: 3 },
};

async function installApiMocks(page) {
  await page.route("**/user/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: smokeUser }),
    });
  });

  for (const endpoint of [
    "**/certificate/pj/list*",
    "**/certificate/pf/list*",
    "**/certificate/notifications*",
  ]) {
    await page.route(endpoint, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: [] }),
      });
    });
  }

  await page.route("**/socket.io/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
}

async function assertHelpTooltipsStayInsideDialog(page, expectedHelpCount) {
  const dialog = page.getByRole("dialog");
  const helpButtons = dialog.getByRole("button", { name: /^Ajuda:/ });

  assert.equal(await helpButtons.count(), expectedHelpCount);

  for (let index = 0; index < expectedHelpCount; index += 1) {
    const helpButton = helpButtons.nth(index);
    await helpButton.focus();
    assert.equal(
      await helpButton.evaluate((element) => document.activeElement === element),
      true,
      "Certificate help buttons must be reachable by keyboard focus.",
    );

    const tooltip = page.getByRole("tooltip").last();
    await tooltip.waitFor({ state: "visible", timeout: 10_000 });
    await helpButton.hover();
    assert.equal(await tooltip.isVisible(), true, "Certificate help tooltips should open on mouse hover.");

    assert.equal(
      await tooltip.evaluate((element) => Boolean(element.closest('[role="dialog"]'))),
      true,
      "The certificate help tooltip must remain inside the open dialog.",
    );

    const [dialogBox, tooltipBox] = await Promise.all([dialog.boundingBox(), tooltip.boundingBox()]);
    assert.ok(dialogBox, "The certificate dialog should have a visible bounding box.");
    assert.ok(tooltipBox, "The certificate help tooltip should have a visible bounding box.");
    assert.ok(tooltipBox.x >= dialogBox.x - 1, "Tooltip must not overflow the dialog on the left.");
    assert.ok(
      tooltipBox.x + tooltipBox.width <= dialogBox.x + dialogBox.width + 1,
      "Tooltip must not overflow the dialog on the right.",
    );
    assert.ok(tooltipBox.y >= dialogBox.y - 1, "Tooltip must not overflow the dialog at the top.");
    assert.ok(
      tooltipBox.y + tooltipBox.height <= dialogBox.y + dialogBox.height + 1,
      "Tooltip must not overflow the dialog at the bottom.",
    );

    assert.equal(
      await tooltip.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return [
          [0.25, 0.5],
          [0.5, 0.5],
          [0.75, 0.5],
          [0.5, 0.25],
          [0.5, 0.75],
        ].every(([x, y]) => {
          const topElement = document.elementFromPoint(
            rect.left + rect.width * x,
            rect.top + rect.height * y,
          );
          return topElement === element || element.contains(topElement);
        });
      }),
      true,
      "The certificate help tooltip must not be clipped by the dialog.",
    );
  }
}

async function assertViewport(viewport, screenshotPath) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: baseUrl, viewport });

  try {
    await context.addInitScript(() => {
      window.localStorage.setItem("workspace-theme", "light");
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
    await installApiMocks(page);
    await page.goto("/certificados", { waitUntil: "networkidle", timeout: 120_000 });

    await page.getByRole("button", { name: "Novo PJ", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await assertHelpTooltipsStayInsideDialog(page, 4);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "PF", exact: true }).click();
    await page.getByRole("button", { name: "Novo PF", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await assertHelpTooltipsStayInsideDialog(page, 3);
  } finally {
    await context.close();
    await browser.close();
  }
}

await assertViewport(
  { width: 1440, height: 900 },
  "output/playwright/issue-700-certificate-info-modal-positioning-desktop.png",
);
console.log("PASS certificate info tooltips stay inside the dialog at desktop viewport");

await assertViewport(
  { width: 390, height: 844 },
  "output/playwright/issue-700-certificate-info-modal-positioning-mobile.png",
);
console.log("PASS certificate info tooltips stay inside the dialog at mobile viewport");
