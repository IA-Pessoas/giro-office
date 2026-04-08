import type { PrismaClient } from "../generated/prisma/client.js";

export class RegularizeReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}

  async runFullReconciliation(): Promise<Record<string, unknown>> {
    const expiredDocumentNotifications = await this.reconcileClientPfDocumentNotifications();
    const inactivatedClientPf = await this.reconcileInactiveClientPfStatuses();

    return {
      processed: expiredDocumentNotifications.created + inactivatedClientPf.updated,
      expiredDocumentNotifications,
      inactivatedClientPf,
      licenseNotifications: {
        created: 0,
        pendingImplementation: true,
      },
    };
  }

  async handleClientPfChanged(organizationId: string, clientPfId: string): Promise<void> {
    await this.reconcileClientPfDocumentNotifications({
      organizationId,
      clientPfId,
    });
    await this.reconcileInactiveClientPfStatuses({
      organizationId,
      clientPfId,
    });
  }

  async handlePartnersChanged(organizationId: string, clientPfId: string): Promise<void> {
    await this.reconcileInactiveClientPfStatuses({
      organizationId,
      clientPfId,
    });
  }

  async handleLicenseChanged(_organizationId: string, _licenseId: string): Promise<void> {}

  private async reconcileClientPfDocumentNotifications(params?: {
    organizationId?: string;
    clientPfId?: string;
  }): Promise<{ created: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const clients = await this.prisma.clientPF.findMany({
      where: {
        ...(params?.organizationId ? { organization_id: params.organizationId } : {}),
        ...(params?.clientPfId ? { id: params.clientPfId } : {}),
        OR: [{ rg_validity: { lt: today } }, { cnh_validity: { lt: today } }],
      },
      select: {
        id: true,
        name: true,
        organization_id: true,
        rg_validity: true,
        cnh_validity: true,
      },
    });

    let created = 0;

    for (const client of clients) {
      const managers = await this.getRegularizeManagerUserIds(client.organization_id);
      for (const userId of managers) {
        if (client.rg_validity) {
          const title = `RG Vencido: ${client.name}`;
          const message = `O RG do cliente ${client.name} venceu em ${client.rg_validity.toLocaleDateString("pt-BR")}.`;
          const inserted = await this.createNotificationIfMissing({
            organizationId: client.organization_id,
            userId,
            regarding: "clientPF",
            regardingId: client.id,
            title,
            message,
          });
          created += inserted ? 1 : 0;
        }

        if (client.cnh_validity) {
          const title = `CNH Vencida: ${client.name}`;
          const message = `A CNH do cliente ${client.name} venceu em ${client.cnh_validity.toLocaleDateString("pt-BR")}.`;
          const inserted = await this.createNotificationIfMissing({
            organizationId: client.organization_id,
            userId,
            regarding: "clientPF",
            regardingId: client.id,
            title,
            message,
          });
          created += inserted ? 1 : 0;
        }
      }
    }

    return { created };
  }

  private async reconcileInactiveClientPfStatuses(params?: {
    organizationId?: string;
    clientPfId?: string;
  }): Promise<{ updated: number }> {
    const clients = await this.prisma.clientPF.findMany({
      where: {
        status: "Ativo",
        ...(params?.organizationId ? { organization_id: params.organizationId } : {}),
        ...(params?.clientPfId ? { id: params.clientPfId } : {}),
      },
      select: {
        id: true,
        organization_id: true,
      },
    });

    let updated = 0;

    for (const client of clients) {
      const activePartners = await this.prisma.partners.count({
        where: {
          organization_id: client.organization_id,
          pf_id: client.id,
          exit: null,
        },
      });

      if (activePartners === 0) {
        await this.prisma.clientPF.update({
          where: { id: client.id },
          data: { status: "Inativo" },
        });
        updated += 1;
      }
    }

    return { updated };
  }

  private async getRegularizeManagerUserIds(organizationId: string): Promise<string[]> {
    const permissions = await this.prisma.permission.findMany({
      where: {
        organization_id: organizationId,
        regularize: 2,
        user: {
          status: "Ativo",
        },
      },
      select: {
        user_id: true,
      },
    });

    return permissions.map((item) => item.user_id);
  }

  private async createNotificationIfMissing(input: {
    organizationId: string;
    userId: string;
    regarding: string;
    regardingId: string;
    title: string;
    message: string;
  }): Promise<boolean> {
    const exists = await this.prisma.regularizeNotification.findFirst({
      where: {
        organization_id: input.organizationId,
        user_id: input.userId,
        regarding_id: input.regardingId,
        title: input.title,
      },
      select: { id: true },
    });

    if (exists) {
      return false;
    }

    await this.prisma.regularizeNotification.create({
      data: {
        organization_id: input.organizationId,
        user_id: input.userId,
        regarding: input.regarding,
        regarding_id: input.regardingId,
        title: input.title,
        message: input.message,
      },
    });

    return true;
  }
}
