import type { CommercialProspectingTransitionEvent } from "@workspace/shared";
import { describe, expect, it, vi } from "vitest";
import { CommercialOutboxHttpDelivery } from "../integrations/commercialOutboxDelivery.js";

const EVENT: CommercialProspectingTransitionEvent = {
  event_id: "10000000-0000-4000-8000-000000000001",
  event_type: "commercial.prospecting.transition",
  event_version: 1,
  organization_id: "a0000000-0000-4000-8000-000000000001",
  client_id: "b0000000-0000-4000-8000-000000000001",
  prospecting_id: "c0000000-0000-4000-8000-000000000001",
  from_status: "Análise/Agendamento",
  to_status: "Baixada",
  status_date: "2026-09-10T12:00:00.000Z",
  description: null,
  audit_correlation_id: "audit-1",
  occurred_at: "2026-09-10T12:00:00.000Z",
};

describe("CommercialOutboxHttpDelivery", () => {
  it("projeta no cliente e aplica efeitos de tarefa para status não terminais", async () => {
    const client = { deliver: vi.fn().mockResolvedValue({ client: { id: EVENT.client_id } }) };
    const taskProjection = { deliver: vi.fn() };
    const taskClose = { deliver: vi.fn() };
    const notifications = { notify: vi.fn() };
    const taskTransition = { deliver: vi.fn() };
    const delivery = new CommercialOutboxHttpDelivery(
      client as never,
      taskProjection as never,
      taskClose,
      notifications,
      taskTransition,
    );

    await delivery.deliver(EVENT);

    expect(client.deliver).toHaveBeenCalledWith(EVENT);
    expect(taskTransition.deliver).toHaveBeenCalledWith(EVENT);
    expect(taskClose.deliver).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it("não aplica efeitos de tarefa ao cadastrar uma prospecção já em uma situação", async () => {
    const event = { ...EVENT, from_status: null };
    const client = { deliver: vi.fn().mockResolvedValue({ client: { id: EVENT.client_id } }) };
    const taskProjection = { deliver: vi.fn() };
    const taskTransition = { deliver: vi.fn() };
    const delivery = new CommercialOutboxHttpDelivery(
      client as never,
      taskProjection as never,
      undefined,
      undefined,
      taskTransition,
    );

    await delivery.deliver(event);

    expect(client.deliver).toHaveBeenCalledWith(event);
    expect(taskTransition.deliver).not.toHaveBeenCalled();
  });

  it("mantém Fechado no fluxo existente de fechamento e aviso", async () => {
    const event = { ...EVENT, to_status: "Fechado" as const };
    const client = { deliver: vi.fn().mockResolvedValue({ client: { id: EVENT.client_id } }) };
    const taskProjection = { deliver: vi.fn() };
    const taskClose = { deliver: vi.fn().mockResolvedValue({ competence: "2026-10" }) };
    const notifications = { notify: vi.fn() };
    const taskTransition = { deliver: vi.fn() };
    const delivery = new CommercialOutboxHttpDelivery(
      client as never,
      taskProjection as never,
      taskClose,
      notifications,
      taskTransition,
    );

    await delivery.deliver(event);

    expect(taskClose.deliver).toHaveBeenCalledWith(event);
    expect(notifications.notify).toHaveBeenCalledWith(event, { id: EVENT.client_id }, "2026-10");
    expect(taskTransition.deliver).not.toHaveBeenCalled();
  });
});
