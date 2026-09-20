import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";

export interface CommercialEmailRecipient {
  email: string;
  name: string;
}

export interface CommercialEmailMessage {
  idempotencyKey: string;
  recipients: CommercialEmailRecipient[];
  subject: string;
  html: string;
}

export interface CommercialEmailAdapter {
  send(message: CommercialEmailMessage): Promise<void>;
}

export class MissingCommercialEmailAdapter implements CommercialEmailAdapter {
  async send(_message: CommercialEmailMessage): Promise<void> {
    throw new Error("COMMERCIAL_EMAIL_ADAPTER_URL não configurada.");
  }
}

export class CommercialEmailHttpAdapter implements CommercialEmailAdapter {
  constructor(
    private readonly adapterUrl: string,
    private readonly serviceToken: string,
    private readonly fromEmail: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: CommercialEmailMessage): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.adapterUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [INTERNAL_SERVICE_TOKEN_HEADER]: this.serviceToken,
          "idempotency-key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.fromEmail,
          recipients: message.recipients,
          subject: message.subject,
          html: message.html,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`email adapter failed with status ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
