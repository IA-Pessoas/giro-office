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
});
