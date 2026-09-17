import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    rhRequest: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    rhMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    rhMessageRead: {
      createMany: vi.fn(),
    },
    rhNotification: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../integrations/prisma.js", () => ({ prismaClient: prismaMock }));

import { MessageService } from "../services/messageService.js";

describe("MessageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.rhMessageRead.createMany.mockResolvedValue({ count: 0 });
    prismaMock.rhNotification.upsert.mockResolvedValue({});
    prismaMock.rhRequest.updateMany.mockResolvedValue({ count: 1 });
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

    expect(result).toEqual([{ id: "msg-1", is_read: true }]);
    expect(prismaMock.rhMessageRead.createMany).toHaveBeenCalledWith({
      data: [{ message_id: "msg-1", user_id: "user-1", organization_id: "org-1" }],
      skipDuplicates: true,
    });
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

  it("create permite somente o responsável enviar solução e avança para Resolvido", async () => {
    const created = { id: "msg-solution" };
    prismaMock.rhRequest.findFirst.mockResolvedValue({
      id: "req-1",
      title: "Pedido",
      requester_user_id: "user-2",
      assigned_to_user_id: "user-3",
      status: "In_Progress",
    });
    prismaMock.rhMessage.create.mockResolvedValue(created);

    const service = new MessageService();
    await expect(
      service.create({
        organization_id: "org-1",
        sender_user_id: "user-2",
        request_id: "req-1",
        message: "Solução",
        type: "Solution",
        can_use_rh_workflow_messages: true,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await service.create({
      organization_id: "org-1",
      sender_user_id: "user-3",
      request_id: "req-1",
      message: "Solução",
      type: "Solution",
      can_use_rh_workflow_messages: true,
    });

    expect(prismaMock.rhRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "req-1", organization_id: "org-1", status: "In_Progress" },
      data: { status: "Resolved" },
    });
    expect(prismaMock.rhNotification.upsert).toHaveBeenCalledTimes(1);
  });

  it("create permite aceitação do solicitante e fecha a solicitação", async () => {
    prismaMock.rhRequest.findFirst.mockResolvedValue({
      id: "req-1",
      title: "Pedido",
      requester_user_id: "user-2",
      assigned_to_user_id: "user-3",
      status: "Resolved",
    });
    prismaMock.rhMessage.create.mockResolvedValue({ id: "msg-acceptance" });

    const service = new MessageService();
    await service.create({
      organization_id: "org-1",
      sender_user_id: "user-2",
      request_id: "req-1",
      message: "Aceito",
      type: "Acceptance",
    });

    expect(prismaMock.rhRequest.updateMany).toHaveBeenCalledWith({
      where: { id: "req-1", organization_id: "org-1", status: "Resolved" },
      data: { status: "Closed" },
    });
    expect(prismaMock.rhNotification.upsert).toHaveBeenCalledTimes(1);
  });

  it("create rejeita workflow quando a atualização condicional perde a corrida", async () => {
    prismaMock.rhRequest.findFirst.mockResolvedValue({
      id: "req-1",
      title: "Pedido",
      requester_user_id: "user-2",
      assigned_to_user_id: "user-3",
      status: "Resolved",
    });
    prismaMock.rhMessage.create.mockResolvedValue({ id: "msg-rejection" });
    prismaMock.rhRequest.updateMany.mockResolvedValue({ count: 0 });

    const service = new MessageService();
    await expect(
      service.create({
        organization_id: "org-1",
        sender_user_id: "user-2",
        request_id: "req-1",
        message: "Não aceito",
        type: "Rejection",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.rhNotification.upsert).not.toHaveBeenCalled();
  });
});
