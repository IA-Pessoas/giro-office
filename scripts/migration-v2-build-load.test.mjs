import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildLoad, normalizeDate, uuidV5 } from "./migration-v2-build-load.mjs";

test("uuidV5 gera UUID deterministico por namespace e valor", () => {
  const first = uuidV5("giro-office-migration-v2-test", "departments:1");
  const second = uuidV5("giro-office-migration-v2-test", "departments:1");
  const other = uuidV5("giro-office-migration-v2-test", "departments:2");

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, other);
});

test("normalizeDate trata datas zeradas e vazias como null", () => {
  assert.equal(normalizeDate("0000-00-00"), null);
  assert.equal(normalizeDate("0000-00-00 00:00:00"), null);
  assert.equal(normalizeDate(""), null);
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate("2026-07-06"), "2026-07-06T00:00:00.000Z");
});

test("buildLoad gera manifest e valida relacoes principais", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "giro-office-migration-v2-test-"));
  const rawDir = path.join(baseDir, "raw-confirmed");
  const docsDir = path.join(baseDir, "docs");
  const outputDir = path.join(baseDir, "load");

  await writeFile(path.join(baseDir, ".keep"), "");
  await writeFile(path.join(rawDir, ".keep"), "").catch(async () => {
    await import("node:fs/promises").then(({ mkdir }) => mkdir(rawDir, { recursive: true }));
    await writeFile(path.join(rawDir, ".keep"), "");
  });
  await import("node:fs/promises").then(({ mkdir }) => mkdir(docsDir, { recursive: true }));

  const rows = {
    "tb_admin.departamentos": [
      { id: 10, nome: "Fiscal", color: "#abcdef", status: 1 },
      { id: 11, nome: "Inativo", color: "#fedcba", status: 0 },
    ],
    "tb_admin.usuarios": [
      {
        id: 20,
        user: "maria",
        password: "secret",
        nome: "Maria",
        cargo: 1,
        departamento_id: 10,
        status: "Ativo",
      },
    ],
    "tb_rh.colaboradores": [],
    "tb_integracao.clientes": [
      { id: 30, nome: "Cliente A", tipo: "juridico", cpf_cnpj: "12345678000190" },
    ],
    "tb_regularize.clientes": [],
    "tb_integracao.prospeccao_comercial": [
      { id: 40, cliente_id: 30, servico: "Honorarios", situacao: "Aberto", porcentagem: 10 },
    ],
    "tb_integracao.tarefas_express": [
      {
        id: 50,
        nome: "Tarefa X",
        departamento_id: 10,
        responsavel_id: 20,
        cobranca: 1,
        previsao: 2,
      },
    ],
    "tb_integracao.planos": [{ id: 60, nome: "Plano", color: "#123456" }],
    "tb_integracao.tarefas_planos": [{ id: 70, tarefa_express_id: 50, plano_id: 60, ordem: 1 }],
    "tb_integracao.tarefas": [
      {
        id: 80,
        cliente_id: 30,
        nome: "Tarefa X",
        estado: "Aberto",
        departamento_id: 10,
        responsavel_id: 20,
        cobranca: 1,
        urgencia: 0,
      },
    ],
    "tb_regularize.alvaras": [],
    "tb_regularize.processos": [],
    "tb_regularize.orientaoes_processual": [],
    "tb_regularize.orientaoes_processual.socios": [],
    "tb_regularize.taxas_municipais": [],
    "tb_regularize.clientes_senhas": [],
  };

  await Promise.all(
    Object.entries(rows).map(([name, value]) =>
      writeFile(path.join(rawDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`),
    ),
  );

  await writeFile(
    path.join(docsDir, "task-legacy-ad-hoc-models.csv"),
    [
      '"id","name","department_id","responsible_id","responsible2_id","responsible3_id","observations","billing","prevision","type","organization_id"',
      '"ad-hoc-id","Tarefa legada avulsa - Sem departamento legado","fallback-dept-id","fallback-user-id","","","Modelo tecnico","0","0","legacy-ad-hoc","org-id"',
    ].join("\n"),
  );

  try {
    const manifest = await buildLoad({
      docsDir,
      inputDir: rawDir,
      outputDir,
      organizationId: "org-id",
    });

    assert.equal(manifest.validation.all, 0);
    assert.equal(manifest.counts.departments, 3);
    assert.equal(manifest.counts.users, 2);
    assert.equal(manifest.counts.clients, 2);
    assert.equal(manifest.counts.projects, 2);
    assert.equal(manifest.counts.taskModels, 2);
    assert.equal(manifest.counts.projectPlanTasks, 1);
    assert.equal(manifest.counts.tasks, 1);

    const departments = JSON.parse(
      await import("node:fs/promises").then(({ readFile }) =>
        readFile(path.join(outputDir, "departments.json"), "utf8"),
      ),
    );
    assert.equal(departments.find((department) => department.name === "Fiscal")?.status, "Ativo");
    assert.equal(
      departments.find((department) => department.name === "Inativo")?.status,
      "Inativo",
    );
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("buildLoad nao junta linhas distintas de clientes do legado", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "giro-office-migration-v2-test-"));
  const rawDir = path.join(baseDir, "raw-confirmed");
  const docsDir = path.join(baseDir, "docs");
  const outputDir = path.join(baseDir, "load");

  await import("node:fs/promises").then(({ mkdir }) => mkdir(rawDir, { recursive: true }));
  await import("node:fs/promises").then(({ mkdir }) => mkdir(docsDir, { recursive: true }));

  const rows = {
    "tb_admin.departamentos": [{ id: 10, nome: "Fiscal", color: "#abcdef", status: 1 }],
    "tb_admin.usuarios": [
      {
        id: 20,
        user: "maria",
        password: "secret",
        nome: "Maria",
        cargo: 1,
        departamento_id: 10,
        status: "Ativo",
      },
    ],
    "tb_rh.colaboradores": [],
    "tb_integracao.clientes": [
      { id: 30, nome: "Cliente A", tipo: "juridico", cpf_cnpj: "12345678000190" },
    ],
    "tb_regularize.clientes": [
      {
        codigo: 40,
        nome: "Cliente A Regularize",
        razao_social: "Cliente A Regularize",
        cpf_cnpj: "12345678000190",
        cliente_id: 30,
      },
    ],
    "tb_integracao.prospeccao_comercial": [],
    "tb_integracao.tarefas_express": [],
    "tb_integracao.planos": [],
    "tb_integracao.tarefas_planos": [],
    "tb_integracao.tarefas": [],
    "tb_regularize.alvaras": [],
    "tb_regularize.processos": [],
    "tb_regularize.orientaoes_processual": [],
    "tb_regularize.orientaoes_processual.socios": [],
    "tb_regularize.taxas_municipais": [],
    "tb_regularize.clientes_senhas": [],
  };

  await Promise.all(
    Object.entries(rows).map(([name, value]) =>
      writeFile(path.join(rawDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`),
    ),
  );

  await writeFile(
    path.join(docsDir, "task-legacy-ad-hoc-models.csv"),
    [
      '"id","name","department_id","responsible_id","responsible2_id","responsible3_id","observations","billing","prevision","type","organization_id"',
      '"ad-hoc-id","Tarefa legada avulsa - Sem departamento legado","fallback-dept-id","fallback-user-id","","","Modelo tecnico","0","0","legacy-ad-hoc","org-id"',
    ].join("\n"),
  );

  try {
    const manifest = await buildLoad({
      docsDir,
      inputDir: rawDir,
      outputDir,
      organizationId: "org-id",
    });

    assert.equal(manifest.validation.all, 0);
    assert.equal(manifest.counts.clients, 3);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
