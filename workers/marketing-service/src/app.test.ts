import { describe, expect, it, vi } from "vitest";
import { createMarketingWorkerApp, type MarketingServices } from "./app.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const EVENT_ID = "e0000000-0000-4000-8000-000000000001";
const INTERNAL_TOKEN = "marketing-gateway-internal-token";

function services() {
  const passwords = { list: vi.fn(async () => [{ id: "p-1" }]) };
  return {
    dashboard: {
      getDashboard: vi.fn(async () => ({ alerts: [] })),
      getMonthlyBirthdays: vi.fn(async () => ({ month: 5 })),
      getMarketingStock: vi.fn(async () => ({ items: [] })),
    },
    controls: {},
    events: {
      updateEvent: vi.fn(async () => null),
      listEvents: vi.fn(async () => []),
    },
    editions: { listEditions: vi.fn(async () => []) },
    passwords: () => passwords,
  } as unknown as MarketingServices;
}

function setup() {
  const s = services();
  const app = createMarketingWorkerApp({
    env: { JWT_SECRET: "marketing-worker-secret", INTERNAL_SERVICE_TOKEN: INTERNAL_TOKEN },
    services: s,
  });
  return { app, s };
}

function gateway(modules: Record<string, number>, type = "user"): HeadersInit {
  return {
    "content-type": "application/json",
    "x-internal-service-token": INTERNAL_TOKEN,
    "x-auth-user-id": "user-1",
    "x-auth-organization-id": ORGANIZATION_ID,
    "x-auth-kind": "organization",
    "x-auth-type": type,
    "x-auth-modules": JSON.stringify(modules),
  };
}

describe("marketing Worker", () => {
  it("serve o dashboard para leitor do módulo", async () => {
    const { app, s } = setup();
    const response = await app.request("/marketing/dashboard", {
      headers: gateway({ marketing: 1 }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { alerts: [] } });
    expect(s.dashboard.getDashboard).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it("serve os aniversariantes do mês escolhido e recusa mês inválido", async () => {
    const { app, s } = setup();
    const response = await app.request("/marketing/birthdays?month=5", {
      headers: gateway({ marketing: 1 }),
    });
    const invalid = await app.request("/marketing/birthdays?month=13", {
      headers: gateway({ marketing: 1 }),
    });

    expect(response.status).toBe(200);
    expect(s.dashboard.getMonthlyBirthdays).toHaveBeenCalledWith(ORGANIZATION_ID, 5);
    expect(invalid.status).toBe(400);
    expect(s.dashboard.getMonthlyBirthdays).toHaveBeenCalledTimes(1);
  });

  it("serve o estoque do Marketing só para quem tem o módulo Marketing", async () => {
    const { app, s } = setup();
    const response = await app.request("/marketing/stock", { headers: gateway({ marketing: 1 }) });
    const tiOnly = await app.request("/marketing/stock", { headers: gateway({ ti: 2 }) });

    expect(response.status).toBe(200);
    expect(s.dashboard.getMarketingStock).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(tiOnly.status).toBe(403);
  });

  it("serve as rotas de credenciais, eventos e edições", async () => {
    const { app } = setup();
    for (const path of [
      "/marketing/passwords/list",
      "/marketing/events/list",
      `/marketing/events/${EVENT_ID}/editions`,
    ]) {
      const response = await app.request(path, { headers: gateway({ marketing: 1 }) });
      expect(response.status, path).toBe(200);
    }
  });

  it("nega sem permissão do módulo e escrita para leitor", async () => {
    const { app } = setup();
    const none = await app.request("/marketing/dashboard", { headers: gateway({ ti: 2 }) });
    const write = await app.request(`/marketing/events/${EVENT_ID}`, {
      method: "PUT",
      headers: gateway({ marketing: 1 }),
      body: JSON.stringify({ name: "Feira" }),
    });

    expect(none.status).toBe(403);
    expect(write.status).toBe(403);
  });

  it("owner passa sem claim do módulo, como no gateway", async () => {
    const { app } = setup();
    const response = await app.request("/marketing/dashboard", {
      headers: gateway({}, "owner"),
    });
    expect(response.status).toBe(200);
  });

  it("responde 404 quando o evento não existe", async () => {
    const { app } = setup();
    const response = await app.request(`/marketing/events/${EVENT_ID}`, {
      method: "PUT",
      headers: gateway({ marketing: 2 }),
      body: JSON.stringify({ name: "Feira" }),
    });
    expect(response.status).toBe(404);
  });

  it("atribui a alteração ao usuário autenticado", async () => {
    const { app, s } = setup();
    await app.request(`/marketing/events/${EVENT_ID}`, {
      method: "PUT",
      headers: gateway({ marketing: 2 }),
      body: JSON.stringify({ name: "Feira" }),
    });
    expect(s.events.updateEvent).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      EVENT_ID,
      { name: "Feira" },
      "user-1",
    );
  });

  it("recusa requisição sem autenticação", async () => {
    const { app } = setup();
    expect((await app.request("/marketing/dashboard")).status).toBe(401);
  });
});
