import type {
  CommercialClientProjection,
  CommercialProspectingTransitionEvent,
} from "@workspace/shared";
import { INTERNAL_SERVICE_TOKEN_HEADER, REQUEST_ID_HEADER } from "@workspace/shared/http";
import type { CommercialAudit, CommercialPrisma } from "./commercialService.js";
import type { CommercialWorkerEnv } from "./env.js";

export type CommercialEmailRecipient = {
  email: string;
  responsible?: string | null;
};

export type CommercialEmailMessage = {
  idempotencyKey: string;
  requestId: string;
  recipients: CommercialEmailRecipient[];
  subject: string;
  html: string;
};

export interface CommercialEmailAdapter {
  send(message: CommercialEmailMessage): Promise<void>;
}

export class MissingCommercialEmailAdapter implements CommercialEmailAdapter {
  constructor(
    private readonly reason = "COMMERCIAL_EMAIL_ADAPTER_URL/TOKEN/FROM não configurados.",
  ) {}

  async send(): Promise<void> {
    throw new Error(`CommercialEmailNotification pendente: ${this.reason}`);
  }
}

export class CommercialEmailHttpAdapter implements CommercialEmailAdapter {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async send(message: CommercialEmailMessage): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: this.token,
          "idempotency-key": message.idempotencyKey,
          [REQUEST_ID_HEADER]: message.requestId,
        },
        body: JSON.stringify({
          from: this.from,
          recipients: message.recipients,
          subject: message.subject,
          html: message.html,
        }),
      });
      if (!response.ok) throw new Error(`Adapter de email respondeu ${response.status}.`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createCommercialEmailAdapter(env: CommercialWorkerEnv): CommercialEmailAdapter {
  if (
    !env.COMMERCIAL_EMAIL_ADAPTER_URL ||
    !env.COMMERCIAL_EMAIL_ADAPTER_TOKEN ||
    !env.COMMERCIAL_EMAIL_FROM
  ) {
    return new MissingCommercialEmailAdapter();
  }
  return new CommercialEmailHttpAdapter(
    env.COMMERCIAL_EMAIL_ADAPTER_URL,
    env.COMMERCIAL_EMAIL_ADAPTER_TOKEN,
    env.COMMERCIAL_EMAIL_FROM,
  );
}

type EmailNotificationPrisma = Pick<CommercialPrisma, "emails" | "commercialEmailNotification">;

type EmailNotificationAudit = Pick<CommercialAudit, "createLog">;

const noopAudit: EmailNotificationAudit = { createLog: async () => {} };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function notificationMessage(
  event: CommercialProspectingTransitionEvent,
  client: CommercialClientProjection,
  competence: string,
): CommercialEmailMessage {
  const companyName = (client.company_name ?? client.name ?? "").replace(/[\r\n]+/gu, " ").trim();
  const subject = `${competence.trim() ? "CLIENTE NOVO" : "PROJETO"} - ${companyName}`.trim();
  const html = competence.trim()
    ? `<p>Novo cliente fechado para a competência ${escapeHtml(competence)}.</p>`
    : "<p>Novo cliente fechado sem competência informada.</p>";
  return {
    idempotencyKey: event.event_id,
    requestId: event.audit_correlation_id,
    recipients: [],
    subject,
    html,
  };
}

export class CommercialEmailNotificationService {
  constructor(
    private readonly prisma: EmailNotificationPrisma,
    private readonly adapter: CommercialEmailAdapter,
    private readonly audit: EmailNotificationAudit = noopAudit,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async notify(
    event: CommercialProspectingTransitionEvent,
    client: CommercialClientProjection,
    competence: string,
  ): Promise<void> {
    if (
      event.to_status !== "Fechado" ||
      client.service_unique !== false ||
      client.type_registration === "Existente"
    ) {
      return;
    }

    const notification = await this.claim(event);
    if (!notification) return;

    try {
      const recipients = (await this.prisma.emails.findMany({
        where: { organization_id: event.organization_id, new_client_sending: true },
        orderBy: [{ responsible: "asc" }, { email: "asc" }],
        select: { email: true, responsible: true },
      })) as CommercialEmailRecipient[];
      if (recipients.length === 0) {
        await this.finish(notification, "skipped", { recipients: [], reason: "NO_RECIPIENTS" });
        await this.safeAudit(event, "CommercialEmailNotificationSkipped");
        return;
      }

      const message = notificationMessage(event, client, competence);
      message.recipients = recipients;
      await this.adapter.send(message);
      await this.finish(notification, "sent", message);
      await this.safeAudit(event, "CommercialEmailNotificationSent");
    } catch (error) {
      const lastError = error instanceof Error ? error.message.slice(0, 500) : String(error);
      await this.finish(notification, "failed", { last_error: lastError });
      await this.safeAudit(event, "CommercialEmailNotificationFailed", lastError);
      throw error;
    }
  }

  private async claim(event: CommercialProspectingTransitionEvent): Promise<{
    id: string;
    attempts: number;
  } | null> {
    const staleBefore = new Date(this.now().getTime() - 120_000);
    const existing = (await this.prisma.commercialEmailNotification.findUnique?.({
      where: { event_id: event.event_id },
      select: { id: true, status: true, attempts: true, locked_at: true },
    })) as { id: string; status: string; attempts: number; locked_at: Date | null } | null;
    if (existing?.status === "sent" || existing?.status === "skipped") return null;
    if (existing) {
      const claimed = await this.prisma.commercialEmailNotification.updateMany({
        where: {
          id: existing.id,
          event_id: event.event_id,
          OR: [{ status: "failed" }, { status: "processing", locked_at: { lt: staleBefore } }],
        },
        data: {
          status: "processing",
          attempts: { increment: 1 },
          locked_at: this.now(),
          last_error: null,
        },
      });
      return claimed.count === 1 ? { id: existing.id, attempts: existing.attempts + 1 } : null;
    }
    try {
      const created = (await this.prisma.commercialEmailNotification.create({
        data: {
          event_id: event.event_id,
          organization_id: event.organization_id,
          client_id: event.client_id,
          status: "processing",
          attempts: 1,
          message: {},
          locked_at: this.now(),
        },
        select: { id: true, attempts: true },
      })) as { id: string; attempts: number };
      return created;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return null;
      }
      throw error;
    }
  }

  private async finish(
    notification: { id: string; attempts: number },
    status: "sent" | "skipped" | "failed",
    message: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.commercialEmailNotification.updateMany({
      where: { id: notification.id, status: "processing", attempts: notification.attempts },
      data: {
        status,
        message,
        locked_at: null,
        ...(status === "sent" ? { sent_at: this.now(), last_error: null } : {}),
        ...(status === "failed" ? { last_error: message.last_error } : {}),
      },
    });
  }

  private async safeAudit(
    event: CommercialProspectingTransitionEvent,
    action: string,
    error?: string,
  ): Promise<void> {
    try {
      await this.audit.createLog({
        userId: "commercial-worker",
        organizationId: event.organization_id,
        action,
        referring: "commercial.email_notification",
        referringId: event.event_id,
        changes: error ? { last_error: error } : {},
        auditCorrelationId: event.audit_correlation_id,
      });
    } catch {
      // Email state is already durable; audit availability must not erase it.
    }
  }
}
