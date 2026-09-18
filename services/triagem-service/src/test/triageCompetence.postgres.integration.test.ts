/**
 * PostgreSQL real: definir `TRIAGEM_POSTGRES_INTEGRATION=1`,
 * `TRIAGEM_POSTGRES_DISPOSABLE=1`, `TRIAGEM_POSTGRES_ADMIN_URL` e
 * `TRIAGEM_POSTGRES_RUNTIME_URL`.
 *
 * O banco precisa ser descartável: o cleanup desabilita temporariamente o
 * trigger apenas para remover as fixtures do teste. A credencial admin só
 * cria/remove fixtures; as asserções de isolamento usam a credencial runtime.
 */
import "./envBootstrap.js";

import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../generated/prisma/client.js";
import { TriageCatalogService } from "../services/triageCatalogService.js";
import { TriageCompetenceService } from "../services/triageCompetenceService.js";
import { TriageOverviewService } from "../services/triageOverviewService.js";

const runIntegration = process.env.TRIAGEM_POSTGRES_INTEGRATION === "1";
const integrationDescribe = runIntegration ? describe : describe.skip;

type OrganizationFixture = {
  organizationId: string;
  userId: string;
  clientId: string;
};

integrationDescribe("triagem-service PostgreSQL integration", () => {
  let adminPrisma: PrismaClient;
  let runtimePrisma: PrismaClient;
  let fixtureA: OrganizationFixture;
  let fixtureB: OrganizationFixture;
  let service: TriageCompetenceService;
  let catalogService: TriageCatalogService;
  let overviewService: TriageOverviewService;

  async function createFixture(label: string): Promise<OrganizationFixture> {
    const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const organization = await adminPrisma.organization.create({
      data: {
        name: `Triagem ${label} ${stamp}`,
        slug: `triagem-${label.toLowerCase()}-${stamp}`,
        cnpj: `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`,
        email_created_by: `triagem-${label.toLowerCase()}-${stamp}@example.com`,
      },
    });
    const department = await adminPrisma.department.create({
      data: {
        name: `Triagem ${label} ${stamp}`,
        color: "#2563EB",
        status: "active",
        organization_id: organization.id,
      },
    });
    const user = await adminPrisma.user.create({
      data: {
        name: `Triagem usuário ${label} ${stamp}`,
        login: `triagem-${label.toLowerCase()}-${stamp}`,
        password: "integration-only",
        permission: 0,
        status: "active",
        department_id: department.id,
        organization_id: organization.id,
      },
    });
    const client = await adminPrisma.client.create({
      data: {
        name: `Triagem cliente ${label} ${stamp}`,
        organization_id: organization.id,
        status: "Ativo",
        prospecting_status: "Lead",
        cpf_cnpj: "",
        service_unique: false,
      },
    });

    return { organizationId: organization.id, userId: user.id, clientId: client.id };
  }

  function auth(fixture: OrganizationFixture) {
    return {
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      permission: 2,
      modules: { triagem: 2 },
    };
  }

  async function withRuntimeOrganization<T>(
    organizationId: string,
    callback: (transaction: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return runtimePrisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL ROLE "giro_user_runtime"`;
      await transaction.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
      return callback(transaction as unknown as PrismaClient);
    });
  }

  beforeAll(async () => {
    if (process.env.TRIAGEM_POSTGRES_DISPOSABLE !== "1") {
      throw new Error(
        "TRIAGEM_POSTGRES_DISPOSABLE=1 é obrigatório: o teste usa um banco descartável para limpar fixtures append-only.",
      );
    }
    const adminUrl = process.env.TRIAGEM_POSTGRES_ADMIN_URL;
    const runtimeUrl = process.env.TRIAGEM_POSTGRES_RUNTIME_URL;
    if (!adminUrl?.trim() || !runtimeUrl?.trim()) {
      throw new Error(
        "TRIAGEM_POSTGRES_ADMIN_URL e TRIAGEM_POSTGRES_RUNTIME_URL são obrigatórias quando TRIAGEM_POSTGRES_INTEGRATION=1.",
      );
    }

    adminPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl }) });
    runtimePrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: runtimeUrl }) });

    const [runtimeRole] = await runtimePrisma.$queryRaw<
      Array<{ member: boolean; superuser: boolean; bypassrls: boolean }>
    >`
      SELECT
        pg_has_role(current_user, 'giro_user_runtime', 'member') AS member,
        r.rolsuper AS superuser,
        r.rolbypassrls AS bypassrls
      FROM pg_roles AS r
      WHERE r.rolname = current_user
    `;
    if (!runtimeRole?.member || runtimeRole.superuser || runtimeRole.bypassrls) {
      throw new Error(
        "TRIAGEM_POSTGRES_RUNTIME_URL precisa apontar para principal não-superuser, sem BYPASSRLS, membro de giro_user_runtime.",
      );
    }

    fixtureA = await createFixture("Alfa");
    fixtureB = await createFixture("Beta");
    service = new TriageCompetenceService(runtimePrisma);
    catalogService = new TriageCatalogService(runtimePrisma);
    overviewService = new TriageOverviewService(runtimePrisma);
  });

  afterAll(async () => {
    if (!adminPrisma) {
      return;
    }

    for (const fixture of [fixtureA, fixtureB]) {
      if (!fixture) {
        continue;
      }
      await adminPrisma.triageOutboxEvent.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.triageUrgentRequest.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.triageMonthly.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.triageBankStatement.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.triageCompetenceCatalogSnapshot.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.$executeRaw`
        ALTER TABLE "triagem.competence_history"
        DISABLE TRIGGER triagem_competence_history_append_only
      `;
      try {
        await adminPrisma.triageCompetenceHistory.deleteMany({
          where: { organization_id: fixture.organizationId },
        });
      } finally {
        await adminPrisma.$executeRaw`
          ALTER TABLE "triagem.competence_history"
          ENABLE TRIGGER triagem_competence_history_append_only
        `;
      }
      await adminPrisma.triageCompetence.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.triageCatalogItem.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.triageConfig.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.triageResponsible.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.client.deleteMany({ where: { organization_id: fixture.organizationId } });
      await adminPrisma.user.deleteMany({ where: { organization_id: fixture.organizationId } });
      await adminPrisma.department.deleteMany({
        where: { organization_id: fixture.organizationId },
      });
      await adminPrisma.organization.delete({ where: { id: fixture.organizationId } });
    }
    await runtimePrisma?.$disconnect();
    await adminPrisma.$disconnect();
  });

  it("isola leitura por organização no banco e mantém snapshots locais", async () => {
    const createdA = await service.create(
      { client_id: fixtureA.clientId, competence: "2026-09" },
      auth(fixtureA),
    );
    await service.create({ client_id: fixtureB.clientId, competence: "2026-09" }, auth(fixtureB));

    const rowsVisibleToA = await withRuntimeOrganization(
      fixtureA.organizationId,
      (transaction) =>
        transaction.$queryRaw<Array<{ id: string; organization_id: string }>>`
        SELECT id, organization_id FROM "triagem.competences"
      `,
    );
    expect(rowsVisibleToA).toHaveLength(1);
    expect(rowsVisibleToA[0]).toMatchObject({
      id: createdA.id,
      organization_id: fixtureA.organizationId,
    });

    const listA = await service.list({}, auth(fixtureA));
    expect(listA).toHaveLength(1);
    expect(listA[0]).not.toHaveProperty("organization_id");
    expect(listA[0]?.configuration_snapshot).toMatchObject({ version: 1, configs: [] });
    expect(listA[0]?.responsible_snapshot).toMatchObject({ version: 1, responsibles: [] });
  });

  it("rejeita leitura e escrita cross-tenant pelo RLS", async () => {
    const rowsVisibleToA = await withRuntimeOrganization(
      fixtureA.organizationId,
      (transaction) =>
        transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "triagem.competences"
      `,
    );
    expect(rowsVisibleToA).toHaveLength(1);

    await expect(
      withRuntimeOrganization(
        fixtureA.organizationId,
        (transaction) =>
          transaction.$executeRaw`
          INSERT INTO "triagem.competences" (
            id, organization_id, client_id, competence,
            configuration_snapshot, responsible_snapshot, updated_at
          ) VALUES (
            ${randomUUID()}, ${fixtureB.organizationId}, ${fixtureB.clientId}, '2026-99',
            '{}'::jsonb, '{}'::jsonb, CURRENT_TIMESTAMP
          )
        `,
      ),
    ).rejects.toThrow(/row-level security|permission denied/u);
  });

  it("deriva precedência, paginação e reabertura nas tabelas PostgreSQL", async () => {
    const monthly = await adminPrisma.triageMonthly.create({
      data: {
        client_id: fixtureA.clientId,
        competence: "2026-09",
        type: "CONTABIL",
        checklist: { item: "PENDING" },
        organization_id: fixtureA.organizationId,
      },
    });
    const bank = await adminPrisma.triageBankStatement.create({
      data: {
        client_id: fixtureA.clientId,
        competence: "2026-09",
        bank_id: `bank-${randomUUID()}`,
        status: "PENDING",
        organization_id: fixtureA.organizationId,
      },
    });
    const urgent = await adminPrisma.triageUrgentRequest.create({
      data: {
        organization_id: fixtureA.organizationId,
        client_id: fixtureA.clientId,
        competence: "2026-09",
        requester_id: fixtureA.userId,
        responsible_id: fixtureA.userId,
        urgency_code: "HIGH",
        description: "Integração PostgreSQL",
        dedupe_key: `overview-${randomUUID()}`,
      },
    });

    const authA = auth(fixtureA);
    await expect(overviewService.list({ page: 1, pageSize: 1 }, authA)).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ status: "URGENT_OPEN" })],
      indicators: { urgent_open: 1, routine_pending: 0, bank_pending: 0, complete: 0 },
    });

    await adminPrisma.triageUrgentRequest.update({
      where: { id: urgent.id },
      data: { status: "CLOSED" },
    });
    await expect(overviewService.list({ page: 1, pageSize: 1 }, authA)).resolves.toMatchObject({
      items: [expect.objectContaining({ status: "ROUTINE_PENDING" })],
    });

    await adminPrisma.triageMonthly.update({
      where: { id: monthly.id },
      data: { checklist: { item: "COMPLETED" } },
    });
    await expect(overviewService.list({ page: 1, pageSize: 1 }, authA)).resolves.toMatchObject({
      items: [expect.objectContaining({ status: "BANK_PENDING" })],
    });

    await adminPrisma.triageBankStatement.update({
      where: { id: bank.id },
      data: { status: "COMPLETED" },
    });
    await expect(overviewService.list({ page: 1, pageSize: 1 }, authA)).resolves.toMatchObject({
      items: [expect.objectContaining({ status: "COMPLETE" })],
    });

    await service.create({ client_id: fixtureA.clientId, competence: "2026-08" }, authA);
    await expect(overviewService.list({ page: 1, pageSize: 1 }, authA)).resolves.toMatchObject({
      total: 2,
      page_size: 1,
      items: [expect.objectContaining({ competence: "2026-09" })],
    });
  });

  it("isola catálogos por organização e congela os valores da competência", async () => {
    const codeA = `RLS_A_${randomUUID().slice(0, 8)}`;
    const codeB = `RLS_B_${randomUUID().slice(0, 8)}`;
    const catalogA = await catalogService.create(
      { kind: "JUSTIFICATION", code: codeA, label: "A" },
      auth(fixtureA),
    );
    const catalogB = await catalogService.create(
      { kind: "JUSTIFICATION", code: codeB, label: "B" },
      auth(fixtureB),
    );

    const visibleToA = await catalogService.list({ kind: "JUSTIFICATION" }, auth(fixtureA));
    expect(visibleToA.map((item) => item.code)).toEqual([codeA]);

    await expect(
      withRuntimeOrganization(
        fixtureA.organizationId,
        (transaction) =>
          transaction.$executeRaw`
          INSERT INTO "triagem.catalog_items" (
            id, organization_id, kind, code, label, updated_at
          ) VALUES (
            ${randomUUID()}, ${fixtureB.organizationId}, 'JUSTIFICATION',
            ${`RLS_FORBIDDEN_${randomUUID().slice(0, 8)}`}, 'Forbidden', CURRENT_TIMESTAMP
          )
        `,
      ),
    ).rejects.toThrow(/row-level security|permission denied/u);

    const competence = await service.create(
      { client_id: fixtureA.clientId, competence: "2026-11" },
      auth(fixtureA),
    );
    const snapshot = await catalogService.snapshotForCompetence(
      fixtureA.organizationId,
      competence.id,
    );
    expect(snapshot.map((item) => item.code)).toContain(codeA);

    const visibleSnapshotsToA = await withRuntimeOrganization(
      fixtureA.organizationId,
      (transaction) =>
        transaction.$queryRaw<Array<{ organization_id: string }>>`
          SELECT organization_id
          FROM "triagem.competence_catalog_snapshots"
        `,
    );
    expect(visibleSnapshotsToA).toEqual(
      expect.arrayContaining([{ organization_id: fixtureA.organizationId }]),
    );
    expect(
      visibleSnapshotsToA.every((row) => row.organization_id === fixtureA.organizationId),
    ).toBe(true);

    const competenceB = await adminPrisma.triageCompetence.findFirstOrThrow({
      where: {
        organization_id: fixtureB.organizationId,
        client_id: fixtureB.clientId,
        competence: "2026-09",
      },
      select: { id: true },
    });
    await expect(
      withRuntimeOrganization(
        fixtureA.organizationId,
        (transaction) =>
          transaction.$executeRaw`
          INSERT INTO "triagem.competence_catalog_snapshots" (
            id, organization_id, competence_id, catalog_item_id,
            kind, code, label, created_at
          ) VALUES (
            ${randomUUID()}, ${fixtureB.organizationId}, ${competenceB.id}, ${catalogB.id},
            'JUSTIFICATION', ${codeB}, 'B', CURRENT_TIMESTAMP
          )
        `,
      ),
    ).rejects.toThrow(/row-level security|permission denied/u);
    expect(catalogA.id).not.toBe(catalogB.id);
  });

  it("rejeita mutação direta do histórico append-only", async () => {
    const history = await adminPrisma.triageCompetenceHistory.findFirst({
      where: { organization_id: fixtureA.organizationId },
    });
    expect(history).not.toBeNull();

    await expect(
      adminPrisma.$executeRaw`
        UPDATE "triagem.competence_history"
        SET action = 'tampered'
        WHERE id = ${history?.id}
      `,
    ).rejects.toThrow(/append-only/u);
  });

  it("mantém uma única competência, histórico e outbox sob criação concorrente", async () => {
    const input = { client_id: fixtureA.clientId, competence: "2026-10" };
    const results = await Promise.all([
      service.create(input, auth(fixtureA)),
      service.create(input, auth(fixtureA)),
    ]);

    expect(results[0]?.id).toBe(results[1]?.id);
    expect(
      await adminPrisma.triageCompetence.count({
        where: {
          organization_id: fixtureA.organizationId,
          client_id: fixtureA.clientId,
          competence: input.competence,
        },
      }),
    ).toBe(1);
    expect(
      await adminPrisma.triageCompetenceHistory.count({
        where: { organization_id: fixtureA.organizationId, action: "created" },
      }),
    ).toBe(2);
    expect(
      await adminPrisma.triageOutboxEvent.count({
        where: {
          organization_id: fixtureA.organizationId,
          event_type: "triage.competence.created",
        },
      }),
    ).toBe(2);
  });
});
