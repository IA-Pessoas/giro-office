import type { ServiceBinding } from "@workspace/runtime";
import {
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
  type CommercialProspectingTransitionEvent,
} from "@workspace/shared";
import type { CommercialWorkerEnv } from "./env.js";
import type { CommercialOutboxDelivery, CommercialOutboxEventPayload } from "./outbox.js";

type CommercialDeliveryEnv = Pick<CommercialWorkerEnv, "INTERNAL_REQUEST_ORIGIN"> &
  Partial<
    Pick<
      CommercialWorkerEnv,
      | "CLIENT_SERVICE"
      | "CLIENT_SERVICE_INTERNAL_TOKEN"
      | "TASK_SERVICE"
      | "TASK_SERVICE_INTERNAL_TOKEN"
    >
  >;

async function postBinding(
  binding: ServiceBinding | undefined,
  token: string | undefined,
  requestOrigin: string | undefined,
  path: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  if (!binding || !token) throw new Error(`Binding comercial não configurada para ${path}.`);
  if (!requestOrigin)
    throw new Error("Origem interna do Worker não configurada para a entrega comercial.");
  const response = await binding.fetch(
    new Request(new URL(path, requestOrigin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-service-token": token,
      },
      body: JSON.stringify(payload),
    }),
  );
  if (!response.ok) throw new Error(`Binding comercial respondeu ${response.status} em ${path}.`);
  const body = (await response.json()) as { success?: boolean; data?: Record<string, unknown> };
  if (body.success === false || !body.data)
    throw new Error(`Resposta inválida da binding em ${path}.`);
  return body.data;
}

export class CommercialOutboxBindingDelivery implements CommercialOutboxDelivery {
  constructor(private readonly env: CommercialDeliveryEnv) {}

  async deliver(event: CommercialOutboxEventPayload): Promise<void> {
    if (event.event_type === COMMERCIAL_PROSPECTING_TRANSITION_EVENT) {
      await this.deliverProspecting(event);
      return;
    }
    if (event.event_type === COMMERCIAL_TASK_BILLING_UPDATED_EVENT) {
      await postBinding(
        this.env.TASK_SERVICE,
        this.env.TASK_SERVICE_INTERNAL_TOKEN,
        this.env.INTERNAL_REQUEST_ORIGIN,
        "/internal/commercial/task-billing",
        event,
      );
      return;
    }
    throw new Error("Tipo de evento comercial não suportado.");
  }

  private async deliverProspecting(event: CommercialProspectingTransitionEvent): Promise<void> {
    await postBinding(
      this.env.CLIENT_SERVICE,
      this.env.CLIENT_SERVICE_INTERNAL_TOKEN,
      this.env.INTERNAL_REQUEST_ORIGIN,
      "/internal/commercial/prospecting-transition",
      event,
    );
    if (event.to_status === "Fechado") {
      await postBinding(
        this.env.TASK_SERVICE,
        this.env.TASK_SERVICE_INTERNAL_TOKEN,
        this.env.INTERNAL_REQUEST_ORIGIN,
        "/internal/commercial/prospecting-close",
        event,
      );
    }
  }
}
