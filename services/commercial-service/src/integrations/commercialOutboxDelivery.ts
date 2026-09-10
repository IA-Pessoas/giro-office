import {
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
  type CommercialProspectingTransitionEvent,
  type CommercialTaskBillingUpdatedEvent,
} from "@workspace/shared";
import type {
  CommercialOutboxDelivery,
  CommercialOutboxEventPayload,
} from "../services/commercialOutboxWorkerService.js";
import type { ClientProjectionDelivery } from "./clientProjection.js";
import type { TaskProjectionDelivery } from "./taskProjection.js";

export class CommercialOutboxHttpDelivery implements CommercialOutboxDelivery {
  constructor(
    private readonly clientProjection: ClientProjectionDelivery,
    private readonly taskProjection: TaskProjectionDelivery,
  ) {}

  async deliver(event: CommercialOutboxEventPayload): Promise<void> {
    if (event.event_type === COMMERCIAL_PROSPECTING_TRANSITION_EVENT) {
      await this.clientProjection.deliver(event as CommercialProspectingTransitionEvent);
      return;
    }
    if (event.event_type === COMMERCIAL_TASK_BILLING_UPDATED_EVENT) {
      await this.taskProjection.deliver(event as CommercialTaskBillingUpdatedEvent);
      return;
    }
    throw new Error("Tipo de evento comercial não suportado.");
  }
}
