import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";

// Este teste nunca carrega .env: o banco é criado e removido pelo próprio harness.
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("../integrations/audit.js", () => ({ createLog: vi.fn(), logUpdateIfChanged: vi.fn() }));

const organizationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const clientId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const userId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const headers = {
  "x-internal-service-token": "audit-service-token",
  "x-auth-user-id": userId,
  "x-auth-organization-id": organizationId,
  "x-auth-modules": JSON.stringify({ integracao: 2 }),
};

describe.skipIf(process.env.PROJECT_WIZARD_POSTGRES_TEST !== "1")(
  "wizard PostgreSQL efêmero",
  () => {
    let db: PrismaClient;
    let app: Express;
    let containerId: string | undefined;
    const containerName = `issue-987-wizard-${process.pid}-${randomUUID().slice(0, 8)}`;
    const body = {
      client_id: clientId,
      name: "Projeto privado",
      objective: "Objetivo privado",
      start_date: "2026-09-01T00:00:00.000Z",
      tasks: [{ name: "Principal privada", department_id: "department", model_id: "main" }],
    };

    async function cleanup() {
      try {
        if (db) await db.$disconnect();
      } finally {
        vi.unstubAllEnvs();
        if (containerId) {
          execFileSync("docker", ["stop", containerId], { stdio: "pipe" });
          containerId = undefined;
        }
      }
    }

    beforeAll(async () => {
      try {
        containerId = execFileSync(
          "docker",
          [
            "run",
            "--rm",
            "-d",
            "--name",
            containerName,
            "--tmpfs",
            "/var/lib/postgresql/data",
            "-p",
            "127.0.0.1::5432",
            "-e",
            "POSTGRES_PASSWORD=wizard-test-only",
            "-e",
            "POSTGRES_DB=wizard_test",
            "postgres:17-alpine",
          ],
          { encoding: "utf8" },
        ).trim();
        const port = execFileSync("docker", ["port", containerId, "5432/tcp"], { encoding: "utf8" })
          .trim()
          .split(":")
          .at(-1);
        for (let attempt = 0; attempt < 100; attempt++) {
          try {
            execFileSync(
              "docker",
              ["exec", containerId, "pg_isready", "-U", "postgres", "-d", "wizard_test"],
              { stdio: "pipe" },
            );
            break;
          } catch {
            if (attempt === 99) throw new Error("PostgreSQL efêmero não ficou pronto");
            await setTimeout(100);
          }
        }
        vi.stubEnv(
          "DATABASE_URL",
          `postgresql://postgres:wizard-test-only@127.0.0.1:${port}/wizard_test`,
        );
        vi.stubEnv("AUDIT_ENABLED", "false");
        vi.stubEnv("AUDIT_SERVICE_TOKEN", "audit-service-token");
        const { default: prisma } = await import("../prisma/index.js");
        db = prisma;
        const schemaSql = execFileSync(
          "pnpm",
          [
            "exec",
            "prisma",
            "migrate",
            "diff",
            "--config",
            "src/test/projectWizardPostgres.prisma.config.ts",
            "--from-empty",
            "--to-schema",
            "../../infra/prisma/schema.prisma",
            "--script",
          ],
          { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
        );
        // pg aceita o DDL completo; nenhuma URL fornecida pelo usuário é consumida.
        const { Client } = await import("pg");
        const sql = new Client({ connectionString: process.env.DATABASE_URL });
        await sql.connect();
        try {
          await sql.query('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');
          await sql.query(schemaSql);
          await sql.query('DROP TABLE "integracao.project_wizard_confirmations"');
          await sql.query(
            readFileSync(
              new URL(
                "../../../../infra/prisma/migrations/20260907120000_add_project_wizard_confirmations/migration.sql",
                import.meta.url,
              ),
              "utf8",
            ),
          );
          await sql.query(
            readFileSync(
              new URL(
                "../../../../infra/prisma/migrations/20260906194000_enforce_active_task_model_uniqueness/migration.sql",
                import.meta.url,
              ),
              "utf8",
            ),
          );
        } finally {
          await sql.end();
        }
        await db.organization.create({
          data: {
            id: organizationId,
            name: "Efêmera",
            slug: "wizard-test",
            cnpj: "test",
            email_created_by: "test@example.invalid",
          },
        });
        await db.department.create({
          data: {
            id: "department",
            name: "Departamento",
            color: "blue",
            status: "Ativo",
            organization_id: organizationId,
          },
        });
        await db.user.create({
          data: {
            id: userId,
            name: "Usuário",
            login: "wizard-test",
            password: "unused",
            permission: 2,
            status: "inactive",
            type: "admin",
            department_id: "department",
            organization_id: organizationId,
          },
        });
        await db.client.create({
          data: {
            id: clientId,
            name: "Cliente",
            status: "Ativo",
            prospecting_status: "Fechado",
            organization_id: organizationId,
          },
        });
        for (const id of ["main", "ready", "wait"]) {
          await db.taskModel.create({
            data: {
              id,
              name: id,
              department_id: "department",
              organization_id: organizationId,
              responsible_id: userId,
              type: "Projeto",
              observations: "Observação privada",
              prevision: 0,
              billing: "Não Realizar",
            },
          });
        }
        await db.taskDependent.createMany({
          data: [
            {
              task_id: "main",
              dependent_id: "ready",
              organization_id: organizationId,
              wait: false,
              observation: "Pode iniciar",
            },
            {
              task_id: "main",
              dependent_id: "wait",
              organization_id: organizationId,
              wait: true,
              observation: "Aguardar",
            },
          ],
        });
        vi.stubEnv("PROJECT_SERVICE_URL", "http://127.0.0.1:1");
        const { createTaskApp } = await import("../app.js");
        const { getTaskServiceEnv } = await import("../config/env.js");
        const { createLogger } = await import("@workspace/shared/logger");
        app = createTaskApp(
          getTaskServiceEnv(),
          createLogger({ service: "wizard-test", env: "test", level: "silent" }),
        );
      } catch (err) {
        await cleanup();
        throw err;
      }
    }, 60000);

    afterAll(cleanup);
    beforeEach(async () => {
      vi.clearAllMocks();
      await db.$executeRawUnsafe(
        'ALTER TABLE "integracao.tasks" DROP CONSTRAINT IF EXISTS wizard_test_failure',
      );
      await db.projectWizardConfirmation.deleteMany();
      await db.task.deleteMany();
      await db.project.deleteMany();
    });

    async function command() {
      const preview = await request(app)
        .post("/task/project-wizard/preview")
        .set(headers)
        .send({ tasks: body.tasks });
      expect(preview.status).toBe(200);
      return { ...body, revision: preview.body.data.revision };
    }

    it("falha na última Tarefa reverte Projeto, principais, dependências e chave", async () => {
      const payload = await command();
      await db.$executeRawUnsafe(
        `ALTER TABLE "integracao.tasks" ADD CONSTRAINT wizard_test_failure CHECK (model_id <> 'wait')`,
      );
      const result = await request(app)
        .post("/task/project-wizard")
        .set(headers)
        .set("Idempotency-Key", "rollback")
        .send(payload);
      expect(result.status).toBe(500);
      expect(await db.project.count()).toBe(0);
      expect(await db.task.count()).toBe(0);
      expect(await db.projectWizardConfirmation.count()).toBe(0);
      const { createLog } = await import("../integrations/audit.js");
      expect(createLog).not.toHaveBeenCalled();
      await db.$executeRawUnsafe(
        'ALTER TABLE "integracao.tasks" DROP CONSTRAINT wizard_test_failure',
      );
      const retry = await request(app)
        .post("/task/project-wizard")
        .set(headers)
        .set("Idempotency-Key", "rollback")
        .send(payload);
      expect(retry.status).toBe(201);
      expect(await db.project.count()).toBe(1);
      expect(await db.task.count()).toBe(3);
      expect(await db.projectWizardConfirmation.count()).toBe(1);
    });

    it("confirmações concorrentes e replay preservam um único snapshot", async () => {
      const payload = await command();
      const confirm = () =>
        request(app)
          .post("/task/project-wizard")
          .set(headers)
          .set("Idempotency-Key", "concurrent")
          .send(payload);
      const [first, second] = await Promise.all([confirm(), confirm()]);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(first.body.data.counts).toEqual({ main: 1, dependencies: 2, unassigned: 3 });
      expect(await db.project.count()).toBe(1);
      expect(
        await db.task.findMany({
          select: { model_id: true, status: true, responsible_id: true },
          orderBy: { model_id: "asc" },
        }),
      ).toEqual([
        { model_id: "main", status: "A Realizar", responsible_id: null },
        { model_id: "ready", status: "A Realizar", responsible_id: null },
        { model_id: "wait", status: "Em Espera", responsible_id: null },
      ]);
      expect(await db.projectWizardConfirmation.count()).toBe(1);
      await db.project.update({
        where: { id: first.body.data.project.id },
        data: { name: "Nome editado depois" },
      });
      await db.taskModel.update({ where: { id: "main" }, data: { type: "Outro" } });
      try {
        const replay = await confirm();
        expect(replay.status).toBe(201);
        expect(replay.body).toEqual(first.body);
        expect(await db.project.count()).toBe(1);
        expect(await db.task.count()).toBe(3);
        expect(await db.projectWizardConfirmation.count()).toBe(1);
      } finally {
        await db.taskModel.update({ where: { id: "main" }, data: { type: "Projeto" } });
      }
    });

    it("mesma chave é independente entre organizações, inclusive sem Tarefas", async () => {
      const otherOrganizationId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
      const otherClientId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
      await db.organization.create({
        data: {
          id: otherOrganizationId,
          name: "Outra",
          slug: "other",
          cnpj: "other",
          email_created_by: "other@example.invalid",
        },
      });
      await db.client.create({
        data: {
          id: otherClientId,
          name: "Outro",
          status: "Ativo",
          prospecting_status: "Fechado",
          organization_id: otherOrganizationId,
        },
      });
      const payload = {
        ...body,
        tasks: [],
        revision: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      };
      const first = await request(app)
        .post("/task/project-wizard")
        .set(headers)
        .set("Idempotency-Key", "same-key")
        .send(payload);
      const second = await request(app)
        .post("/task/project-wizard")
        .set({ ...headers, "x-auth-organization-id": otherOrganizationId })
        .set("Idempotency-Key", "same-key")
        .send({ ...payload, client_id: otherClientId });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.project.id).not.toBe(first.body.data.project.id);
      expect(second.body.data.counts).toEqual({ main: 0, dependencies: 0, unassigned: 0 });
      expect(await db.project.count()).toBe(2);
      expect(await db.task.count()).toBe(0);
      expect(await db.projectWizardConfirmation.count()).toBe(2);
    });

    it("mesma chave com comando diferente retorna 409 e preserva a criação original", async () => {
      const payload = await command();
      const confirm = (value: unknown) =>
        request(app)
          .post("/task/project-wizard")
          .set(headers)
          .set("Idempotency-Key", "conflict")
          .send(value);
      const original = await confirm(payload);
      expect(original.status).toBe(201);
      const changes = [
        { name: "Outro projeto" },
        { objective: "Outro objetivo" },
        { client_id: "dddddddd-dddd-dddd-dddd-dddddddddddd" },
        { start_date: "2026-09-02T00:00:00.000Z" },
        { end_date: "2026-09-30T00:00:00.000Z" },
        { revision: "outra-revisao" },
        { tasks: [] },
        ...[
          { name: "Outra principal" },
          { model_id: "outro-modelo" },
          { department_id: "outro-departamento" },
          { prevision_date: "2026-09-15" },
          { responsible_id: null },
        ].map((task) => ({ tasks: [{ ...body.tasks[0], ...task }] })),
      ];
      for (const change of changes) {
        const conflict = await confirm({ ...payload, ...change });
        expect(conflict.status, JSON.stringify(change)).toBe(409);
        expect(conflict.body).toMatchObject({
          success: false,
          error: "Idempotency-Key já utilizada com outro comando.",
        });
      }
      expect((await confirm(payload)).body).toEqual(original.body);
      expect(await db.project.count()).toBe(1);
      expect(await db.task.count()).toBe(3);
      expect(await db.projectWizardConfirmation.count()).toBe(1);
    });

    it("audita somente após commit sem dados privados, tolera falha e replay não audita", async () => {
      const { createLog } = await import("../integrations/audit.js");
      const audit = vi.mocked(createLog);
      audit.mockClear();
      const committed: number[][] = [];
      audit.mockImplementation(async () => {
        committed.push(
          await Promise.all([
            db.project.count(),
            db.task.count(),
            db.projectWizardConfirmation.count(),
          ]),
        );
        throw new Error("Falha privada do provider");
      });
      const payload = await command();
      const original = await request(app)
        .post("/task/project-wizard")
        .set(headers)
        .set("Idempotency-Key", "audit-private-key")
        .send(payload);
      expect(original.status).toBe(201);
      expect(committed).toEqual([[1, 3, 1]]);
      const taskIds = (
        await db.task.findMany({ select: { id: true }, orderBy: { model_id: "asc" } })
      ).map(({ id }) => id);
      expect(audit.mock.calls).toEqual([
        [
          {
            userId,
            organizationId,
            action: "Cadastro",
            referring: "integracao.projects",
            referringId: original.body.data.project.id,
            changes: {
              source: "project-wizard",
              projectId: original.body.data.project.id,
              taskIds,
              counts: { main: 1, dependencies: 2, unassigned: 3 },
            },
          },
        ],
      ]);
      const serialized = JSON.stringify(audit.mock.calls);
      for (const privateValue of [
        "Projeto privado",
        "Objetivo privado",
        "Principal privada",
        "Observação privada",
        "audit-private-key",
        "audit-service-token",
      ]) {
        expect(serialized).not.toContain(privateValue);
      }
      const replay = await request(app)
        .post("/task/project-wizard")
        .set({
          ...headers,
          "x-auth-user-id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
          "x-auth-type": "owner",
          "x-auth-modules": JSON.stringify({ rh: 3, integracao: 0 }),
        })
        .set("Idempotency-Key", "audit-private-key")
        .send(Object.fromEntries(Object.entries(payload).reverse()));
      expect(replay.status).toBe(201);
      expect(replay.body).toEqual(original.body);
      expect(audit).toHaveBeenCalledTimes(1);
      const forbidden = await request(app)
        .post("/task/project-wizard")
        .set({ ...headers, "x-auth-modules": JSON.stringify({ integracao: 1 }) })
        .set("Idempotency-Key", "audit-private-key")
        .send(payload);
      expect(forbidden.status).toBe(403);
      audit.mockReset();
    });
  },
);
