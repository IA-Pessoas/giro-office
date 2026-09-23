// Smoke de CRUD com Prisma e Postgres reais (scripts/cloudflare-smoke/crud-db.mjs up).
// Pega o que o Prisma mockado dos testes unitários aceita e o banco recusa: campo fora do
// schema do Worker ("Unknown argument"), tabela sem @@map, coluna NOT NULL não preenchida.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import {
  expectOk,
  requireSmokeState,
  smokeCall,
  smokeEnv,
  smokeInsert,
  smokeState,
} from "../../runtime/src/crudSmoke.js";
import { createTriagemWorkerApp, type TriagemWorkerEnv } from "./app.js";

// O banco do smoke vem de `prisma db push`, sem as migrations que criam o papel usado em
// `SET LOCAL ROLE "giro_user_runtime"`. Recria só o papel e os GRANTs das migrations da Triagem
// (infra/prisma/migrations/*triagem*), para o smoke também pegar falta de privilégio.
const RUNTIME_GRANTS = [
  `GRANT SELECT ON TABLE "clients", "users", "organizations", "departments" TO giro_user_runtime`,
  `GRANT SELECT ON TABLE "triagem.configs", "triagem.responsibles" TO giro_user_runtime`,
  `GRANT SELECT ON TABLE "triagem.monthly", "triagem.bank_statements" TO giro_user_runtime`,
  `GRANT SELECT, INSERT ON TABLE "triagem.competence_catalog_snapshots", "triagem.competence_history" TO giro_user_runtime`,
  `GRANT SELECT, INSERT, UPDATE ON TABLE "triagem.catalog_items", "triagem.competences", "triagem.external_links", "triagem.outbox_events", "triagem.urgent_requests" TO giro_user_runtime`,
];

async function ensureRuntimeRole(databaseUrl: string): Promise<void> {
  const require = createRequire(new URL("../../../infra/package.json", import.meta.url));
  const { Client } = require("pg") as {
    Client: new (
      options: object,
    ) => {
      connect(): Promise<void>;
      end(): Promise<void>;
      query(text: string): Promise<unknown>;
    };
  };
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'giro_user_runtime') THEN
        CREATE ROLE giro_user_runtime NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      END IF;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    for (const grant of RUNTIME_GRANTS) await client.query(grant);
  } finally {
    await client.end();
  }
}

describe.skipIf(!smokeState)("triagem-service CRUD smoke (banco real)", () => {
  const auditCalls: unknown[] = [];
  const env = () =>
    smokeEnv<TriagemWorkerEnv>({
      AUDIT_SERVICE_TOKEN: "crud-smoke-audit-token",
      // Stub do binding do audit-service: a reconciliação só precisa de um 2xx.
      AUDIT_SERVICE: {
        fetch: async (request: Request) => {
          auditCalls.push(await request.json());
          return Response.json({ success: true }, { status: 201 });
        },
      },
    } as Partial<TriagemWorkerEnv>);
  const app = () => createTriagemWorkerApp({ env: env() });
  const call = (method: string, path: string, body?: unknown) =>
    smokeCall(app(), env(), method, path, body);

  let clientId = "";
  // O cliente é criado por execução, então a competência pode ser fixa.
  const competence = "2026-09";
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const state = requireSmokeState();
    await ensureRuntimeRole(state.databaseUrl);
    const client = await smokeInsert("clients", {
      id: randomUUID(),
      name: `Cliente Triagem ${suffix}`,
      company_name: `Cliente Triagem ${suffix} LTDA`,
    });
    clientId = String(client.id);
  });

  it("health e ready", async () => {
    expectOk(await call("GET", "/health"), "GET /health");
    expectOk(await call("GET", "/ready"), "GET /ready");
  });

  it("catálogo: cria, lista, atualiza e arquiva", async () => {
    const code = `smoke-link-${suffix}`;
    const created = expectOk(
      await call("POST", "/triagem/catalogs", {
        kind: "LINK_TYPE",
        code,
        label: "Portal Smoke",
        url: "https://portal.smoke.test/login",
      }),
      "POST /triagem/catalogs",
    );
    const id = created.data.id as string;
    expect(created.data).toMatchObject({ kind: "LINK_TYPE", code, url: expect.any(String) });

    const listed = expectOk(
      await call("GET", "/triagem/catalogs?kind=LINK_TYPE"),
      "GET /triagem/catalogs",
    );
    expect(listed.data.some((item: { id: string }) => item.id === id)).toBe(true);

    expectOk(
      await call("PATCH", `/triagem/catalogs/${id}`, {
        label: "Portal Smoke Renomeado",
        url: null,
      }),
      "PATCH /triagem/catalogs/:id",
    );
    const reread = expectOk(
      await call("GET", "/triagem/catalogs?kind=LINK_TYPE"),
      "GET após PATCH",
    );
    const updated = reread.data.find((item: { id: string }) => item.id === id);
    expect(updated).toMatchObject({ label: "Portal Smoke Renomeado", url: null });

    expectOk(await call("PATCH", `/triagem/catalogs/${id}/archive`), "PATCH archive catálogo");
    const archived = expectOk(
      await call("GET", "/triagem/catalogs?kind=LINK_TYPE&include_archived=true"),
      "GET arquivados",
    );
    expect(archived.data.find((item: { id: string }) => item.id === id)?.archived_at).toBeTruthy();
  });

  it("competência, links externos, urgências, histórico, overview e reconciliação", async () => {
    const state = requireSmokeState();
    const linkType = `smoke-type-${suffix}`;
    expectOk(
      await call("POST", "/triagem/catalogs", { kind: "LINK_TYPE", code: linkType, label: "Tipo" }),
      "POST catálogo LINK_TYPE",
    );

    // Competência (triagemCompetenceService.create) congela snapshot do catálogo.
    const createdCompetence = expectOk(
      await call("POST", "/triagem/competencies", { client_id: clientId, competence }),
      "POST /triagem/competencies",
    );
    const competenceId = createdCompetence.data.id as string;
    const competencies = expectOk(
      await call("GET", `/triagem/competencies?client_id=${clientId}&include_archived=true`),
      "GET /triagem/competencies",
    );
    expect(competencies.data.some((item: { id: string }) => item.id === competenceId)).toBe(true);
    const snapshot = expectOk(
      await call(
        "GET",
        `/triagem/catalogs?kind=LINK_TYPE&client_id=${clientId}&competence=${competence}`,
      ),
      "GET catálogo por competência (snapshot)",
    );
    expect(snapshot.data.some((item: { code: string }) => item.code === linkType)).toBe(true);

    // Links externos (triagemExternalLinkService).
    const link = expectOk(
      await call("POST", "/triagem/external-links", {
        client_id: clientId,
        competence,
        type: linkType,
        url: "https://banco.smoke.test/extrato",
        description: "Extrato do mês",
        responsible_id: state.userId,
      }),
      "POST /triagem/external-links",
    );
    const linkId = link.data.id as string;
    expectOk(
      await call("PUT", `/triagem/external-links/${linkId}`, {
        type: linkType,
        url: "https://banco.smoke.test/extrato-2",
        description: "Extrato revisado",
        responsible_id: state.ownerId,
      }),
      "PUT /triagem/external-links/:id",
    );
    const links = expectOk(
      await call("GET", `/triagem/external-links?client_id=${clientId}&competence=${competence}`),
      "GET /triagem/external-links",
    );
    expect(links.data.find((item: { id: string }) => item.id === linkId)).toMatchObject({
      url: "https://banco.smoke.test/extrato-2",
      description: "Extrato revisado",
      responsible_id: state.ownerId,
    });
    expectOk(
      await call("PATCH", `/triagem/external-links/${linkId}/archive`),
      "PATCH archive link",
    );
    const archivedLinks = expectOk(
      await call(
        "GET",
        `/triagem/external-links?client_id=${clientId}&competence=${competence}&include_archived=true`,
      ),
      "GET links arquivados",
    );
    expect(
      archivedLinks.data.find((item: { id: string }) => item.id === linkId)?.archived_at,
    ).toBeTruthy();

    // Solicitações urgentes (triagemUrgentRequestService).
    const urgent = expectOk(
      await call("POST", "/triagem/urgent-requests", {
        client_id: clientId,
        competence,
        urgency_code: "HIGH",
        description: `Guia vencendo ${suffix}`,
        responsible_id: state.userId,
      }),
      "POST /triagem/urgent-requests",
    );
    const urgentId = urgent.data.id as string;
    expectOk(
      await call("PUT", `/triagem/urgent-requests/${urgentId}`, {
        urgency_code: "CRITICAL",
        description: `Guia vencida ${suffix}`,
        responsible_id: state.ownerId,
      }),
      "PUT /triagem/urgent-requests/:id",
    );
    const urgentList = expectOk(
      await call("GET", `/triagem/urgent-requests?client_id=${clientId}&competence=${competence}`),
      "GET /triagem/urgent-requests",
    );
    expect(urgentList.data.find((item: { id: string }) => item.id === urgentId)).toMatchObject({
      urgency_code: "CRITICAL",
      description: `Guia vencida ${suffix}`,
      responsible_id: state.ownerId,
      status: "OPEN",
    });

    const overview = expectOk(
      await call(
        "GET",
        `/triagem/overview?page=1&page_size=20&client_id=${clientId}&competence=${competence}&status=URGENT_OPEN`,
      ),
      "GET /triagem/overview",
    );
    expect(JSON.stringify(overview.data)).toContain(clientId);

    expectOk(
      await call("PATCH", `/triagem/urgent-requests/${urgentId}/close`, {
        resolution_note: "Guia paga",
      }),
      "PATCH close",
    );
    const closed = expectOk(
      await call(
        "GET",
        `/triagem/urgent-requests?client_id=${clientId}&competence=${competence}&status=CLOSED`,
      ),
      "GET urgências fechadas",
    );
    expect(closed.data.find((item: { id: string }) => item.id === urgentId)).toMatchObject({
      status: "CLOSED",
      resolution_note: "Guia paga",
    });
    expectOk(await call("PATCH", `/triagem/urgent-requests/${urgentId}/reopen`), "PATCH reopen");
    const reopened = expectOk(
      await call(
        "GET",
        `/triagem/urgent-requests?client_id=${clientId}&competence=${competence}&status=OPEN`,
      ),
      "GET urgências reabertas",
    );
    expect(reopened.data.some((item: { id: string }) => item.id === urgentId)).toBe(true);

    // Arquiva a competência e confere o histórico append-only.
    expectOk(
      await call("PATCH", `/triagem/competencies/${competenceId}/archive`),
      "PATCH archive competência",
    );
    const history = expectOk(
      await call("GET", `/triagem/competencies/${competenceId}/history?page=1&page_size=20`),
      "GET /triagem/competencies/:id/history",
    );
    expect(history.data.total).toBeGreaterThanOrEqual(2);

    const reconcile = expectOk(
      await call("POST", "/internal/triagem/audit/reconcile"),
      "POST /internal/triagem/audit/reconcile",
    );
    expect(reconcile.data).toBeTruthy();
    expect(auditCalls.length).toBeGreaterThan(0);
  });
});
