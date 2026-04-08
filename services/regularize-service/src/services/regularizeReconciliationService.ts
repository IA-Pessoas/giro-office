import type { PrismaClient } from "../generated/prisma/client.js";

export class RegularizeReconciliationService {
  constructor(private readonly prisma: PrismaClient) {}

  async runFullReconciliation(): Promise<Record<string, unknown>> {
    const expiredDocumentNotifications = await this.reconcileClientPfDocumentNotifications();
    const inactivatedClientPf = await this.reconcileInactiveClientPfStatuses();
    const licenseNotifications = await this.reconcileLicenseNotifications();

    return {
      processed:
        expiredDocumentNotifications.created +
        inactivatedClientPf.updated +
        licenseNotifications.created,
      expiredDocumentNotifications,
      inactivatedClientPf,
      licenseNotifications,
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

  async handleLicenseChanged(organizationId: string, licenseId: string): Promise<void> {
    await this.reconcileLicenseNotifications({
      organizationId,
      licenseId,
    });
  }

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

  private async reconcileLicenseNotifications(params?: {
    organizationId?: string;
    licenseId?: string;
  }): Promise<{ created: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const licenses = await this.prisma.license.findMany({
      where: {
        ...(params?.organizationId ? { organization_id: params.organizationId } : {}),
        ...(params?.licenseId ? { id: params.licenseId } : {}),
        due_date: {
          not: null,
          lte: thirtyDaysFromNow,
        },
        client: {
          status: "Ativo",
        },
      },
      include: {
        client: {
          select: {
            name: true,
          },
        },
      },
    });

    let created = 0;

    for (const license of licenses) {
      const managers = await this.getRegularizeManagerUserIds(license.organization_id);
      if (!license.due_date || !license.client) {
        continue;
      }

      const isExpired = license.due_date < today;
      const title = `${isExpired ? "ALVARA VENCIDO" : "ALVARA A VENCER"}: ${license.type_license}`;
      const dateStr = license.due_date.toLocaleDateString("pt-BR");
      const message = isExpired
        ? `O alvara do cliente ${license.client.name} venceu em ${dateStr}.`
        : `O alvara do cliente ${license.client.name} vence em ${Math.ceil((license.due_date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))} dias (${dateStr}).`;

      for (const userId of managers) {
        const inserted = await this.createNotificationIfMissing({
          organizationId: license.organization_id,
          userId,
          regarding: "regularize.license",
          regardingId: license.id,
          title,
          message,
        });
        created += inserted ? 1 : 0;
      }
    }

    return { created };
  }
}
