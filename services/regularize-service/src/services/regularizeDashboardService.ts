import type { PrismaClient } from "../generated/prisma/client.js";
import { OPERATIONAL_PROCESS_FILTER } from "../schemas/status.schemas.js";

export interface RegularizeDashboardProcess {
  id: string;
  process_type: string;
  cpf_cnpj: string;
  status: string;
  clientPF: { name: string; cpf: string } | null;
  clientPJ: { name: string; cpf_cnpj: string } | null;
}

export interface RegularizeDashboardLicense {
  id: string;
  type_license: string;
  protocol: string;
  due_date: Date | null;
}

export interface RegularizeDashboardResult {
  year: number;
  metrics: {
    openProcesses: number;
    activeLicenses: number;
    activeClientPfs: number;
    activeSites: number;
    municipalTaxesCompleted: number;
    municipalTaxesPending: number;
    municipalTaxesTotal: number;
  };
  recentProcesses: RegularizeDashboardProcess[];
  trackedLicenses: RegularizeDashboardLicense[];
}

const CLOSED_PROCESS_STATUSES = ["Concluído", "Concluido", "Cancelado", "Encerrado"] as const;

export class RegularizeDashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboard(organizationId: string, year: number): Promise<RegularizeDashboardResult> {
    const [
      openProcesses,
      recentProcessRows,
      activeLicenses,
      trackedLicenses,
      activeClientPfs,
      activeSites,
      municipalTaxesTotal,
      municipalTaxesCompleted,
    ] = await this.prisma.$transaction([
      this.prisma.process.count({
        where: {
          organization_id: organizationId,
          ...OPERATIONAL_PROCESS_FILTER,
          status: { notIn: [...CLOSED_PROCESS_STATUSES] },
        },
      }),
      this.prisma.process.findMany({
        where: { organization_id: organizationId, ...OPERATIONAL_PROCESS_FILTER },
        select: {
          id: true,
          process_type: true,
          cpf_cnpj: true,
          status: true,
          clientPF: {
            where: { organization_id: organizationId },
            select: { name: true, cpf: true, organization_id: true },
          },
          clientPJ: {
            where: { organization_id: organizationId },
            select: { name: true, cpf_cnpj: true, organization_id: true },
          },
        },
        // Processo migrado sem data de entrada não pode ocupar o topo dos recentes.
        orderBy: { entry_date: { sort: "desc", nulls: "last" } },
        take: 6,
      }),
      this.prisma.license.count({
        where: { organization_id: organizationId, status: "Ativo" },
      }),
      this.prisma.license.findMany({
        where: { organization_id: organizationId, status: "Ativo" },
        select: {
          id: true,
          type_license: true,
          protocol: true,
          due_date: true,
        },
        orderBy: { entry_date: "desc" },
        take: 6,
      }),
      this.prisma.clientPF.count({
        where: { organization_id: organizationId, status: "Ativo" },
      }),
      this.prisma.sitePasswordsRegularize.count({
        where: { organization_id: organizationId, status: true },
      }),
      this.prisma.client.count({
        where: { organization_id: organizationId, status: "Ativo" },
      }),
      this.prisma.client.count({
        where: {
          organization_id: organizationId,
          status: "Ativo",
          municipalTaxes: {
            some: { organization_id: organizationId, year },
          },
        },
      }),
    ]);

    return {
      year,
      metrics: {
        openProcesses,
        activeLicenses,
        activeClientPfs,
        activeSites,
        municipalTaxesCompleted,
        municipalTaxesPending: Math.max(municipalTaxesTotal - municipalTaxesCompleted, 0),
        municipalTaxesTotal,
      },
      recentProcesses: recentProcessRows.map(({ clientPF, clientPJ, ...process }) => ({
        ...process,
        clientPF:
          clientPF?.organization_id === organizationId
            ? { name: clientPF.name, cpf: clientPF.cpf }
            : null,
        clientPJ:
          clientPJ?.organization_id === organizationId
            ? { name: clientPJ.name, cpf_cnpj: clientPJ.cpf_cnpj }
            : null,
      })),
      trackedLicenses,
    };
  }
}
