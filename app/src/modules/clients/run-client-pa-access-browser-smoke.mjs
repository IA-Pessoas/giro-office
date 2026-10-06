import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const baseURL = process.env.PA_ACCESS_SMOKE_BASE_URL ?? "http://127.0.0.1:3117";
const outputDirectory = fileURLToPath(new URL("../../../../output/playwright/issue-1596/", import.meta.url));
await mkdir(outputDirectory, { recursive: true });

const clientId = "770e8400-e29b-41d4-a716-446655440001";
const client = { id: clientId, name: "Cliente de teste", company_name: "Cliente de teste", type: "PJ" };
const pa = {
  client_id: clientId,
  activities: "Atividade de teste",
  client: { company_name: client.company_name, responsible: "Equipe de teste", email: "teste@example.invalid" },
};
const baseUser = {
  id: "user-pa-smoke",
  name: "Usuário de teste",
  login: "pa.smoke@example.invalid",
  permission: 0,
  organization_id: "organization-pa-smoke",
  department_id: null,
  status: "Ativo",
  version: 1,
  type: "user",
};

const browser = await chromium.launch({ headless: true });
try {
  const anonymous = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto(`/clients/${clientId}/pa`, { waitUntil: "domcontentloaded" });
  await anonymousPage.waitForURL("**/login");
  await anonymousPage.screenshot({ path: `${outputDirectory}pa-sem-sessao.png`, fullPage: true });
  await anonymous.close();

  const cases = [
    { name: "pessoal-0-negado", modules: { integracao: 1, pessoal: 0 }, apiAllowed: false },
    { name: "pessoal-1-api-negada", modules: { integracao: 1, pessoal: 1 }, apiAllowed: false },
    { name: "pessoal-1-comercial-1", modules: { integracao: 1, pessoal: 1, comercial: 1 }, apiAllowed: true },
  ];

  for (const scenario of cases) {
    const authenticated = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
    await authenticated.addCookies([
      { name: "cw.session", value: "opaque-pa-smoke-session", url: baseURL, httpOnly: true, sameSite: "Lax" },
    ]);
    const page = await authenticated.newPage();
    let paReads = 0;
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let data = [];
      if (pathname.endsWith("/user/me")) {
        data = { ...baseUser, modules: scenario.modules };
      }
      if (pathname.endsWith(`/client/${clientId}`) || pathname.endsWith(`/client/${clientId}/pa`)) {
        if (!scenario.apiAllowed) {
          await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ success: false, error: "Acesso negado" }) });
          return;
        }
      }
      if (pathname.endsWith(`/client/${clientId}`)) data = client;
      if (pathname.endsWith(`/client/${clientId}/pa`)) {
        paReads += 1;
        data = { detail: pa };
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
    });
    await page.route("**/socket.io/**", (route) => route.fulfill({ status: 200, body: "ok" }));
    await page.goto(`/clients/${clientId}/pa`, { waitUntil: "domcontentloaded" });
    if (scenario.modules.pessoal === 0) {
      await page.getByRole("heading", { name: "Acesso indisponível" }).waitFor();
    } else if (!scenario.apiAllowed) {
      await page.getByText("Não foi possível carregar o cliente para o fluxo de PA.").waitFor();
    } else {
      await page.getByRole("heading", { name: "PA de Cliente de teste" }).waitFor();
      await page.getByRole("textbox", { name: "Atividades" }).waitFor();
      assert.equal(await page.getByRole("textbox", { name: "Atividades" }).inputValue(), pa.activities);
      assert.ok(paReads > 0, "a página deve consultar o PA pela API");
    }
    await page.screenshot({ path: `${outputDirectory}pa-${scenario.name}.png`, fullPage: true });
    await authenticated.close();
  }

  console.log("PASS PA: sem sessão redireciona; Pessoal 0 é negado pela tela; Pessoal 1 isolado recebe 403; Pessoal 1 + Comercial 1 consulta o PA");
} finally {
  await browser.close();
}
