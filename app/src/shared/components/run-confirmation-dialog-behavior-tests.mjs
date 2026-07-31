import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const TEST_PORT = process.env.CONFIRMATION_DIALOG_TEST_PORT || "3113";
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const appRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixtureRoot = fileURLToPath(
  new URL("./confirmation-dialog-test-fixture", import.meta.url),
);
const failures = [];

await withFixture(async (page) => {
  await runTest(
    "ConfirmationDialog keeps rejected confirmation open and shows fallback",
    async () => {
      await openConfirmation(page, { context: "fallback" });
      await page.getByRole("button", { name: "Confirmar operação" }).click();

      const alert = getDialogAlert(page);
      await alert.waitFor({ state: "visible" });
      assert.equal(
        await alert.textContent(),
        "Não foi possível confirmar a ação. Tente novamente.",
      );
      assert.equal(
        await page.getByTestId("confirmation-state").textContent(),
        "confirmation-open",
      );
    },
  );

  await runTest("ConfirmationDialog clears fallback after an external close", async () => {
    await callHarness(page, "closeConfirmation");
    await page.getByRole("heading", { name: "Confirmação fallback" }).waitFor({
      state: "hidden",
    });

    await openConfirmation(page, { context: "novo contexto" });

    assert.equal(await getDialogAlert(page).count(), 0);
    assert.equal(
      await page.getByRole("heading", { name: "Confirmação novo contexto" }).isVisible(),
      true,
    );
  });

  await runTest("ConfirmationDialog prioritizes the consumer error after rejection", async () => {
    await callHarness(page, "closeConfirmation");
    await openConfirmation(page, {
      context: "erro controlado",
      errorMessage: "Erro específico informado pelo consumidor.",
    });
    await page.getByRole("button", { name: "Confirmar operação" }).click();

    const alert = getDialogAlert(page);
    await alert.waitFor({ state: "visible" });
    assert.equal(await alert.textContent(), "Erro específico informado pelo consumidor.");
    assert.equal(
      await page.getByText("Não foi possível confirmar a ação. Tente novamente.").count(),
      0,
    );
  });

  await runTest("ConfirmationDialog blocks cancel, Escape and overlay while loading", async () => {
    await callHarness(page, "closeConfirmation");
    await openConfirmation(page, { context: "loading", loading: true });

    const cancelButton = page.getByRole("button", { name: "Cancelar operação" });
    const confirmButton = page.getByRole("button", { name: "Confirmando..." });
    assert.equal(await cancelButton.isDisabled(), true);
    assert.equal(await confirmButton.isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Fechar" }).isDisabled(), true);

    await cancelButton.dispatchEvent("click");
    await page.keyboard.press("Escape");
    await clickOpenOverlay(page);

    assert.equal(
      await page.getByRole("heading", { name: "Confirmação loading" }).isVisible(),
      true,
    );
    assert.equal(
      await page.getByTestId("confirmation-state").textContent(),
      "confirmation-open",
    );
  });

  await runTest(
    "Dialog with preventClose false preserves Escape and overlay dismissal",
    async () => {
      await callHarness(page, "closeConfirmation");
      await callHarness(page, "openNormalDialog");
      await page
        .getByRole("heading", { name: "Diálogo normal" })
        .waitFor({ state: "visible" });

      await page.keyboard.press("Escape");
      await page
        .getByRole("heading", { name: "Diálogo normal" })
        .waitFor({ state: "hidden" });
      assert.equal(
        await page.getByTestId("normal-dialog-state").textContent(),
        "normal-closed",
      );

      await callHarness(page, "openNormalDialog");
      await page
        .getByRole("heading", { name: "Diálogo normal" })
        .waitFor({ state: "visible" });
      await clickOpenOverlay(page);
      await page
        .getByRole("heading", { name: "Diálogo normal" })
        .waitFor({ state: "hidden" });
      assert.equal(
        await page.getByTestId("normal-dialog-state").textContent(),
        "normal-closed",
      );
    },
  );
});

if (failures.length > 0) {
  throw new AggregateError(failures, `${failures.length} teste(s) comportamental(is) falharam.`);
}

async function runTest(name, test) {
  try {
    await test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    failures.push(error);
  }
}

async function openConfirmation(page, options) {
  await callHarness(page, "openConfirmation", options);
  await page
    .getByRole("heading", { name: `Confirmação ${options.context}` })
    .waitFor({ state: "visible" });
}

async function callHarness(page, method, argument) {
  await page.evaluate(
    ({ argument: nextArgument, method: nextMethod }) => {
      window.confirmationDialogHarness[nextMethod](nextArgument);
    },
    { argument, method },
  );
}

function getDialogAlert(page) {
  return page.locator('p[role="alert"]:not(#__next-route-announcer__)');
}

async function clickOpenOverlay(page) {
  await page.mouse.click(5, 5);
}

async function withFixture(run) {
  const server = spawn(
    "pnpm",
    ["exec", "next", "dev", fixtureRoot, "--webpack", "--port", TEST_PORT],
    {
      cwd: appRoot,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";

  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    await waitForServer(server, () => serverOutput);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean(window.confirmationDialogHarness));
      await run(page);
    } finally {
      await browser.close();
    }
  } finally {
    server.kill("SIGTERM");
  }
}

async function waitForServer(server, getOutput) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 45_000) {
    if (server.exitCode !== null) {
      throw new Error(`Fixture Next encerrou antes do teste.\n${getOutput()}`);
    }

    try {
      const response = await fetch(BASE_URL);
      if (response.ok) {
        return;
      }
    } catch {
      // Aguarda a fixture ficar disponível.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Tempo esgotado aguardando a fixture Next.\n${getOutput()}`);
}
