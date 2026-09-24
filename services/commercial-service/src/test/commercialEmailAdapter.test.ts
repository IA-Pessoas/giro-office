import "./envBootstrap.js";

import { describe, expect, it, vi } from "vitest";

import { CommercialEmailHttpAdapter } from "../integrations/commercialEmailAdapter.js";

describe("CommercialEmailHttpAdapter", () => {
  it("envia o contrato sem expor o token e com chave de idempotência", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const adapter = new CommercialEmailHttpAdapter(
      "https://mailer.example.test/send",
      "secret-token",
      "comercial@example.test",
      5_000,
      fetchImpl,
    );

    await adapter.send({
      idempotencyKey: "event-1",
      recipients: [{ email: "destino@example.test", name: "Destino" }],
      subject: "CLIENTE NOVO - Empresa",
      html: "<p>2026-10</p>",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://mailer.example.test/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-internal-service-token": "secret-token",
          "idempotency-key": "event-1",
        }),
      }),
    );
    const [, request] = fetchImpl.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({
      from: "comercial@example.test",
      recipients: [{ email: "destino@example.test", name: "Destino" }],
      subject: "CLIENTE NOVO - Empresa",
      html: "<p>2026-10</p>",
    });
    expect(request.body).not.toContain("secret-token");
  });

  it("transforma resposta de falha do adaptador em erro reprocessável", async () => {
    const adapter = new CommercialEmailHttpAdapter(
      "https://mailer.example.test/send",
      "secret-token",
      "comercial@example.test",
      5_000,
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(
      adapter.send({
        idempotencyKey: "event-1",
        recipients: [],
        subject: "Assunto",
        html: "<p>Corpo</p>",
      }),
    ).rejects.toThrow("status 503");
  });
});
