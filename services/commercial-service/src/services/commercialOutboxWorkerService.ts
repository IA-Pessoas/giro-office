import {
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
  type CommercialProspectingTransitionEvent,
  type CommercialTaskBillingUpdatedEvent,
} from "@workspace/shared";

export interface CommercialOutboxEventRow {
  id: string;
  payload: unknown;
  status: string;
  attempts: number;
  created_at: Date;
}

export type CommercialOutboxEventPayload =
  | CommercialProspectingTransitionEvent
  | CommercialTaskBillingUpdatedEvent;

export interface CommercialOutboxDelivery {
  deliver(event: CommercialOutboxEventPayload): Promise<void>;
}

interface CommercialOutboxEventDelegate {
  findFirst(args: Record<string, unknown>): Promise<CommercialOutboxEventRow | null>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
}

export interface CommercialOutboxWorkerPrisma {
  commercialOutboxEvent: CommercialOutboxEventDelegate;
  $transaction<T>(callback: (tx: CommercialOutboxWorkerPrisma) => Promise<T>): Promise<T>;
}

export interface CommercialOutboxWorkerOptions {
  maxAttempts?: number;
  retryBaseMs?: number;
  leaseMs?: number;
  now?: () => Date;
}

function isCommercialOutboxEvent(payload: unknown): payload is CommercialOutboxEventPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "event_id" in payload &&
    "event_type" in payload &&
    "organization_id" in payload &&
    ((payload.event_type === COMMERCIAL_PROSPECTING_TRANSITION_EVENT &&
      "client_id" in payload &&
      "to_status" in payload) ||
      (payload.event_type === COMMERCIAL_TASK_BILLING_UPDATED_EVENT &&
        "task_id" in payload &&
        "hiring_status" in payload)) &&
    "audit_correlation_id" in payload
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida na entrega.";
}

export class CommercialOutboxWorkerService {
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly leaseMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: CommercialOutboxWorkerPrisma,
    private readonly delivery: CommercialOutboxDelivery,
    options: CommercialOutboxWorkerOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.retryBaseMs = options.retryBaseMs ?? 1_000;
    this.leaseMs = options.leaseMs ?? 120_000;
    this.now = options.now ?? (() => new Date());
  }

  async processNext(): Promise<boolean> {
    const event = await this.claimNext();
    if (!event) return false;

    try {
      if (!isCommercialOutboxEvent(event.payload)) {
        throw new Error("Payload de evento comercial inválido.");
      }
      await this.delivery.deliver(event.payload);
      await this.prisma.commercialOutboxEvent.updateMany({
        where: { id: event.id, status: "processing" },
        data: {
          status: "delivered",
          processed_at: this.now(),
          locked_at: null,
          last_error: null,
        },
      });
    } catch (error) {
      await this.recordFailure(event, error);
    }
    return true;
  }

  private async claimNext(): Promise<(CommercialOutboxEventRow & { attempts: number }) | null> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      await tx.commercialOutboxEvent.updateMany({
        where: {
          status: "processing",
          locked_at: { lt: new Date(now.getTime() - this.leaseMs) },
        },
        data: {
          status: "pending",
          available_at: now,
          locked_at: null,
          last_error: "Lease de processamento expirado; evento reagendado.",
        },
      });
      const event = await tx.commercialOutboxEvent.findFirst({
        where: { status: "pending", available_at: { lte: now } },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: { id: true, payload: true, status: true, attempts: true, created_at: true },
      });
      if (!event) return null;

      const claimed = await tx.commercialOutboxEvent.updateMany({
        where: { id: event.id, status: "pending" },
        data: { status: "processing", locked_at: now, attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) return null;
      return { ...event, attempts: event.attempts + 1 };
    });
  }

  private async recordFailure(
    event: CommercialOutboxEventRow & { attempts: number },
    error: unknown,
  ): Promise<void> {
    const terminal = event.attempts >= this.maxAttempts;
    const delay = this.retryBaseMs * 2 ** Math.max(0, event.attempts - 1);
    await this.prisma.commercialOutboxEvent.updateMany({
      where: { id: event.id, status: "processing" },
      data: {
        status: terminal ? "failed" : "pending",
        available_at: new Date(this.now().getTime() + Math.min(delay, 60_000)),
        locked_at: null,
        last_error: errorMessage(error),
      },
    });
  }
}
