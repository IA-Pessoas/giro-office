import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    rhRequest: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    rhMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { MessageService } from "../services/messageService.js";

describe("MessageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock),
    );
  });

  it("create lança 404 quando chamado não existe", async () => {
    prismaMock.rhRequest.findFirst.mockResolvedValue(null);
    const service = new MessageService();
    await expect(
      service.create({
        organization_id: "org-1",
        sender_user_id: "user-1",
        request_id: "req-1",
        message: "Mensagem",
        type: "Message",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("listByRequest lança 403 quando usuário não participa do chamado", async () => {
    prismaMock.rhRequest.findFirst.mockResolvedValue({
      id: "req-1",
      requester_user_id: "user-2",
      assigned_to_user_id: "user-3",
    });
    const service = new MessageService();
    await expect(
      service.listByRequest({ organization_id: "org-1", user_id: "user-1", request_id: "req-1" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("listByRequest permite ao solicitante acessar chamado sem responsável", async () => {
    const messages = [{ id: "msg-1" }];
    prismaMock.rhRequest.findFirst.mockResolvedValue({
      id: "req-1",
      requester_user_id: "user-1",
      assigned_to_user_id: null,
    });
    prismaMock.rhMessage.findMany.mockResolvedValue(messages);
    const service = new MessageService();

    await expect(
      service.listByRequest({ organization_id: "org-1", user_id: "user-1", request_id: "req-1" }),
    ).resolves.toBe(messages);
  });

  it("listByRequest nega terceiro em chamado sem responsável", async () => {
    prismaMock.rhRequest.findFirst.mockResolvedValue({
      id: "req-1",
      requester_user_id: "user-2",
      assigned_to_user_id: null,
    });
    const service = new MessageService();

    await expect(
      service.listByRequest({ organization_id: "org-1", user_id: "user-1", request_id: "req-1" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("listByRequest permite gestor RH listar mensagens de chamado de terceiro", async () => {
    const messages = [{ id: "msg-1" }];
    prismaMock.rhRequest.findFirst.mockResolvedValue({
      id: "req-1",
      requester_user_id: "user-2",
      assigned_to_user_id: "user-3",
    });
    prismaMock.rhMessage.findMany.mockResolvedValue(messages);

    const service = new MessageService();
    const result = await service.listByRequest({
      organization_id: "org-1",
      user_id: "user-1",
      request_id: "req-1",
      can_manage_rh: true,
    });

    expect(result).toBe(messages);
  });

  it("create permite gestor RH responder chamado de terceiro", async () => {
    const created = { id: "msg-1" };
    prismaMock.rhRequest.findFirst.mockResolvedValue({
      id: "req-1",
      title: "Pedido",
      requester_user_id: "user-2",
      assigned_to_user_id: "user-3",
    });
    prismaMock.rhMessage.create.mockResolvedValue(created);
    prismaMock.rhRequest.update.mockResolvedValue({ id: "req-1" });

    const service = new MessageService();
    const result = await service.create({
      organization_id: "org-1",
      sender_user_id: "user-1",
      request_id: "req-1",
      message: "Resposta RH",
      type: "Message",
      can_manage_rh: true,
    });

    expect(result).toBe(created);
  });
});
