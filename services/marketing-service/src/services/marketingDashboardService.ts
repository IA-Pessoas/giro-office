import type { PrismaClient } from "../generated/prisma/client.js";
import {
  type MarketingDashboardResponse,
  marketingDashboardResponseSchema,
} from "../schemas/marketingDashboard.schemas.js";

interface BirthdayAggregate {
  total: number;
  items: Array<{ id: string; name: string; date: string; day: number; department?: string | null }>;
}

const EMPTY_BIRTHDAYS: BirthdayAggregate = { total: 0, items: [] };
const CLOSED_REQUEST_STATUSES = ["Resolved", "Closed"] as const;

export function getCurrentMarketingCompetence(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return new Date(Date.UTC(year, month - 1, 1));
}

export class MarketingDashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboard(organizationId: string, month?: string): Promise<MarketingDashboardResponse> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const competence = getCurrentMarketingCompetence(new Date(), organization?.timezone ?? "UTC");
    const birthdayMonth = month ? new Date(`${month}-01T00:00:00.000Z`) : competence;
    const selectedBirthdayMonth = birthdayMonth.getUTCMonth() + 1;
    const selectedBirthdayYear = birthdayMonth.getUTCFullYear();
    const [
      rhActive,
      tiActive,
      rhNew,
      tiNew,
      rhUrgent,
      tiUrgent,
      clientBirthdays,
      employeeBirthdays,
      companyAnniversaries,
      pendingKnowledge,
    ] = await this.prisma.$transaction([
      this.prisma.rhRequest.count({
        where: {
          organization_id: organizationId,
          status: { notIn: [...CLOSED_REQUEST_STATUSES] },
        },
      }),
      this.prisma.tIRequest.count({
        where: {
          organization_id: organizationId,
          status: { notIn: [...CLOSED_REQUEST_STATUSES] },
        },
      }),
      this.prisma.rhRequest.count({
        where: { organization_id: organizationId, status: "New" },
      }),
      this.prisma.tIRequest.count({
        where: { organization_id: organizationId, status: "New" },
      }),
      this.prisma.rhRequest.count({
        where: {
          organization_id: organizationId,
          status: { notIn: [...CLOSED_REQUEST_STATUSES] },
          urgency: "High",
        },
      }),
      this.prisma.tIRequest.count({
        where: {
          organization_id: organizationId,
          status: { notIn: [...CLOSED_REQUEST_STATUSES] },
          urgency: { in: ["High", "Critical"] },
        },
      }),
      this.prisma.$queryRaw<BirthdayAggregate[]>`
        WITH matches AS (
          SELECT DISTINCT person.id, person.name,
            to_char(person.date_of_birth, 'DD/MM') AS date,
            EXTRACT(DAY FROM person.date_of_birth)::int AS day
          FROM "clients.pf" AS person
          INNER JOIN "regularize.partners" AS partner
            ON partner.pf_id = person.id
            AND partner.organization_id = ${organizationId}
            AND partner.exit IS NULL
          INNER JOIN clients AS company
            ON company.id = partner.pj_id
            AND company.organization_id = ${organizationId}
            AND company.status = 'Ativo'
            AND company.type = 'PJ'
          WHERE person.organization_id = ${organizationId}
            AND person.status = 'Ativo'
            AND EXTRACT(MONTH FROM person.date_of_birth) = ${selectedBirthdayMonth}
        )
        SELECT COUNT(*)::int AS total,
          COALESCE(
            jsonb_agg(jsonb_build_object('id', id, 'name', name, 'date', date, 'day', day) ORDER BY day, name, id),
            '[]'::jsonb
          ) AS items
        FROM matches
      `,
      this.prisma.$queryRaw<BirthdayAggregate[]>`
        WITH matches AS (
          SELECT employee.id, COALESCE(NULLIF(employee.full_name, ''), employee.name) AS name,
            to_char(employee.birth_date, 'DD/MM') AS date,
            EXTRACT(DAY FROM employee.birth_date)::int AS day,
            department.name AS department
          FROM users AS employee
          LEFT JOIN departments AS department
            ON department.id = employee.department_id
            AND department.organization_id = ${organizationId}
          WHERE (
            employee.organization_id = ${organizationId}
            OR (
              employee.organization_id IS NULL
              AND EXISTS (
                SELECT 1 FROM departments AS department
                WHERE department.id = employee.department_id
                  AND department.organization_id = ${organizationId}
              )
            )
          )
            AND employee.status = 'active'
            AND employee.termination_date IS NULL
            AND employee.birth_date IS NOT NULL
            AND EXTRACT(MONTH FROM employee.birth_date) = ${selectedBirthdayMonth}
        )
        SELECT COUNT(*)::int AS total,
          COALESCE(
            jsonb_agg(jsonb_build_object('id', id, 'name', name, 'date', date, 'day', day, 'department', department) ORDER BY day, name, id),
            '[]'::jsonb
          ) AS items
        FROM matches
      `,
      this.prisma.$queryRaw<BirthdayAggregate[]>`
        WITH matches AS (
          SELECT company.id,
            COALESCE(NULLIF(company.fantasy_name, ''), NULLIF(company.company_name, ''), company.name) AS name,
            to_char(company.opening_date, 'DD/MM') AS date,
            EXTRACT(DAY FROM company.opening_date)::int AS day
          FROM clients AS company
          WHERE company.organization_id = ${organizationId}
            AND company.status = 'Ativo'
            AND company.type = 'PJ'
            AND company.opening_date IS NOT NULL
            AND EXTRACT(MONTH FROM company.opening_date) = ${selectedBirthdayMonth}
        )
        SELECT COUNT(*)::int AS total,
          COALESCE(
            jsonb_agg(jsonb_build_object('id', id, 'name', name, 'date', date, 'day', day) ORDER BY day, name, id),
            '[]'::jsonb
          ) AS items
        FROM matches
      `,
      this.prisma.marketingAiUsageControl.count({
        where: { organization_id: organizationId, competence, knowledge: null },
      }),
    ]);

    const clientBirthdaySummary = clientBirthdays[0] ?? EMPTY_BIRTHDAYS;
    const employeeBirthdaySummary = employeeBirthdays[0] ?? EMPTY_BIRTHDAYS;
    const companyAnniversarySummary = companyAnniversaries[0] ?? EMPTY_BIRTHDAYS;
    const newRequests = rhNew + tiNew;
    const urgentRequests = rhUrgent + tiUrgent;
    const alerts: MarketingDashboardResponse["alerts"] = [];

    if (newRequests > 0) {
      alerts.push({ code: "new-requests", count: newRequests, label: "Solicitações novas" });
    }
    if (urgentRequests > 0) {
      alerts.push({
        code: "urgent-requests",
        count: urgentRequests,
        label: "Solicitações urgentes em aberto",
      });
    }
    if (pendingKnowledge > 0) {
      alerts.push({
        code: "pending-ai-knowledge",
        count: pendingKnowledge,
        label: "Conhecimento de IA pendente",
      });
    }

    return marketingDashboardResponseSchema.parse({
      requests: {
        active: { total: rhActive + tiActive, rh: rhActive, ti: tiActive },
        new: { total: newRequests, rh: rhNew, ti: tiNew },
        urgent: { total: urgentRequests, rh: rhUrgent, ti: tiUrgent },
      },
      birthdays: {
        clients: clientBirthdaySummary,
        employees: employeeBirthdaySummary,
        companies: companyAnniversarySummary,
      },
      birthdayMonth: `${selectedBirthdayYear}-${String(selectedBirthdayMonth).padStart(2, "0")}`,
      aiUsage: {
        competence: `${competence.getUTCFullYear()}-${String(competence.getUTCMonth() + 1).padStart(2, "0")}`,
        pendingKnowledge,
      },
      alerts,
    });
  }
}
