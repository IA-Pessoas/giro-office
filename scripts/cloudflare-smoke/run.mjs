#!/usr/bin/env node
// Smoke real (banco de verdade) dos Workers contabil, fiscal, triagem, parcelamento, pessoal e gateway.
// Modo padrão: banco LOCAL descartável em Docker. Ver o runbook em
// .superpowers/sdd/2026-09-21-cloudflare-migration/reports/smoke-real-db-runbook.md
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertTargetAllowed, csrfPair, newRunId, signJwt, signReportingGrant } from "./lib.mjs";
import {
  applyMigrations,
  generateServicePrismaClients,
  generateWorkerPrismaClients,
  randomSecret,
  removePostgres,
  repoRoot,
  requireDocker,
  restoreServicePrismaClients,
  run,
  startPostgres,
  startWorkers,
  stopWorkers,
  WORKERS,
} from "./local-env.mjs";

const require = createRequire(join(repoRoot, "infra", "package.json"));
const { Client } = require("pg");

const RLS_TABLES = [
  "users",
  "organizations",
  "departments",
  "permissions",
  "triagem.catalog_items",
  "triagem.competences",
  "triagem.external_links",
  "triagem.urgent_requests",
  "triagem.outbox_events",
];

// Tabelas limpas no fim do run, todas filtradas por organization_id de teste.
const CLEANUP_TABLES = [
  "audit_requests",
  "triagem.outbox_events",
  "triagem.competence_history",
  "triagem.competence_catalog_snapshots",
  "triagem.external_links",
  "triagem.urgent_requests",
  "triagem.competences",
  "triagem.catalog_items",
  "fiscal.ncm",
  "integracao.tasks",
  "integracao.tasksModel",
  "integracao.projects",
  "contabil.relationship",
  "parcelamento.installmentsCompetencies",
  "parcelamento.installments",
  "parcelamento.panorama",
  "pessoal.union",
  "clients",
  "permissions",
  "users",
  "departments",
  "organizations",
];

const results = [];
let failures = 0;

async function check(name, fn, { fatal = false } = {}) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: "ok", ms: Date.now() - startedAt, detail: detail ?? "" });
    console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
    return true;
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "fail", ms: Date.now() - startedAt, detail: message });
    console.error(`FAIL ${name} — ${message}`);
    if (fatal) throw error;
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function http(baseUrl, path, options = {}) {
  const { method = "GET", body, token, cookies, csrf, headers = {}, requestId } = options;
  const finalHeaders = { ...headers };
  if (token) finalHeaders.authorization = `Bearer ${token}`;
  if (cookies) finalHeaders.cookie = cookies;
  if (csrf) finalHeaders["x-csrf-token"] = csrf;
  if (requestId) finalHeaders["x-request-id"] = requestId;
  if (body !== undefined) finalHeaders["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: finalHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, json, text };
}

function expectStatus(response, expected, context) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert(
    allowed.includes(response.status),
    `${context}: esperado ${allowed.join("/")}, recebido ${response.status} ${response.text.slice(0, 300)}`,
  );
  return response.json;
}

function selfCheck() {
  console.log("== self-check (sem banco, sem rede) ==");
  const tests = run(
    "node",
    ["--test", join(repoRoot, "scripts", "cloudflare-smoke", "lib.test.mjs")],
    {
      cwd: repoRoot,
    },
  );
  process.stdout.write(tests.stdout?.split("\n").slice(-8).join("\n") ?? "");
  assert(tests.status === 0, "testes de lib.mjs falharam");

  const wrangler = run("pnpm", ["exec", "wrangler", "--version"], { cwd: repoRoot });
  assert(wrangler.status === 0, "wrangler indisponível");
  const docker = run("docker", ["info", "--format", "{{.ServerVersion}}"]);

  const migrations = readdirSync(join(repoRoot, "infra", "prisma", "migrations")).filter(
    (entry) => entry !== "migration_lock.toml",
  );
  const { statSync } = require("node:fs");
  for (const worker of WORKERS) statSync(join(repoRoot, worker.dir, "wrangler.jsonc"));
  console.log(`ok   wrangler ${wrangler.stdout.trim().split("\n").pop()}`);
  console.log(`ok   ${WORKERS.length} Workers com wrangler.jsonc`);
  console.log(`ok   ${migrations.length} migrations em infra/prisma/migrations`);
  console.log(
    docker.status === 0
      ? `ok   docker ${docker.stdout.trim()}`
      : "warn docker indisponível: só modo external",
  );
  return 0;
}

async function main() {
  if (process.argv.includes("--self-check")) {
    process.exit(selfCheck());
  }

  const mode = process.env.SMOKE_MODE ?? "local";
  const runId = newRunId();
  const portBase = Number(process.env.SMOKE_PORT_BASE ?? 8870);
  const tmpDir = mkdtempSync(join(tmpdir(), `${runId}-`));
  const cleanup = [];
  let databaseUrl;
  let baseUrls;
  let secrets;
  let migrationWorkarounds = [];

  console.log(`== smoke cloudflare (${mode}) run=${runId} ==`);

  try {
    if (mode === "local") {
      requireDocker();
      secrets = {
        jwtSecret: randomSecret(),
        internalToken: randomSecret(),
        auditToken: randomSecret(),
        reportsToken: randomSecret(),
        grantSecret: randomSecret(),
      };
      const postgres = await startPostgres({
        runId,
        image: process.env.SMOKE_PG_IMAGE ?? "public.ecr.aws/supabase/postgres:17.6.1.167",
      });
      cleanup.push(() => removePostgres(postgres.container));
      databaseUrl = postgres.databaseUrl;
      assertTargetAllowed({ mode, databaseUrl, baseUrls: [] });
      console.log(
        `ok   postgres descartável em 127.0.0.1:${postgres.port} (${postgres.container})`,
      );

      ({ workarounds: migrationWorkarounds } = applyMigrations(databaseUrl, {
        strict: process.env.SMOKE_STRICT_MIGRATIONS === "1",
      }));
      for (const workaround of migrationWorkarounds) {
        console.log(`WORKAROUND migration ${workaround.migration}: ${workaround.reason}`);
      }

      generateWorkerPrismaClients(tmpDir);
      generateServicePrismaClients(tmpDir, databaseUrl);
      cleanup.push(() => restoreServicePrismaClients(databaseUrl));
      const workers = await startWorkers({ tmpDir, databaseUrl, secrets, portBase });
      cleanup.push(() => stopWorkers(workers.processes));
      baseUrls = workers.baseUrls;
      console.log(`ok   ${WORKERS.length} Workers no ar (logs em ${tmpDir})`);
    } else {
      databaseUrl = requireEnv("SMOKE_DATABASE_URL");
      baseUrls = Object.fromEntries(
        WORKERS.map((worker) => [
          worker.key,
          requireEnv(`SMOKE_BASE_URL_${worker.key.toUpperCase()}`),
        ]),
      );
      secrets = {
        jwtSecret: requireEnv("SMOKE_JWT_SECRET"),
        internalToken: requireEnv("SMOKE_INTERNAL_SERVICE_TOKEN"),
        auditToken: requireEnv("SMOKE_AUDIT_SERVICE_TOKEN"),
        reportsToken: requireEnv("SMOKE_REPORTS_INTERNAL_TOKEN"),
        grantSecret: requireEnv("SMOKE_REPORTS_GRANT_SECRET"),
      };
      assertTargetAllowed({
        mode,
        databaseUrl,
        baseUrls: Object.values(baseUrls),
        allowExternal: process.env.SMOKE_ALLOW_EXTERNAL,
        confirmWrites: process.env.SMOKE_CONFIRM_WRITES,
      });
      console.log("ok   alvo externo confirmado pelo operador");
    }

    const db = new Client({ connectionString: databaseUrl });
    await db.connect();
    cleanup.push(() => db.end());
    const sql = (text, params = []) => db.query(text, params);

    const fixtures = await runChecks({
      db,
      sql,
      baseUrls,
      secrets,
      runId,
      mode,
      migrationWorkarounds,
    });
    await check("cleanup.dados_de_teste", async () => {
      const removed = await cleanupFixtures(sql, fixtures);
      return `${removed} linhas removidas`;
    });
  } finally {
    for (const undo of cleanup.reverse()) {
      try {
        await undo();
      } catch (error) {
        console.error(`aviso: limpeza falhou — ${error instanceof Error ? error.message : error}`);
      }
    }
    if (process.env.SMOKE_KEEP_TMP !== "1") rmSync(tmpDir, { recursive: true, force: true });
    else console.log(`tmp preservado em ${tmpDir}`);
  }

  console.log("\n== resumo ==");
  for (const result of results) {
    console.log(`${result.status === "ok" ? "ok  " : "FAIL"} ${result.name} (${result.ms}ms)`);
  }
  if (migrationWorkarounds.length > 0) {
    console.log(
      `workarounds de migration: ${migrationWorkarounds.map((item) => item.migration).join(", ")}`,
    );
  }
  console.log(`${results.length} etapas, ${failures} falha(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável ${name} é obrigatória neste modo (ver runbook).`);
  return value;
}

function tokenFor({ secrets, organizationId, userId, session }) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      user_id: userId,
      organization_id: organizationId,
      permission: 3,
      type: "owner",
      auth_kind: "organization",
      modules: {
        certificado: 3,
        comercial: 3,
        contabil: 3,
        financeiro: 3,
        fiscal: 3,
        integracao: 3,
        marketing: 3,
        parcelamento: 3,
        pessoal: 3,
        regularize: 3,
        rh: 3,
        ti: 3,
        triagem: 3,
      },
      ...(session
        ? { session_id: session.id, session_version: 0, csrf_hash: session.csrfHash }
        : {}),
      iat: now,
      exp: now + 3600,
    },
    secrets.jwtSecret,
  );
}

async function runChecks({ db, sql, baseUrls, secrets, runId, mode, migrationWorkarounds }) {
  const fixtures = {
    orgA: randomUUID(),
    orgB: randomUUID(),
    userA: randomUUID(),
    userB: randomUUID(),
    deptA: randomUUID(),
    deptB: randomUUID(),
    clientA: randomUUID(),
    clientB: randomUUID(),
    sessionA: { id: randomUUID(), ...csrfPair() },
    created: [],
  };

  await check(
    "db.conexao",
    async () => {
      const { rows } = await sql(
        "select current_user as usuario, current_setting('server_version') as versao, inet_server_port() as porta",
      );
      return `${rows[0].usuario}@pg${rows[0].versao} porta ${rows[0].porta}`;
    },
    { fatal: true },
  );

  await check(
    "db.migrations_aplicadas",
    async () => {
      const expected = readdirSync(join(repoRoot, "infra", "prisma", "migrations")).filter(
        (entry) => entry !== "migration_lock.toml",
      );
      const { rows } = await sql(
        `select migration_name,
                bool_or(finished_at is not null and rolled_back_at is null) as aplicada,
                bool_or(rolled_back_at is not null) as teve_falha
           from _prisma_migrations group by migration_name`,
      );
      const state = new Map(rows.map((row) => [row.migration_name, row]));
      const missing = expected.filter((name) => !state.get(name)?.aplicada);
      assert(missing.length === 0, `migrations não aplicadas: ${missing.join(", ")}`);
      const retried = rows.filter((row) => row.teve_falha).map((row) => row.migration_name);
      const workaroundNames = migrationWorkarounds.map((item) => item.migration);
      const unexplained = retried.filter((name) => !workaroundNames.includes(name));
      assert(
        unexplained.length === 0,
        `migrations com falha registrada e sem workaround conhecido: ${unexplained.join(", ")}`,
      );
      const workaroundNote =
        migrationWorkarounds.length > 0
          ? ` (${migrationWorkarounds.length} via workaround local)`
          : "";
      return `${expected.length} migrations aplicadas${workaroundNote}`;
    },
    { fatal: mode === "local" },
  );

  await check("db.rls_configurado", async () => {
    const { rows } = await sql(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1)`,
      [RLS_TABLES],
    );
    const missing = RLS_TABLES.filter(
      (table) => !rows.some((row) => row.relname === table && row.relrowsecurity),
    );
    assert(missing.length === 0, `tabelas sem RLS habilitado: ${missing.join(", ")}`);
    const role = await sql(
      "select rolbypassrls, rolsuper from pg_roles where rolname = 'giro_user_runtime'",
    );
    assert(role.rows.length === 1, "papel giro_user_runtime não existe");
    assert(
      role.rows[0].rolbypassrls === false && role.rows[0].rolsuper === false,
      "giro_user_runtime não pode ter BYPASSRLS/SUPERUSER",
    );
    return `${RLS_TABLES.length} tabelas com RLS e papel giro_user_runtime sem bypass`;
  });

  const seeded = await check(
    "seed.organizacoes_de_teste",
    async () => {
      await seedFixtures(sql, fixtures, runId);
      return `orgs ${fixtures.orgA.slice(0, 8)} (A) e ${fixtures.orgB.slice(0, 8)} (B)`;
    },
    { fatal: true },
  );
  assert(seeded, "seed obrigatório");

  const tokenA = tokenFor({ secrets, organizationId: fixtures.orgA, userId: fixtures.userA });
  const tokenB = tokenFor({ secrets, organizationId: fixtures.orgB, userId: fixtures.userB });
  const cookieTokenA = tokenFor({
    secrets,
    organizationId: fixtures.orgA,
    userId: fixtures.userA,
    session: { id: fixtures.sessionA.id, csrfHash: fixtures.sessionA.hash },
  });
  const cookieHeader = `cw.session=${cookieTokenA}; cw.csrf=${fixtures.sessionA.token}`;

  await check("workers.health_ready", async () => {
    for (const worker of WORKERS) {
      const health = await http(baseUrls[worker.key], "/health");
      expectStatus(health, 200, `${worker.key} /health`);
      const ready = await http(baseUrls[worker.key], "/ready");
      expectStatus(ready, 200, `${worker.key} /ready`);
    }
    return `${WORKERS.length} Workers com /health e /ready`;
  });

  await check("auth.sem_token_e_token_invalido", async () => {
    expectStatus(await http(baseUrls.gateway, "/fiscal/ncm/list"), 401, "gateway sem token");
    expectStatus(
      await http(baseUrls.gateway, "/fiscal/ncm/list", { token: "token.invalido.aqui" }),
      401,
      "gateway com token inválido",
    );
    expectStatus(
      await http(baseUrls.fiscal, "/fiscal/ncm/list", { token: "token.invalido.aqui" }),
      401,
      "fiscal com token inválido",
    );
    return "401 sem token e com token inválido";
  });

  await check("auth.bearer_direto_e_via_gateway", async () => {
    expectStatus(
      await http(baseUrls.fiscal, "/fiscal/ncm/list", { token: tokenA }),
      200,
      "fiscal bearer",
    );
    expectStatus(
      await http(baseUrls.gateway, "/fiscal/ncm/list", { token: tokenA }),
      200,
      "gateway bearer",
    );
    return "bearer aceito no Worker e no gateway";
  });

  await check("auth.cookie_csrf_via_gateway", async () => {
    expectStatus(
      await http(baseUrls.gateway, "/fiscal/ncm/list", { cookies: cookieHeader }),
      200,
      "GET com cookie",
    );
    const ncmBody = {
      tax_regime: `${runId}-regime`,
      ncm_code: "87654321",
      federal_taxation_type: "TRIBUTADO",
      description: `${runId} csrf`,
      validity_start_date: "2026-01-01",
    };
    expectStatus(
      await http(baseUrls.gateway, "/fiscal/ncm", {
        method: "POST",
        body: ncmBody,
        cookies: cookieHeader,
      }),
      403,
      "POST com cookie e sem CSRF",
    );
    const created = expectStatus(
      await http(baseUrls.gateway, "/fiscal/ncm", {
        method: "POST",
        body: ncmBody,
        cookies: cookieHeader,
        csrf: fixtures.sessionA.token,
      }),
      [200, 201],
      "POST com cookie e CSRF válido",
    );
    fixtures.created.push({ table: "fiscal.ncm", id: created.data.create.id });
    return "cookie + CSRF exigido em mutação, aceito quando válido";
  });

  let ncmId;
  await check("crud.fiscal_ncm", async () => {
    const body = {
      tax_regime: `${runId}-regime`,
      ncm_code: "11112222",
      federal_taxation_type: "TRIBUTADO",
      description: `${runId} ncm`,
      validity_start_date: "2026-01-01",
    };
    const created = expectStatus(
      await http(baseUrls.fiscal, "/fiscal/ncm", { method: "POST", body, token: tokenA }),
      [200, 201],
      "POST /fiscal/ncm",
    );
    ncmId = created.data.create.id;
    fixtures.created.push({ table: "fiscal.ncm", id: ncmId });
    const detail = expectStatus(
      await http(baseUrls.fiscal, `/fiscal/ncm?ncm_id=${ncmId}`, { token: tokenA }),
      200,
      "GET /fiscal/ncm",
    );
    assert(detail.data.detail.id === ncmId, "GET não retornou o NCM criado");
    const updated = expectStatus(
      await http(baseUrls.fiscal, "/fiscal/ncm", {
        method: "PUT",
        token: tokenA,
        body: { ...body, ncm_id: ncmId, description: `${runId} ncm alterado` },
      }),
      200,
      "PUT /fiscal/ncm",
    );
    assert(JSON.stringify(updated.data).includes("ncm alterado"), "PUT não refletiu a alteração");
    const list = expectStatus(
      await http(baseUrls.fiscal, "/fiscal/ncm/list", { token: tokenA }),
      200,
      "GET /fiscal/ncm/list",
    );
    assert(
      list.data.data.some((row) => row.id === ncmId),
      "lista não trouxe o NCM criado",
    );
    return "POST/GET/PUT/LIST em fiscal.ncm";
  });

  let relationshipId;
  await check("crud.contabil_relationships", async () => {
    const body = {
      client_id: fixtures.clientA,
      bidding: false,
      chart_accounts: "Não",
      tool: `${runId}-tool`,
      system: `${runId}-system`,
      note: `${runId}`,
    };
    const created = expectStatus(
      await http(baseUrls.contabil, "/contabil/relationships", {
        method: "POST",
        body,
        token: tokenA,
      }),
      [200, 201],
      "POST /contabil/relationships",
    );
    relationshipId = created.data?.id ?? created.data?.create?.id;
    assert(relationshipId, `resposta sem id: ${JSON.stringify(created).slice(0, 200)}`);
    fixtures.created.push({ table: "contabil.relationship", id: relationshipId });
    const list = expectStatus(
      await http(baseUrls.contabil, `/contabil/relationships/client/${fixtures.clientA}`, {
        token: tokenA,
      }),
      200,
      "GET /contabil/relationships/client/:id",
    );
    assert(JSON.stringify(list.data).includes(relationshipId), "lista não trouxe o vínculo criado");
    expectStatus(
      await http(baseUrls.contabil, `/contabil/relationships/${relationshipId}`, {
        method: "PUT",
        token: tokenA,
        body: { note: `${runId} alterado` },
      }),
      200,
      "PUT /contabil/relationships/:id",
    );
    return "POST/GET/PUT em contabil.relationship";
  });

  let catalogId;
  await check("crud.triagem_catalogs", async () => {
    const created = expectStatus(
      await http(baseUrls.triagem, "/triagem/catalogs", {
        method: "POST",
        token: tokenA,
        body: { kind: "LINK_TYPE", code: `${runId}-code`, label: `${runId} rótulo` },
      }),
      [200, 201],
      "POST /triagem/catalogs",
    );
    catalogId = created.data?.id ?? created.data?.create?.id;
    assert(catalogId, `resposta sem id: ${JSON.stringify(created).slice(0, 200)}`);
    fixtures.created.push({ table: "triagem.catalog_items", id: catalogId });
    const list = expectStatus(
      await http(baseUrls.triagem, "/triagem/catalogs?kind=LINK_TYPE", { token: tokenA }),
      200,
      "GET /triagem/catalogs",
    );
    assert(JSON.stringify(list.data).includes(catalogId), "catálogo criado não apareceu na lista");
    expectStatus(
      await http(baseUrls.triagem, `/triagem/catalogs/${catalogId}`, {
        method: "PATCH",
        token: tokenA,
        body: { label: `${runId} rótulo alterado` },
      }),
      200,
      "PATCH /triagem/catalogs/:id",
    );
    return "POST/GET/PATCH em triagem.catalog_items";
  });

  let installmentId;
  await check("crud.parcelamento_installments", async () => {
    const created = expectStatus(
      await http(baseUrls.parcelamento, "/parcelamento/installments", {
        method: "POST",
        token: tokenA,
        body: {
          client_id: fixtures.clientA,
          agreement_number: `${runId}-acordo`,
          type: "Ordinário",
          legal_nature: "Tributário",
          jurisdiction: "Federal",
          is_automatic_debit: false,
          first_installment_amount: 100,
          current_month_installment_amount: 100,
          agreed_installments_count: 12,
        },
      }),
      [200, 201],
      "POST /parcelamento/installments",
    );
    installmentId = created.data?.id ?? created.data?.create?.id;
    assert(installmentId, `resposta sem id: ${JSON.stringify(created).slice(0, 200)}`);
    fixtures.created.push({ table: "parcelamento.installments", id: installmentId });
    expectStatus(
      await http(baseUrls.parcelamento, `/parcelamento/installments/${installmentId}`, {
        token: tokenA,
      }),
      200,
      "GET /parcelamento/installments/:id",
    );
    expectStatus(
      await http(baseUrls.parcelamento, `/parcelamento/installments/${installmentId}`, {
        method: "PATCH",
        token: tokenA,
        body: { current_month_installment_amount: 150 },
      }),
      200,
      "PATCH /parcelamento/installments/:id",
    );
    const list = expectStatus(
      await http(baseUrls.parcelamento, "/parcelamento/installments", { token: tokenA }),
      200,
      "GET /parcelamento/installments",
    );
    assert(
      JSON.stringify(list.data).includes(installmentId),
      "lista não trouxe o parcelamento criado",
    );
    return "POST/GET/PATCH/LIST em parcelamento.installments";
  });

  // O recálculo de agregados roda em `$transaction({ isolationLevel: "ReadCommitted" })` com
  // `SELECT ... FOR NO KEY UPDATE` na linha do parcelamento (workers/parcelamento-service/src/
  // services.ts:222,303). Sem esse lock, escritas simultâneas leem o mesmo snapshot e a última
  // sobrescreve o total da primeira — lost update. Só concorrência real contra o Postgres prova
  // que não acontece; o teste unitário da corrida usa um Prisma falso.
  await check("transacao.parcelamento_lock_concorrente", async () => {
    const parallel = 6;
    const created = expectStatus(
      await http(baseUrls.parcelamento, "/parcelamento/installments", {
        method: "POST",
        token: tokenA,
        body: {
          client_id: fixtures.clientA,
          agreement_number: `${runId}-acordo-lock`,
          type: "Ordinário",
          legal_nature: "Tributário",
          jurisdiction: "Federal",
          is_automatic_debit: false,
          first_installment_amount: 100,
          current_month_installment_amount: 100,
          agreed_installments_count: 24,
        },
      }),
      [200, 201],
      "POST /parcelamento/installments (lock)",
    );
    const lockId = created.data?.id ?? created.data?.create?.id;
    assert(lockId, `resposta sem id: ${JSON.stringify(created).slice(0, 200)}`);
    fixtures.created.push({ table: "parcelamento.installments", id: lockId });

    const competency = (competence) => ({
      competence,
      how_many_paid: 1,
      how_many_overdue: 0,
      download: false,
      installment_amount: 100,
    });
    const post = (competence) =>
      http(baseUrls.parcelamento, `/parcelamento/installments/${lockId}/competencies`, {
        method: "POST",
        token: tokenA,
        body: competency(competence),
      });

    // Disparadas de uma vez: as transações se sobrepõem de verdade no banco.
    const responses = await Promise.all(
      Array.from({ length: parallel }, (_, index) =>
        post(`2026-${String(index + 1).padStart(2, "0")}`),
      ),
    );
    for (const [index, response] of responses.entries()) {
      expectStatus(response, 201, `POST competencies paralelo #${index + 1}`);
    }

    const after = expectStatus(
      await http(baseUrls.parcelamento, `/parcelamento/installments/${lockId}`, { token: tokenA }),
      200,
      "GET /parcelamento/installments/:id (lock)",
    );
    const paid = after.data?.paid_installments_count;
    assert(
      paid === parallel,
      `lost update: paid_installments_count=${paid}, esperado ${parallel} (o lock FOR NO KEY UPDATE não segurou)`,
    );
    const remaining = after.data?.remaining_installments_count;
    assert(
      remaining === 24 - parallel,
      `agregado derivado inconsistente: remaining_installments_count=${remaining}, esperado ${24 - parallel}`,
    );

    // Mesma competência em paralelo: exatamente uma vence, a outra recebe 409 e não altera o total.
    const duplicated = await Promise.all([post("2026-12"), post("2026-12")]);
    const statuses = duplicated.map((response) => response.status).sort();
    assert(
      statuses[0] === 201 && statuses[1] === 409,
      `esperado um 201 e um 409 na competência duplicada, recebido ${statuses.join("/")}`,
    );

    const settled = expectStatus(
      await http(baseUrls.parcelamento, `/parcelamento/installments/${lockId}`, { token: tokenA }),
      200,
      "GET /parcelamento/installments/:id (pós-409)",
    );
    assert(
      settled.data?.paid_installments_count === parallel + 1,
      `o 409 não fez rollback: paid_installments_count=${settled.data?.paid_installments_count}, esperado ${parallel + 1}`,
    );

    return `${parallel} escritas concorrentes somadas sem perda, 409 na duplicada com rollback`;
  });

  await check("tenant.org_b_nao_ve_org_a", async () => {
    const catalogs = expectStatus(
      await http(baseUrls.triagem, "/triagem/catalogs?kind=LINK_TYPE", { token: tokenB }),
      200,
      "catálogos da org B",
    );
    assert(
      !JSON.stringify(catalogs.data).includes(catalogId ?? "sem-catalogo"),
      "org B enxergou catálogo da org A",
    );
    const installments = expectStatus(
      await http(baseUrls.parcelamento, "/parcelamento/installments", { token: tokenB }),
      200,
      "parcelamentos da org B",
    );
    assert(
      !JSON.stringify(installments.data).includes(installmentId ?? "sem-parcelamento"),
      "org B enxergou parcelamento da org A",
    );
    if (installmentId) {
      expectStatus(
        await http(baseUrls.parcelamento, `/parcelamento/installments/${installmentId}`, {
          token: tokenB,
        }),
        404,
        "GET direto do parcelamento da org A pela org B",
      );
    }
    const ncm = expectStatus(
      await http(baseUrls.fiscal, "/fiscal/ncm/list", { token: tokenB }),
      200,
      "NCM da org B",
    );
    assert(!JSON.stringify(ncm.data).includes(ncmId ?? "sem-ncm"), "org B enxergou NCM da org A");
    return "listas e GET direto isolados por organização";
  });

  await check("rls.set_local_role_giro_user_runtime", async () => {
    assert(catalogId, "sem catálogo da org A para provar RLS");
    const count = async (organizationId) => {
      await db.query("begin");
      try {
        await db.query('set local role "giro_user_runtime"');
        await db.query("select set_config('app.organization_id', $1, true)", [organizationId]);
        const { rows } = await db.query(
          'select count(*)::int as total from "triagem.catalog_items" where id = $1',
          [catalogId],
        );
        return rows[0].total;
      } finally {
        await db.query("rollback");
      }
    };
    const visibleToA = await count(fixtures.orgA);
    const visibleToB = await count(fixtures.orgB);
    assert(visibleToA === 1, `org A deveria ver a própria linha, viu ${visibleToA}`);
    assert(visibleToB === 0, `org B viu ${visibleToB} linha(s) da org A sob RLS`);
    return "org A vê 1 linha, org B vê 0 sob SET LOCAL ROLE + app.organization_id";
  });

  await check("reporting.catalog_com_grant_hmac", async () => {
    const services = [
      { key: "fiscal", audience: "fiscal-service", source: "fiscal.catalog" },
      { key: "contabil", audience: "contabil-service", source: "contabil.catalog" },
      { key: "parcelamento", audience: "parcelamento-service", source: "parcelamento.catalog" },
    ];
    const catalogs = {};
    for (const service of services) {
      const requestId = randomUUID();
      const { grant, signature } = signReportingGrant({
        audience: service.audience,
        operation: "catalog",
        source: service.source,
        organizationId: fixtures.orgA,
        fields: [],
        requestId,
        body: {},
        secret: secrets.grantSecret,
      });
      const response = await http(baseUrls[service.key], "/internal/reporting/catalog", {
        requestId,
        headers: {
          "x-internal-service-token": secrets.reportsToken,
          "x-reports-grant": grant,
          "x-reports-grant-signature": signature,
        },
      });
      catalogs[service.key] = expectStatus(response, 200, `${service.key} catalog`);
      const invalid = await http(baseUrls[service.key], "/internal/reporting/catalog", {
        requestId,
        headers: {
          "x-internal-service-token": secrets.reportsToken,
          "x-reports-grant": grant,
          // Sempre diferente do original: trocar por "0" não adultera assinatura que já termina em "0".
          "x-reports-grant-signature": `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`,
        },
      });
      expectStatus(invalid, 403, `${service.key} catalog com assinatura inválida`);
    }
    fixtures.catalogs = catalogs;
    return "catálogo liberado com grant válido e negado (403) com assinatura adulterada";
  });

  await check("reporting.extract_respeita_tenant", async () => {
    assert(ncmId, "sem NCM da org A para extrair");
    const extract = async (organizationId) => {
      const requestId = randomUUID();
      const body = { source: "fiscal.ncm", fields: ["ncm_code", "description"], limit: 50 };
      const { grant, signature } = signReportingGrant({
        audience: "fiscal-service",
        operation: "extract",
        source: body.source,
        organizationId,
        fields: body.fields,
        requestId,
        body,
        secret: secrets.grantSecret,
      });
      const response = await http(baseUrls.fiscal, "/internal/reporting/extract", {
        method: "POST",
        body,
        requestId,
        headers: {
          "x-internal-service-token": secrets.reportsToken,
          "x-reports-grant": grant,
          "x-reports-grant-signature": signature,
        },
      });
      return expectStatus(response, 200, `extract org ${organizationId.slice(0, 8)}`);
    };
    const fromA = await extract(fixtures.orgA);
    const fromB = await extract(fixtures.orgB);
    assert(
      fromA.data.rows.some((row) => String(row.description ?? "").includes(runId)),
      "extract da org A não trouxe a linha criada",
    );
    assert(
      !fromB.data.rows.some((row) => String(row.description ?? "").includes(runId)),
      "extract da org B trouxe linha da org A",
    );
    return `org A ${fromA.data.rows.length} linha(s), org B ${fromB.data.rows.length}`;
  });

  await check("auditoria.request_do_gateway", async () => {
    const requestId = randomUUID();
    expectStatus(
      await http(baseUrls.gateway, "/fiscal/ncm/list", { token: tokenA, requestId }),
      200,
      "GET via gateway",
    );
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { rows } = await sql(
        "select method, path, outcome, service_source from audit_requests where request_id = $1",
        [requestId],
      );
      if (rows.length === 1) {
        assert(rows[0].outcome === "success", `outcome inesperado: ${rows[0].outcome}`);
        return `audit_requests registrou ${rows[0].method} ${rows[0].path} (${rows[0].service_source})`;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error("o gateway não registrou o request em audit_requests");
  });

  await check("auditoria.entity_change_do_worker", async () => {
    const before = await sql(
      "select count(*)::int as total from audit_requests where organization_id = $1 and method = 'ENTITY_CHANGE' and referring = 'fiscal.ncm'",
      [fixtures.orgA],
    );
    const created = expectStatus(
      await http(baseUrls.fiscal, "/fiscal/ncm", {
        method: "POST",
        token: tokenA,
        body: {
          tax_regime: `${runId}-regime`,
          ncm_code: "33334444",
          federal_taxation_type: "TRIBUTADO",
          description: `${runId} auditoria`,
          validity_start_date: "2026-01-01",
        },
      }),
      [200, 201],
      "POST /fiscal/ncm",
    );
    fixtures.created.push({ table: "fiscal.ncm", id: created.data.create.id });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { rows } = await sql(
        "select action from audit_requests where organization_id = $1 and method = 'ENTITY_CHANGE' and referring = 'fiscal.ncm'",
        [fixtures.orgA],
      );
      if (rows.length > before.rows[0].total) {
        return `ENTITY_CHANGE fiscal.ncm registrado (action=${rows[rows.length - 1].action})`;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(
      "a mutação não gerou ENTITY_CHANGE de fiscal.ncm em audit_requests (auditoria de entidade perdida)",
    );
  });

  // #1299: o pessoal-service autenticava no audit-service com o token errado; o audit
  // respondia 401 e toda escrita do DP voltava 502 depois de gravar.
  await check("auditoria.entity_change_do_pessoal", async () => {
    const auditRows = (id) =>
      sql(
        "select action from audit_requests where organization_id = $1 and method = 'ENTITY_CHANGE' and referring = 'pessoal.union' and referring_id = $2",
        [fixtures.orgA, id],
      );
    const waitForAction = async (id, action) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const { rows } = await auditRows(id);
        const matches = rows.filter((row) => row.action === action).length;
        assert(matches <= 1, `ENTITY_CHANGE ${action} de pessoal.union duplicado (${matches})`);
        if (matches === 1) return;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      throw new Error(`a escrita do DP não gerou ENTITY_CHANGE ${action} de pessoal.union`);
    };
    const created = expectStatus(
      await http(baseUrls.pessoal, "/pessoal/unions", {
        method: "POST",
        token: tokenA,
        body: { name: `QA_${runId} sindicato`, cnpj: "11.444.777/0001-61", base_date: null },
      }),
      [200, 201],
      "POST /pessoal/unions",
    );
    const unionId = created.data.id;
    await waitForAction(unionId, "Cadastro");
    expectStatus(
      await http(baseUrls.pessoal, `/pessoal/unions/${unionId}`, {
        method: "DELETE",
        token: tokenA,
      }),
      200,
      "DELETE /pessoal/unions/:id",
    );
    await waitForAction(unionId, "Exclusao");
    return "POST e DELETE de pessoal.union auditados";
  });

  await check("outbox.triagem_reconcile_despacha", async () => {
    expectStatus(
      await http(baseUrls.triagem, "/triagem/competencies", {
        method: "POST",
        token: tokenA,
        body: { client_id: fixtures.clientA, competence: "2026-01" },
      }),
      [200, 201],
      "POST /triagem/competencies",
    );
    const pending = await sql(
      'select count(*)::int as total from "triagem.outbox_events" where organization_id = $1',
      [fixtures.orgA],
    );
    assert(pending.rows[0].total > 0, "nenhum evento gravado na outbox da triagem");
    const reconcile = expectStatus(
      await http(baseUrls.triagem, "/internal/triagem/audit/reconcile", {
        method: "POST",
        token: tokenA,
        headers: { "x-internal-service-token": secrets.internalToken },
      }),
      200,
      "POST /internal/triagem/audit/reconcile",
    );
    assert(
      reconcile.data.dispatched >= 1,
      `reconcile não despachou eventos: ${JSON.stringify(reconcile.data)}`,
    );
    return `outbox com ${pending.rows[0].total} evento(s), ${reconcile.data.dispatched} despachado(s)`;
  });

  let taskId;
  await check("crud.task_via_gateway", async () => {
    const departmentId = randomUUID();
    const modelId = randomUUID();
    const projectId = randomUUID();
    await sql(
      `insert into departments (id, name, color, status, organization_id)
       values ($1, $2, '#000000', 'Ativo', $3)`,
      [departmentId, `${runId}-dept-task`, fixtures.orgA],
    );
    await sql(
      `insert into "integracao.tasksModel" (id, name, department_id, responsible_id, billing, prevision, type, organization_id)
       values ($1, $2, $3, $4, 'Não Realizar', 1, 'Projeto', $5)`,
      [modelId, `${runId}-modelo`, departmentId, fixtures.userA, fixtures.orgA],
    );
    await sql(
      `insert into "integracao.projects" (id, name, client_id, status, porcentage, organization_id)
       values ($1, $2, $3, 'Em Andamento', 0, $4)`,
      [projectId, `${runId}-projeto`, fixtures.clientA, fixtures.orgA],
    );
    const created = expectStatus(
      await http(baseUrls.gateway, "/task", {
        method: "POST",
        token: tokenA,
        body: {
          model_id: modelId,
          project_id: projectId,
          client_id: fixtures.clientA,
          prospecting_status: "Análise/Agendamento",
          department_id: departmentId,
          urgency: "Normal",
        },
      }),
      201,
      "POST /task",
    );
    taskId = created.data.create.id;
    const detail = expectStatus(
      await http(baseUrls.gateway, `/task?task_id=${taskId}`, { token: tokenA }),
      200,
      "GET /task",
    );
    assert(JSON.stringify(detail.data).includes(taskId), "GET não retornou a tarefa criada");
    expectStatus(
      await http(baseUrls.gateway, "/task", {
        method: "PUT",
        token: tokenA,
        body: { task_id: taskId, name: `${runId} tarefa alterada` },
      }),
      200,
      "PUT /task",
    );
    const list = expectStatus(
      await http(baseUrls.gateway, `/task/list?client_id=${fixtures.clientA}&limit=100`, {
        token: tokenA,
      }),
      200,
      "GET /task/list",
    );
    assert(JSON.stringify(list.data).includes("tarefa alterada"), "lista não trouxe a alteração");
    return "POST/GET/PUT/LIST de integracao.tasks pelo gateway";
  });

  await check("tenant.task_org_b_nao_ve_org_a", async () => {
    assert(taskId, "sem tarefa criada no check anterior");
    expectStatus(
      await http(baseUrls.gateway, `/task?task_id=${taskId}`, { token: tokenB }),
      404,
      "GET /task da org A com token da org B",
    );
    return "org B recebe 404 para a tarefa da org A";
  });

  await check("auditoria.entity_change_do_task", async () => {
    assert(taskId, "sem tarefa criada no check anterior");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const { rows } = await sql(
        "select action from audit_requests where organization_id = $1 and method = 'ENTITY_CHANGE' and referring = 'integracao.tasks' and referring_id = $2",
        [fixtures.orgA, taskId],
      );
      if (rows.length > 0) return `ENTITY_CHANGE integracao.tasks (action=${rows[0].action})`;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error("a criação da tarefa não gerou ENTITY_CHANGE em audit_requests");
  });

  await check("task.internal_commercial_exige_token", async () => {
    expectStatus(
      await http(baseUrls.task, "/internal/commercial/task-billing", {
        method: "POST",
        body: {},
        headers: { "x-internal-service-token": "token-errado" },
      }),
      403,
      "token errado",
    );
    expectStatus(
      await http(baseUrls.task, "/internal/commercial/task-billing", {
        method: "POST",
        body: {},
        headers: { "x-internal-service-token": secrets.internalToken },
      }),
      400,
      "token certo e corpo inválido",
    );
    return "403 com token errado; token do commercial aceito (400 no corpo vazio)";
  });

  const ncmReport = {
    sources: ["fiscal.ncm"],
    columns: [
      { source: "fiscal.ncm", field: "ncm_code", alias: "ncm_code" },
      { source: "fiscal.ncm", field: "description", alias: "description" },
    ],
  };

  await check("reports.preview_busca_origem_por_binding", async () => {
    const preview = expectStatus(
      await http(baseUrls.gateway, "/reports/preview", {
        method: "POST",
        token: tokenA,
        body: { definition: ncmReport },
      }),
      200,
      "POST /reports/preview",
    );
    assert(
      JSON.stringify(preview.data).includes(`${runId} ncm`),
      `preview não trouxe o NCM da org A: ${JSON.stringify(preview.data).slice(0, 300)}`,
    );
    return "reports -> fiscal pelo Service Binding, com o NCM da org A";
  });

  await check("reports.job_processado_pelo_cron", async () => {
    // O job revalida o acesso no user-service pelo banco (não pelas claims do JWT).
    await sql(
      `insert into permissions (id, user_id, organization_id, fiscal) values ($1, $2, $3, 3)
       on conflict (user_id, organization_id) do update set fiscal = 3`,
      [randomUUID(), fixtures.userA, fixtures.orgA],
    );
    const job = expectStatus(
      await http(baseUrls.gateway, "/reports/jobs", {
        method: "POST",
        token: tokenA,
        body: { definition: ncmReport, format: "json" },
      }),
      201,
      "POST /reports/jobs",
    );
    const jobId = job.data.id;
    assert(job.data.status === "queued", `job nasceu em ${job.data.status}`);
    const cron = await fetch(
      `${baseUrls.reports}/__scheduled?cron=${encodeURIComponent("*/1 * * * *")}`,
    );
    assert(cron.ok, `disparo do cron falhou: ${cron.status}`);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const current = expectStatus(
        await http(baseUrls.gateway, `/reports/jobs/${jobId}`, { token: tokenA }),
        200,
        "GET /reports/jobs/:id",
      );
      if (current.data.status === "completed") {
        const snapshot = expectStatus(
          await http(baseUrls.gateway, `/reports/jobs/${jobId}/snapshot?scope=personal&limit=100`, {
            token: tokenA,
          }),
          200,
          "GET /reports/jobs/:id/snapshot",
        );
        assert(
          JSON.stringify(snapshot.data).includes(`${runId} ncm`),
          `snapshot sem o NCM da org A: ${JSON.stringify(snapshot.data).slice(0, 300)}`,
        );
        return `job ${jobId.slice(0, 8)} queued -> completed pelo cron, snapshot legível`;
      }
      assert(
        !["failed", "expired", "cancelled"].includes(current.data.status),
        `job terminou em ${current.data.status}: ${JSON.stringify(current.data).slice(0, 300)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("o cron não levou o job a completed");
  });

  return fixtures;
}

async function seedFixtures(sql, fixtures, runId) {
  const label = (suffix) => `${runId}-${suffix}`;
  for (const [org, dept, user, client, suffix] of [
    [fixtures.orgA, fixtures.deptA, fixtures.userA, fixtures.clientA, "a"],
    [fixtures.orgB, fixtures.deptB, fixtures.userB, fixtures.clientB, "b"],
  ]) {
    await sql(
      `insert into organizations (id, name, slug, updated_at, cnpj, email_created_by, status)
       values ($1, $2, $3, now(), $4, $5, 'active')`,
      [
        org,
        label(`org-${suffix}`),
        label(`org-${suffix}`),
        label(`cnpj-${suffix}`),
        `${runId}@invalid.test`,
      ],
    );
    await sql(
      `insert into departments (id, name, color, status, organization_id)
       values ($1, $2, '#000000', 'active', $3)`,
      [dept, label(`dept-${suffix}`), org],
    );
    await sql(
      `insert into users (id, name, login, password, permission, status, department_id, organization_id, session_version)
       values ($1, $2, $3, $4, 3, 'active', $5, $6, 0)`,
      [
        user,
        label(`user-${suffix}`),
        label(`login-${suffix}`),
        label("senha-nao-usada"),
        dept,
        org,
      ],
    );
    await sql(
      `insert into clients (id, name, status, prospecting_status, organization_id)
       values ($1, $2, 'Ativo', 'Ativo', $3)`,
      [client, label(`client-${suffix}`), org],
    );
  }
  await sql(
    `insert into auth_sessions (id, user_id, csrf_hash, expires_at, updated_at)
     values ($1, $2, $3, now() + interval '1 hour', now())`,
    [fixtures.sessionA.id, fixtures.userA, fixtures.sessionA.hash],
  );
}

async function cleanupFixtures(sql, fixtures) {
  let removed = 0;
  await sql("delete from auth_sessions where user_id = any($1)", [
    [fixtures.userA, fixtures.userB],
  ]);
  for (const table of CLEANUP_TABLES) {
    const { rows } = await sql(
      `select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'organization_id'`,
      [table],
    );
    if (rows.length === 0) continue;
    const result = await sql(`delete from "${table}" where organization_id = any($1)`, [
      [fixtures.orgA, fixtures.orgB],
    ]);
    removed += result.rowCount ?? 0;
  }
  const orgs = await sql("delete from organizations where id = any($1)", [
    [fixtures.orgA, fixtures.orgB],
  ]);
  removed += orgs.rowCount ?? 0;
  return removed;
}

main().catch((error) => {
  console.error(`\nsmoke abortado: ${error instanceof Error ? error.stack : error}`);
  process.exit(1);
});
