import { expect, it, vi } from "vitest";
import { CommercialOutboxBindingDelivery } from "./outboxDelivery.js";

const EVENT = {
  event_id: "10000000-0000-4000-8000-000000000001",
  event_type: "commercial.task_billing.updated" as const,
  event_version: 1 as const,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  task_id: "b0000000-0000-4000-8000-000000000001",
  hiring_status: "Contratado" as const,
  payment: null,
  billing_description: null,
  audit_correlation_id: "audit-1",
  occurred_at: "2026-09-22T00:00:00.000Z",
};

it("entrega billing pela binding do task-service com token interno", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: { applied: true } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  const delivery = new CommercialOutboxBindingDelivery({
    INTERNAL_REQUEST_ORIGIN: "https://commercial.test",
    TASK_SERVICE_INTERNAL_TOKEN: "task-token",
    TASK_SERVICE: { fetch },
  });

  await delivery.deliver(EVENT);

  expect(fetch).toHaveBeenCalledOnce();
  const [request] = fetch.mock.calls[0] as [Request];
  expect(new URL(request.url).pathname).toBe("/internal/commercial/task-billing");
  expect(request.headers.get("x-internal-service-token")).toBe("task-token");
  expect(request.headers.get("x-request-id")).toBe(EVENT.audit_correlation_id);
});

it("preserva o envelope de prospecção fechada e aciona a notificação canônica", async () => {
  const clientFetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        data: {
          event_id: "10000000-0000-4000-8000-000000000002",
          applied: true,
          duplicate: false,
          client_id: "c0000000-0000-4000-8000-000000000001",
          client: {
            id: "c0000000-0000-4000-8000-000000000001",
            name: "Cliente",
            company_name: "Cliente SA",
            fantasy_name: null,
            service_unique: false,
            type_registration: "Novo",
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  const taskFetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        data: {
          event_id: "10000000-0000-4000-8000-000000000002",
          client_id: "c0000000-0000-4000-8000-000000000001",
          competence: "2026-09",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  const notification = { notify: vi.fn().mockResolvedValue(undefined) };
  const event = {
    event_id: "10000000-0000-4000-8000-000000000002",
    event_type: "commercial.prospecting.transition" as const,
    event_version: 1 as const,
    organization_id: "a0000000-0000-4000-8000-000000000001",
    client_id: "c0000000-0000-4000-8000-000000000001",
    prospecting_id: "d0000000-0000-4000-8000-000000000001",
    from_status: "Envio de Proposta" as const,
    to_status: "Fechado" as const,
    status_date: "2026-09-22T00:00:00.000Z",
    description: null,
    audit_correlation_id: "request-closed-1",
    occurred_at: "2026-09-22T00:00:00.000Z",
  };
  const delivery = new CommercialOutboxBindingDelivery(
    {
      INTERNAL_REQUEST_ORIGIN: "https://commercial.test",
      CLIENT_SERVICE_INTERNAL_TOKEN: "client-token",
      CLIENT_SERVICE: { fetch: clientFetch },
      TASK_SERVICE_INTERNAL_TOKEN: "task-token",
      TASK_SERVICE: { fetch: taskFetch },
    },
    notification,
  );

  await delivery.deliver(event);

  expect(notification.notify).toHaveBeenCalledWith(
    event,
    expect.objectContaining({ id: event.client_id, type_registration: "Novo" }),
    "2026-09",
  );
  for (const fetch of [clientFetch, taskFetch]) {
    const [request] = fetch.mock.calls[0] as [Request];
    expect(request.headers.get("x-request-id")).toBe(event.audit_correlation_id);
  }
});
