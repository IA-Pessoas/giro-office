import { ServiceError } from "@workspace/shared";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

const LEGACY_PROSPECTING_STATUS = "Migrado do legado";
const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const SOURCE_COLORS: Record<string, string> = {
  Website: "#3b82f6",
  Indicação: "#10b981",
  WhatsApp: "#8b5cf6",
  Onvio: "#f59e0b",
  "Cold Call": "#ef4444",
  "Não informado": "#64748b",
};

export type CommercialLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost"
  | "paused";

export type CommercialPriority = "low" | "medium" | "high" | "urgent";

export interface CommercialOverviewLead {
  id: string;
  name: string;
  company: string;
  cnpj: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: CommercialLeadStatus;
  value: number;
  priority: CommercialPriority;
  assignee: string;
  createdDate: string;
  lastContact: string | null;
  nextFollowUp: string | null;
  notes: string | null;
}

export interface CommercialOverviewSummary {
  totalLeads: number;
  activeLeads: number;
  wonLeads: number;
  totalValue: number;
  conversionRate: number;
  activeProposals: number;
  activeContracts: number;
}

export interface CommercialOverviewSource {
  name: string;
  value: number;
  color: string;
}

export interface CommercialMonthlyConversion {
  month: string;
  leads: number;
  won: number;
  lost: number;
}

export interface CommercialOverview {
  summary: CommercialOverviewSummary;
  leads: CommercialOverviewLead[];
  sources: CommercialOverviewSource[];
  monthlyConversions: CommercialMonthlyConversion[];
  proposals: [];
  contracts: [];
}

const commercialClientSelect = {
  id: true,
  name: true,
  company_name: true,
  fantasy_name: true,
  cpf_cnpj: true,
  email: true,
  number: true,
  indication: true,
  agent: true,
  status: true,
  prospecting_status: true,
  contract: true,
  register_date_prospecting: true,
  date_status: true,
  description_prospecting: true,
} satisfies Prisma.ClientSelect;

type CommercialClientRow = Prisma.ClientGetPayload<{
  select: typeof commercialClientSelect;
}>;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function mapLeadStatus(row: Pick<CommercialClientRow, "prospecting_status">): CommercialLeadStatus {
  const status = normalizeText(row.prospecting_status);

  if (status.includes("fechado")) return "won";
  if (status.includes("recus") || status.includes("nao contratado")) return "lost";
  if (status.includes("paralis")) return "paused";
  if (status.includes("proposta")) return "proposal";
  if (status.includes("negocia")) return "negotiation";
  if (status.includes("contat")) return "contacted";
  if (status.includes("analise") || status.includes("tecnico") || status.includes("qualific")) {
    return "qualified";
  }

  return "new";
}

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toLead(row: CommercialClientRow): CommercialOverviewLead {
  return {
    id: row.id,
    name: row.name,
    company: row.company_name ?? row.fantasy_name ?? row.name,
    cnpj: row.cpf_cnpj,
    email: row.email,
    phone: row.number,
    source: row.indication?.trim() || "Não informado",
    status: mapLeadStatus(row),
    value: 0,
    priority: "medium",
    assignee: row.agent?.trim() || "Sem responsável",
    createdDate: row.register_date_prospecting.toISOString(),
    lastContact: toIsoDate(row.date_status),
    nextFollowUp: null,
    notes: row.description_prospecting,
  };
}

function buildSources(leads: CommercialOverviewLead[]): CommercialOverviewSource[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([name, value]) => ({
    name,
    value,
    color: SOURCE_COLORS[name] ?? SOURCE_COLORS["Não informado"],
  }));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(key: string): string {
  const month = Number(key.slice(5, 7));
  return MONTH_LABELS[month - 1] ?? key;
}

function buildMonthlyConversions(leads: CommercialOverviewLead[]): CommercialMonthlyConversion[] {
  if (leads.length === 0) {
    const now = new Date();
    return Array.from({ length: 6 }, (_unused, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
      return { month: MONTH_LABELS[date.getUTCMonth()], leads: 0, won: 0, lost: 0 };
    });
  }

  const counts = new Map<string, CommercialMonthlyConversion>();
  for (const lead of leads) {
    const key = monthKey(new Date(lead.createdDate));
    const current = counts.get(key) ?? { month: monthLabelFromKey(key), leads: 0, won: 0, lost: 0 };
    current.leads += 1;
    if (lead.status === "won") current.won += 1;
    if (lead.status === "lost") current.lost += 1;
    counts.set(key, current);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, value]) => value);
}

export class ClientCommercialOverviewService {
  constructor(private readonly prisma: PrismaClient) {}

  async getOverview(organizationId: string): Promise<CommercialOverview> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!organization) {
      throw new ServiceError(404, "Organização não encontrada.");
    }

    const activeContracts = await this.prisma.client.count({
      where: { organization_id: organizationId, contract: true },
    });
    const rows = await this.prisma.client.findMany({
      where: {
        organization_id: organizationId,
        prospecting_status: { not: LEGACY_PROSPECTING_STATUS },
      },
      orderBy: { register_date_prospecting: "desc" },
      take: 100,
      select: commercialClientSelect,
    });

    const leads = rows.map(toLead);
    const wonLeads = leads.filter((lead) => lead.status === "won").length;
    const activeLeads = leads.filter(
      (lead) => !["won", "lost", "paused"].includes(lead.status),
    ).length;
    const conversionRate =
      leads.length > 0 ? Number(((wonLeads / leads.length) * 100).toFixed(1)) : 0;

    return {
      summary: {
        totalLeads: leads.length,
        activeLeads,
        wonLeads,
        totalValue: 0,
        conversionRate,
        activeProposals: 0,
        activeContracts,
      },
      leads,
      sources: buildSources(leads),
      monthlyConversions: buildMonthlyConversions(leads),
      proposals: [],
      contracts: [],
    };
  }
}
