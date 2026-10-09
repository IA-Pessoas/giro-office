import type { PrismaClient } from "../generated/prisma/client.js";
import {
  type MarketingDashboardResponse,
  type MarketingMonthlyBirthdaysResponse,
  marketingDashboardResponseSchema,
  marketingMonthlyBirthdaysResponseSchema,
} from "../schemas/marketingDashboard.schemas.js";

interface BirthdayAggregate {
  total: number;
  items: Array<{ id: string; name: string; day: number }>;
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

  async getDashboard(organizationId: string): Promise<MarketingDashboardResponse> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const competence = getCurrentMarketingCompetence(new Date(), organization?.timezone ?? "UTC");
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
        WITH calendar AS (
          SELECT
            EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE organization.timezone)::int AS month,
            EXTRACT(DAY FROM CURRENT_TIMESTAMP AT TIME ZONE organization.timezone)::int AS day
          FROM organizations AS organization
          WHERE organization.id = ${organizationId}
        ), matches AS (
          SELECT person.id, person.name,
            EXTRACT(DAY FROM person.date_of_birth)::int AS day
          FROM "clients.pf" AS person
          CROSS JOIN calendar
          WHERE person.organization_id = ${organizationId}
            AND person.status = 'Ativo'
            AND EXTRACT(MONTH FROM person.date_of_birth) = calendar.month
            AND EXTRACT(DAY FROM person.date_of_birth) >= calendar.day
        )
        SELECT COUNT(*)::int AS total,
          COALESCE(
            jsonb_agg(jsonb_build_object('id', id, 'name', name, 'day', day) ORDER BY day, name, id),
            '[]'::jsonb
          ) AS items
        FROM matches
      `,
      this.prisma.$queryRaw<BirthdayAggregate[]>`
        WITH calendar AS (
          SELECT
            EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE organization.timezone)::int AS month,
            EXTRACT(DAY FROM CURRENT_TIMESTAMP AT TIME ZONE organization.timezone)::int AS day
          FROM organizations AS organization
          WHERE organization.id = ${organizationId}
        ), matches AS (
          SELECT employee.id, COALESCE(NULLIF(employee.full_name, ''), employee.name) AS name,
            EXTRACT(DAY FROM employee.birth_date)::int AS day
          FROM users AS employee
          CROSS JOIN calendar
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
            AND EXTRACT(MONTH FROM employee.birth_date) = calendar.month
            AND EXTRACT(DAY FROM employee.birth_date) >= calendar.day
        )
        SELECT COUNT(*)::int AS total,
          COALESCE(
            jsonb_agg(jsonb_build_object('id', id, 'name', name, 'day', day) ORDER BY day, name, id),
            '[]'::jsonb
          ) AS items
        FROM matches
      `,
      this.prisma.$queryRaw<BirthdayAggregate[]>`
        WITH calendar AS (
          SELECT
            EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE organization.timezone)::int AS month,
            EXTRACT(DAY FROM CURRENT_TIMESTAMP AT TIME ZONE organization.timezone)::int AS day
          FROM organizations AS organization
          WHERE organization.id = ${organizationId}
        ), matches AS (
          SELECT company.id,
            COALESCE(NULLIF(company.fantasy_name, ''), NULLIF(company.company_name, ''), company.name) AS name,
            EXTRACT(DAY FROM company.opening_date)::int AS day
          FROM clients AS company
          CROSS JOIN calendar
          WHERE company.organization_id = ${organizationId}
            AND company.status = 'Ativo'
            AND company.type = 'PJ'
            AND company.opening_date IS NOT NULL
            AND EXTRACT(MONTH FROM company.opening_date) = calendar.month
            AND EXTRACT(DAY FROM company.opening_date) >= calendar.day
        )
        SELECT COUNT(*)::int AS total,
          COALESCE(
            jsonb_agg(jsonb_build_object('id', id, 'name', name, 'day', day) ORDER BY day, name, id),
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
      aiUsage: {
        competence: `${competence.getUTCFullYear()}-${String(competence.getUTCMonth() + 1).padStart(2, "0")}`,
        pendingKnowledge,
      },
      alerts,
    });
  }

  /**
   * Relatório legado de aniversariantes: o mês inteiro, sem cortar dias já passados.
   * Clientes PF entram pelo vínculo do legado: participação > 0 em empresa ativa,
   * sem saída registrada. `month` chega validado (1-12) pela rota.
   */
  async getMonthlyBirthdays(
    organizationId: string,
    month: number,
  ): Promise<MarketingMonthlyBirthdaysResponse> {
    const [employees, clients] = await this.prisma.$transaction([
      this.prisma.$queryRaw<MarketingMonthlyBirthdaysResponse["employees"]["items"]>`
        SELECT employee.id,
          COALESCE(NULLIF(employee.full_name, ''), employee.name) AS name,
          to_char(employee.birth_date, 'YYYY-MM-DD') AS "birthDate",
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
              SELECT 1 FROM departments AS scope
              WHERE scope.id = employee.department_id
                AND scope.organization_id = ${organizationId}
            )
          )
        )
          AND employee.status = 'active'
          AND employee.termination_date IS NULL
          AND employee.birth_date IS NOT NULL
          AND EXTRACT(MONTH FROM employee.birth_date) = ${month}
        ORDER BY day, name, employee.id
      `,
      this.prisma.$queryRaw<MarketingMonthlyBirthdaysResponse["clients"]["items"]>`
        SELECT person.id, person.name,
          to_char(person.date_of_birth, 'YYYY-MM-DD') AS "birthDate",
          EXTRACT(DAY FROM person.date_of_birth)::int AS day,
          string_agg(
            DISTINCT COALESCE(
              NULLIF(company.fantasy_name, ''), NULLIF(company.company_name, ''), company.name
            ),
            ', '
          ) AS companies
        FROM "clients.pf" AS person
        JOIN "regularize.partners" AS partner
          ON partner.pf_id = person.id
          AND partner.organization_id = ${organizationId}
          AND partner.part > 0
          AND partner.exit IS NULL
        JOIN clients AS company
          ON company.id = partner.pj_id
          AND company.organization_id = ${organizationId}
          AND company.status = 'Ativo'
        WHERE person.organization_id = ${organizationId}
          AND EXTRACT(MONTH FROM person.date_of_birth) = ${month}
        GROUP BY person.id, person.name, person.date_of_birth
        ORDER BY day, person.name, person.id
      `,
    ]);

    return marketingMonthlyBirthdaysResponseSchema.parse({
      month,
      employees: { total: employees.length, items: employees },
      clients: { total: clients.length, items: clients },
    });
  }
}
