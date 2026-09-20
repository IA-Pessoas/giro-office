import {
  type CommercialClientProjection,
  type CommercialProspectingTransitionEvent,
  error as logError,
} from "@workspace/shared";

import * as commercialAudit from "../integrations/audit.js";
import type {
  CommercialEmailAdapter,
  CommercialEmailRecipient,
} from "../integrations/commercialEmailAdapter.js";

interface CommercialEmailNotificationRow {
  id: string;
  status: string;
  attempts: number;
  locked_at?: Date | null;
}

interface CommercialEmailNotificationDelegate {
  findUnique(args: Record<string, unknown>): Promise<CommercialEmailNotificationRow | null>;
  create(args: Record<string, unknown>): Promise<CommercialEmailNotificationRow>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
}

interface EmailDelegate {
  findMany(args: {
    where: { organization_id: string; new_client_sending: boolean };
    select: { email: true; responsible: true };
    orderBy: { email: "asc" };
  }): Promise<Array<{ email: string; responsible: string }>>;
}

export interface CommercialEmailNotificationPrisma {
  emails: EmailDelegate;
  commercialEmailNotification: CommercialEmailNotificationDelegate;
  $transaction<T>(callback: (tx: CommercialEmailNotificationPrisma) => Promise<T>): Promise<T>;
}

export interface CommercialEmailNotificationAudit {
  createLog: typeof commercialAudit.createLog;
}

const defaultAudit: CommercialEmailNotificationAudit = commercialAudit;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida no envio.";
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );
}

function buildEmailHtml(competence: string, clientLabel: string): string {
  return competence.trim() === ""
    ? `Notificação que o Projeto do cliente está disponível para execução e monitoramento.<br /><br />Cliente: ${escapeHtml(clientLabel)}`
    : `<p>${escapeHtml(competence.trim())}</p>`;
}

export class CommercialEmailNotificationService {
  constructor(
    private readonly prisma: CommercialEmailNotificationPrisma,
    private readonly adapter: CommercialEmailAdapter,
    private readonly audit: CommercialEmailNotificationAudit = defaultAudit,
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
      const recipientRows = await this.prisma.emails.findMany({
        where: { organization_id: event.organization_id, new_client_sending: true },
        select: { email: true, responsible: true },
        orderBy: { email: "asc" },
      });
      const recipients: CommercialEmailRecipient[] = recipientRows.map((recipient) => ({
        email: recipient.email.trim(),
        name: recipient.responsible.trim(),
      }));

      if (recipients.length === 0) {
        await this.mark(notification.id, "skipped", null);
        await this.recordAudit(event, "skipped", notification.attempts);
        return;
      }

      await this.adapter.send({
        idempotencyKey: event.event_id,
        recipients,
        subject: `${competence.trim() === "" ? "PROJETO" : "CLIENTE NOVO"} - ${(
          client.company_name ?? client.name
        ).replace(/[\r\n]/gu, " ")}`,
        html: buildEmailHtml(competence, client.company_name ?? client.name),
      });
      await this.mark(notification.id, "sent", null, {
        recipients,
        subject: `${competence.trim() === "" ? "PROJETO" : "CLIENTE NOVO"} - ${(
          client.company_name ?? client.name
        ).replace(/[\r\n]/gu, " ")}`,
        html: buildEmailHtml(competence, client.company_name ?? client.name),
      });
      await this.recordAudit(event, "sent", notification.attempts);
    } catch (error: unknown) {
      await this.mark(notification.id, "failed", errorMessage(error));
      await this.recordAudit(event, "failed", notification.attempts, errorMessage(error));
      throw error;
    }
  }

  private async claim(
    event: CommercialProspectingTransitionEvent,
  ): Promise<CommercialEmailNotificationRow | null> {
    const staleBefore = new Date(Date.now() - 120_000);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.commercialEmailNotification.findUnique({
        where: { event_id: event.event_id },
        select: { id: true, status: true, attempts: true, locked_at: true },
      });
      if (existing?.status === "sent" || existing?.status === "skipped") return null;

      if (existing) {
        const canReclaim =
          existing.status === "failed" ||
          (existing.status === "processing" &&
            (!existing.locked_at || existing.locked_at <= staleBefore));
        if (!canReclaim) return null;
        const claimed = await tx.commercialEmailNotification.updateMany({
          where: {
            id: existing.id,
            OR: [
              { status: "failed" },
              { status: "processing", locked_at: { lte: staleBefore } },
              { status: "processing", locked_at: null },
            ],
          },
          data: {
            status: "processing",
            attempts: { increment: 1 },
            locked_at: new Date(),
            last_error: null,
          },
        });
        return claimed.count === 1
          ? {
              ...existing,
              status: "processing",
              attempts: existing.attempts + 1,
              locked_at: new Date(),
            }
          : null;
      }

      return tx.commercialEmailNotification.create({
        data: {
          event_id: event.event_id,
          organization_id: event.organization_id,
          client_id: event.client_id,
          status: "processing",
          attempts: 1,
          message: {},
          locked_at: new Date(),
        },
        select: { id: true, status: true, attempts: true, locked_at: true },
      });
    });
  }

  private async mark(
    id: string,
    status: string,
    lastError: string | null,
    message?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.commercialEmailNotification.updateMany({
      where: { id, status: "processing" },
      data: {
        status,
        last_error: lastError,
        sent_at: status === "sent" ? new Date() : null,
        ...(message ? { message } : {}),
      },
    });
  }

  private async recordAudit(
    event: CommercialProspectingTransitionEvent,
    status: string,
    attempts: number,
    error?: string,
  ): Promise<void> {
    try {
      await this.audit.createLog({
        userId: "commercial-service",
        organizationId: event.organization_id,
        action: `Notificação de novo cliente: ${status}`,
        referring: "commercial.email_notification",
        referringId: event.event_id,
        changes: { status, attempts, error: error ?? null },
        auditCorrelationId: event.audit_correlation_id,
      });
    } catch (auditError: unknown) {
      logError("Falha ao registrar auditoria da notificação comercial", { auditError });
    }
  }
}
