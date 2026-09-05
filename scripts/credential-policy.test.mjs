import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildCredentialReport,
  scanRepositoryCredentials,
  scanWorkflowText,
} from "./credential-policy.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("permite workflow com permissao explicita somente leitura", () => {
  assert.deepEqual(scanWorkflowText("good.yml", "permissions:\n  contents: read\n"), []);
});

test("exige permissoes de topo e rejeita escopos de escrita", () => {
  assert.match(JSON.stringify(scanWorkflowText("missing.yml", "jobs:\n  test:\n")), /permissions/u);
  assert.match(JSON.stringify(scanWorkflowText("write.yml", "permissions: write-all\n")), /write/u);
  assert.match(
    JSON.stringify(scanWorkflowText("nested-write.yml", "permissions:\n  contents: write\n")),
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

test("reconhece checkout em step nomeado e normaliza permissoes YAML simples", () => {
  const namedCheckout = scanWorkflowText(
    "named-checkout.yml",
    [
      "permissions: 'write-all'",
      "jobs:",
      "  test:",
      "    steps:",
      "      - name: Checkout",
      "        uses: actions/checkout@v4",
    ].join("\n"),
  );
  assert.match(JSON.stringify(namedCheckout), /permissions-write/u);
  assert.match(JSON.stringify(namedCheckout), /checkout-persist-credentials/u);

  const safeNamedCheckout = scanWorkflowText(
    "safe-named-checkout.yml",
    [
      "permissions:",
      '  contents: "read"',
      "jobs:",
      "  test:",
      "    steps:",
      "      - name: Checkout",
      "        uses: actions/checkout@v4",
      "        with:",
      "          persist-credentials: false",
    ].join("\n"),
  );
  assert.deepEqual(safeNamedCheckout, []);
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
      '      - run: echo "${{ secrets.TOKEN }}"',
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

test("bloqueia uso de variavel derivada de secret em shell e clientes HTTP", () => {
  const findings = scanWorkflowText(
    "derived-secret.yml",
    [
      "permissions:",
      "  contents: read",
      "jobs:",
      "  test:",
      "    steps:",
      "      - name: Unsafe derived secret",
      "        env:",
      "          API_TOKEN: ${{ secrets.API_TOKEN }}",
      "        run: |",
      '          echo "$API_TOKEN"',
      '          tee output.txt <<< "$API_TOKEN"',
      "          set -x",
      '          curl -H "Authorization: Bearer $API_TOKEN" https://example.invalid',
    ].join("\n"),
  );

  assert.ok(findings.filter(({ rule }) => rule === "secret-shell-exposure").length >= 4);
  assert.doesNotMatch(JSON.stringify(findings), /API_TOKEN/u);
});

test("rastreia secrets em env de job e step ate steps posteriores", () => {
  const findings = scanWorkflowText(
    "cross-step-secret.yml",
    [
      "permissions:",
      "  contents: read",
      "jobs:",
      "  build:",
      "    env:",
      "      JOB_TOKEN: ${{ secrets.JOB_TOKEN }}",
      "    steps:",
      "      - name: Prepare",
      "        run: echo ready",
      "      - name: Call with job secret",
      '        run: curl -H "Authorization: Bearer $JOB_TOKEN" https://example.invalid',
      "      - name: Declare step secret",
      "        env:",
      "          STEP_TOKEN: ${{ secrets.STEP_TOKEN }}",
      "        run: echo configured",
      "      - name: Call with PowerShell secret",
      '        run: Invoke-RestMethod -Headers @{ Authorization = "Bearer $env:STEP_TOKEN" } https://example.invalid',
    ].join("\n"),
  );

  assert.equal(findings.filter(({ rule }) => rule === "secret-shell-exposure").length, 2);
  assert.doesNotMatch(JSON.stringify(findings), /JOB_TOKEN|STEP_TOKEN/u);
});

test("rastreia env global e de job ate headers em steps posteriores", () => {
  const findings = scanWorkflowText(
    "global-job-secret.yml",
    [
      "permissions:",
      "  contents: read",
      "env:",
      "  GLOBAL_TOKEN: ${{ secrets.GLOBAL_TOKEN }}",
      "jobs:",
      "  build:",
      "    env:",
      "      JOB_TOKEN: ${{ secrets.JOB_TOKEN }}",
      "    steps:",
      "      - name: Prepare",
      "        run: echo ready",
      "      - name: Use global env",
      '        run: curl -H "X-Global: $GLOBAL_TOKEN" https://example.invalid',
      "      - name: Use job env",
      '        run: curl -H "X-Job: $env:JOB_TOKEN" https://example.invalid',
    ].join("\n"),
  );

  assert.equal(findings.filter(({ rule }) => rule === "secret-shell-exposure").length, 2);
  assert.doesNotMatch(JSON.stringify(findings), /GLOBAL_TOKEN|JOB_TOKEN/u);
});

test("reconhece secrets com ponto e colchetes em todas as variaveis derivadas", () => {
  const findings = scanWorkflowText(
    "secret-syntaxes.yml",
    [
      "permissions:",
      "  contents: read",
      "jobs:",
      "  build:",
      "    steps:",
      "      - name: Declare secrets",
      "        env:",
      "          DOT_TOKEN: ${{ secrets.DOT_TOKEN }}",
      "          SINGLE_TOKEN: ${{ secrets['SINGLE_TOKEN'] }}",
      '          DOUBLE_TOKEN: ${{ secrets["DOUBLE_TOKEN"] }}',
      "        run: echo configured",
      "      - name: Use dot secret later",
      '        run: curl -H "X-Dot: $DOT_TOKEN" https://example.invalid',
      "      - name: Use single secret later",
      '        run: curl -H "X-Single: $SINGLE_TOKEN" https://example.invalid',
      "      - name: Use double secret later",
      '        run: curl -H "X-Double: $env:DOUBLE_TOKEN" https://example.invalid',
    ].join("\n"),
  );

  assert.equal(findings.filter(({ rule }) => rule === "secret-shell-exposure").length, 3);
  assert.doesNotMatch(JSON.stringify(findings), /DOT_TOKEN|SINGLE_TOKEN|DOUBLE_TOKEN/u);
});

test("analisa permissions do workflow e dos jobs e falha fechado para mapas ambiguos", () => {
  const jobWrite = scanWorkflowText(
    "job-write.yml",
    [
      "permissions: { contents: read }",
      "jobs:",
      "  build:",
      "    permissions:",
      "      contents: write",
    ].join("\n"),
  );
  assert.match(JSON.stringify(jobWrite), /permissions-write/u);

  const inlineWrite = scanWorkflowText(
    "inline-write.yml",
    "permissions: { contents: write, actions: none }\njobs:\n  build:\n",
  );
  assert.match(JSON.stringify(inlineWrite), /permissions-write/u);
  assert.match(JSON.stringify(inlineWrite), /permissions-ambiguous/u);

  const duplicate = scanWorkflowText(
    "duplicate.yml",
    ["permissions: { contents: read }", "permissions: { actions: none }", "jobs:", "  build:"].join(
      "\n",
    ),
  );
  assert.match(JSON.stringify(duplicate), /permissions-duplicate/u);

  const ambiguous = scanWorkflowText(
    "ambiguous.yml",
    "permissions: { contents: read, contents: none }\njobs:\n  build:\n",
  );
  assert.match(JSON.stringify(ambiguous), /permissions-ambiguous/u);
});

test("falha fechado quando o bloco jobs usa um layout de permissions nao reconhecido", () => {
  const findings = scanWorkflowText(
    "unrecognized-jobs-layout.yml",
    [
      "permissions:",
      "  contents: read",
      "jobs:",
      "    build:",
      "      permissions:",
      "        contents: write",
    ].join("\n"),
  );

  assert.match(JSON.stringify(findings), /permissions-ambiguous/u);
});

test("detecta secrets diretos em comandos HTTP e headers sem env intermediario", () => {
  const findings = scanWorkflowText(
    "direct-secret-http.yml",
    [
      "permissions:",
      "  contents: read",
      "jobs:",
      "  build:",
      "    steps:",
      "      - name: Direct HTTP secret",
      '        command: curl -H "Authorization: ${{ secrets.DOT_TOKEN }}" https://example.invalid',
      "        args: wget --header \"X-Token: ${{ secrets['SINGLE_TOKEN'] }}\" https://example.invalid",
      '        headers: Authorization: ${{ secrets["DOUBLE_TOKEN"] }}',
    ].join("\n"),
  );

  assert.equal(findings.filter(({ rule }) => rule === "secret-shell-exposure").length, 3);
  assert.doesNotMatch(JSON.stringify(findings), /DOT_TOKEN|SINGLE_TOKEN|DOUBLE_TOKEN/u);
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

  assert.equal(
    findings.some(({ path: findingPath }) => findingPath === "README.md"),
    true,
  );
  assert.doesNotMatch(serialized, new RegExp(token, "u"));
  for (const excluded of [".env.local", "node_modules", "dist", "graphify-out"]) {
    assert.equal(
      findings.some(({ path: findingPath }) => findingPath.startsWith(excluded)),
      false,
      `nao deveria encontrar ${excluded}`,
    );
  }
});

test("falha fechado ao exceder limites de profundidade, arquivos ou bytes", async () => {
  const cases = [
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "credential-limit-depth-"));
      await mkdir(path.join(root, "one", "two"), { recursive: true });
      await writeFile(path.join(root, "one", "two", "file.txt"), "safe");
      return [root, { maxDepth: 1 }, "scan-limit-depth"];
    },
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "credential-limit-files-"));
      await writeFile(path.join(root, "one.txt"), "safe");
      await writeFile(path.join(root, "two.txt"), "safe");
      return [root, { maxFiles: 1 }, "scan-limit-files"];
    },
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "credential-limit-file-bytes-"));
      await writeFile(path.join(root, "large.txt"), "large");
      return [root, { maxFileBytes: 3 }, "scan-limit-file-bytes"];
    },
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "credential-limit-total-bytes-"));
      await writeFile(path.join(root, "one.txt"), "123");
      await writeFile(path.join(root, "two.txt"), "456");
      return [root, { maxTotalBytes: 5 }, "scan-limit-total-bytes"];
    },
  ];

  for (const createCase of cases) {
    const [root, limits, rule] = await createCase();
    const findings = await scanRepositoryCredentials(root, { limits });
    assert.match(JSON.stringify(findings), new RegExp(rule, "u"));
    assert.doesNotMatch(JSON.stringify(findings), /123|456/u);
  }
});

test("sinaliza material .pem, .key e .crt sem incluir conteudo no finding", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "credential-material-"));
  const material = `fake-material-${"A".repeat(48)}`;
  await writeFile(path.join(root, "server.pem"), material);
  await writeFile(path.join(root, "server.key"), material);
  await writeFile(path.join(root, "server.crt"), material);
  await writeFile(path.join(root, "binary.key"), Buffer.from([0, 1, 2, 3]));

  const findings = await scanRepositoryCredentials(root);
  const serialized = JSON.stringify(findings);

  assert.deepEqual(
    findings.map(({ path: findingPath }) => findingPath),
    ["binary.key", "server.crt", "server.key", "server.pem"],
  );
  assert.doesNotMatch(serialized, /fake-material/u);
});

test("nao trata marcador de chave sem material codificado como exposicao real", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "credential-fixture-"));
  await writeFile(
    path.join(root, "sensitivity.test.mjs"),
    'const fixture = "-----BEGIN PRIVATE KEY-----\\nsegredo\\n-----END PRIVATE KEY-----";\n',
  );

  assert.deepEqual(await scanRepositoryCredentials(root), []);
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

test("mantem baseline temporaria visivel sem bloquear o gate", () => {
  const report = buildCredentialReport(
    [
      {
        rule: "unsafe-private-key-literal",
        path: "services/src/src/config/google.json",
        line: 5,
        severity: "high",
        remediation: "remova a chave privada e rotacione a credencial exposta",
      },
    ],
    {
      now: "2026-08-14T00:00:00.000Z",
      baseline: [
        {
          rule: "unsafe-private-key-literal",
          path: "services/src/src/config/google.json",
          line: 5,
          owner: "ia-pessoas-security",
          justification: "preexisting-service-account-rotation",
          expiresAt: "2026-09-13",
        },
      ],
    },
  );

  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, []);
  assert.equal(report.baselinedFindings.length, 1);
  assert.equal(report.baseline[0].owner, "ia-pessoas-security");
  assert.equal(report.summary.baselined, 1);
});

test("baseline com data ISO invalida ou expirada falha fechada", () => {
  const finding = {
    rule: "unsafe-private-key-literal",
    path: "services/src/src/config/google.json",
    line: 5,
    severity: "high",
    remediation: "remova a chave privada e rotacione a credencial exposta",
  };

  for (const expiresAt of ["2027-02-30", "2026-08-13", "nao-e-data"]) {
    const report = buildCredentialReport([finding], {
      now: "2026-08-14T00:00:00.000Z",
      baseline: [
        {
          rule: finding.rule,
          path: finding.path,
          line: finding.line,
          owner: "ia-pessoas-security",
          justification: "preexisting-service-account-rotation",
          expiresAt,
        },
      ],
    });

    assert.equal(report.ok, false, `baseline invalida deveria bloquear: ${expiresAt}`);
    assert.equal(report.findings.length, 1);
    assert.deepEqual(report.baseline, []);
  }
});

test("baseline rejeita metadata livre e nao ecoa texto arbitrario", () => {
  const secretText = `ghp_${"z".repeat(24)}`;
  const report = buildCredentialReport(
    [
      {
        rule: "unsafe-private-key-literal",
        path: "services/src/src/config/google.json",
        line: 5,
        severity: "high",
        remediation: "remova a chave privada e rotacione a credencial exposta",
      },
    ],
    {
      now: "2026-08-14T00:00:00.000Z",
      baseline: [
        {
          rule: "unsafe-private-key-literal",
          path: "services/src/src/config/google.json",
          line: 5,
          owner: secretText,
          justification: "texto livre que nao deve ser reportado",
          expiresAt: "2026-09-13",
        },
      ],
    },
  );

  assert.equal(report.ok, false);
  assert.equal(report.baseline.length, 0);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secretText, "u"));
  assert.doesNotMatch(JSON.stringify(report), /texto livre/u);
});

test("baseline aceita somente exposicoes conhecidas e paths relativos normalizados", () => {
  const known = buildCredentialReport(
    [
      {
        rule: "credential-material-file",
        path: "services/src/key.pem",
        line: 1,
        severity: "high",
        remediation: "remova o material de credencial do repositorio e rotacione-o",
      },
    ],
    {
      now: "2026-08-14T00:00:00.000Z",
      baseline: [
        {
          rule: "credential-material-file",
          path: ".\\services\\src\\key.pem",
          line: 1,
          owner: "ia-pessoas-security",
          justification: "preexisting-key-rotation",
          expiresAt: "2026-09-13",
        },
      ],
    },
  );
  assert.equal(known.ok, true);
  assert.equal(known.baseline.length, 1);

  const unknown = buildCredentialReport(
    [
      {
        rule: "unsafe-token-literal",
        path: "docs/unknown.txt",
        line: 1,
        severity: "high",
        remediation: "remova o token literal e use um segredo aprovado",
      },
    ],
    {
      now: "2026-08-14T00:00:00.000Z",
      baseline: [
        {
          rule: "unsafe-token-literal",
          path: "../docs/unknown.txt",
          line: 1,
          owner: "ia-pessoas-security",
          justification: "preexisting-key-rotation",
          expiresAt: "2026-09-13",
        },
      ],
    },
  );
  assert.equal(unknown.ok, false);
  assert.equal(unknown.baseline.length, 0);
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
    path.join(repositoryRoot, "scripts", "credential-policy.mjs"),
    root,
    "--report",
    reportPath,
  ]);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert.equal(report.ok, true);
});

test("workflow da politica e somente leitura e nao injeta credenciais", async () => {
  const workflow = await readFile(
    path.join(repositoryRoot, ".github", "workflows", "credential-policy.yml"),
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
