import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCredentialReport,
  scanRepositoryCredentials,
  scanWorkflowText,
} from "./credential-policy.mjs";

const execFileAsync = promisify(execFile);

test("permite workflow com permissao explicita somente leitura", () => {
  assert.deepEqual(
    scanWorkflowText("good.yml", "permissions:\n  contents: read\n"),
    [],
  );
});

test("exige permissoes de topo e rejeita escopos de escrita", () => {
  assert.match(
    JSON.stringify(scanWorkflowText("missing.yml", "jobs:\n  test:\n")),
    /permissions/u,
  );
  assert.match(
    JSON.stringify(scanWorkflowText("write.yml", "permissions: write-all\n")),
    /write/u,
  );
  assert.match(
    JSON.stringify(
      scanWorkflowText("nested-write.yml", "permissions:\n  contents: write\n"),
    ),
    /write/u,
  );
});

test("exige checkout sem persistencia de credenciais", () => {
  const findings = scanWorkflowText(
    "checkout.yml",
    [
      "permissions:",
      "  contents: read",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
    ].join("\n"),
  );

  assert.match(JSON.stringify(findings), /persist-credentials/u);
});

test("detecta impressao de secrets e padroes de credencial sem exfiltrar valores", () => {
  const token = `ghp_${"a".repeat(24)}`;
  const bearer = `Authorization: Bearer ${"b".repeat(24)}`;
  const privateKeyHeader = ["-----BEGIN", " PRIVATE KEY-----"].join("");
  const findings = scanWorkflowText(
    "unsafe.yml",
    [
      "permissions:",
      "  contents: read",
      "jobs:",
      "  test:",
      "    steps:",
      "      - name: Safe secret handoff",
      "        env:",
      "          TOKEN: ${{ secrets.TOKEN }}",
      "        with:",
      "          token: ${{ secrets.OTHER_TOKEN }}",
      "      - run: echo \"${{ secrets.TOKEN }}\"",
      `      - run: echo "${token}"`,
      `      - run: echo "${bearer}"`,
      `      - run: echo "${privateKeyHeader}"`,
    ].join("\n"),
  );

  assert.match(JSON.stringify(findings), /secret/u);
  assert.match(JSON.stringify(findings), /token/u);
  assert.doesNotMatch(JSON.stringify(findings), new RegExp(token, "u"));
  assert.doesNotMatch(JSON.stringify(findings), new RegExp(bearer, "u"));
});

test("ignora workflow composto apenas por comentarios", () => {
  assert.deepEqual(
    scanWorkflowText(
      "legacy.yml",
      "# permissions:\n#   contents: write\n# - run: echo ${{ secrets.TOKEN }}\n",
    ),
    [],
  );
});

test("varre o repositorio sem entrar em diretorios e arquivos excluidos", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "credential-policy-"));
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await mkdir(path.join(root, "dist"), { recursive: true });
  await mkdir(path.join(root, "graphify-out"), { recursive: true });

  const token = `ghp_${"c".repeat(24)}`;
  const safeWorkflow = "permissions:\n  contents: read\n";
  await writeFile(path.join(root, ".github", "workflows", "good.yml"), safeWorkflow);
  await writeFile(path.join(root, "README.md"), `token de teste: ${token}\n`);
  await writeFile(path.join(root, ".env.local"), `TOKEN=${token}\n`);
  await writeFile(path.join(root, "node_modules", "ignored.txt"), token);
  await writeFile(path.join(root, "dist", "ignored.txt"), token);
  await writeFile(path.join(root, "graphify-out", "ignored.txt"), token);

  const findings = await scanRepositoryCredentials(root);
  const serialized = JSON.stringify(findings);

  assert.equal(findings.some(({ path: findingPath }) => findingPath === "README.md"), true);
  assert.doesNotMatch(serialized, new RegExp(token, "u"));
  for (const excluded of [".env.local", "node_modules", "dist", "graphify-out"]) {
    assert.equal(
      findings.some(({ path: findingPath }) => findingPath.startsWith(excluded)),
      false,
      `nao deveria encontrar ${excluded}`,
    );
  }
});

test("produz relatorio deterministico e sanitizado", () => {
  const report = buildCredentialReport([
    {
      rule: "unsafe-token-literal",
      path: "b.yml",
      line: 3,
      severity: "high",
      remediation: "remova o literal e use um segredo aprovado",
      source: "nao deve aparecer",
    },
    {
      rule: "permissions-required",
      path: "a.yml",
      line: 1,
      severity: "high",
      remediation: "declare permissoes de topo",
    },
  ]);

  assert.equal(report.ok, false);
  assert.deepEqual(
    report.findings.map(({ path: findingPath }) => findingPath),
    ["a.yml", "b.yml"],
  );
  assert.equal(report.summary.total, 2);
  assert.deepEqual(Object.keys(report.findings[1]).sort(), [
    "line",
    "path",
    "remediation",
    "rule",
    "severity",
  ]);
  assert.doesNotMatch(JSON.stringify(report), /nao deve aparecer/u);
});

test("CLI grava relatorio sanitizado para uma raiz informada", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "credential-policy-cli-"));
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await writeFile(
    path.join(root, ".github", "workflows", "good.yml"),
    "permissions:\n  contents: read\n",
  );
  const reportPath = path.join(root, "report.json");
  await execFileAsync(process.execPath, [
    "scripts/credential-policy.mjs",
    root,
    "--report",
    reportPath,
  ]);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.ok, true);
});

test("workflow da politica e somente leitura e nao injeta credenciais", async () => {
  const workflow = await readFile(
    path.resolve(".github", "workflows", "credential-policy.yml"),
    "utf8",
  );
  assert.match(workflow, /pull_request:/u);
  assert.match(workflow, /push:/u);
  assert.match(workflow, /schedule:/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /node-version: 22/u);
  assert.doesNotMatch(workflow, /secrets\./u);
});
