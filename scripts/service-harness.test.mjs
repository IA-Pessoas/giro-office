import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildGeneratedSmokeOperations,
  deriveServiceHarnessConfig,
  extractOpenApiOperationsFromSource,
  formatGeneratedSmokeModule,
  mergeServiceRegistryEntry,
} from "./service-harness-lib.mjs";
import { getServiceRegistryEntry } from "./service-registry.mjs";

const smokeScriptPath = fileURLToPath(new URL("./all-services-smoke.mjs", import.meta.url));

function runSmoke(args, env = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "all-services-smoke-test-"));
  try {
    return spawnSync(process.execPath, [smokeScriptPath, ...args], {
      cwd: path.resolve(path.dirname(smokeScriptPath), ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        GATEWAY_URL: "http://127.0.0.1:1",
        SMOKE_REQUEST_TIMEOUT_MS: "50",
        SMOKE_TMP_DIR: tmpDir,
        ...env,
      },
    });
  } finally {
    fs.rmSync(tmpDir, { force: true, recursive: true });
  }
}

test("deriveServiceHarnessConfig creates deterministic defaults for a new service", () => {
  const config = deriveServiceHarnessConfig({
    service: "billing-service",
    port: "3040",
    usesPrisma: true,
  });

  assert.deepEqual(config, {
    name: "billing-service",
    packagePath: "services/billing-service",
    defaultUrl: "http://localhost:3040",
    urlEnvKey: "BILLING_SERVICE_URL",
    openapiSpecPath: "services/billing-service/src/openapi/spec.ts",
    authModes: ["public", "bearer"],
    internalTokenEnvKey: null,
    prismaOutputPath: "services/billing-service/src/generated/prisma",
  });
});

test("mergeServiceRegistryEntry replaces an existing service without duplicating it", () => {
  const existing = [
    { name: "gateway", packagePath: "services/gateway" },
    { name: "billing-service", packagePath: "services/billing-service", defaultUrl: "old" },
    { name: "user-service", packagePath: "services/user-service" },
  ];

  const merged = mergeServiceRegistryEntry(existing, {
    name: "billing-service",
    packagePath: "services/billing-service",
    defaultUrl: "http://localhost:3040",
  });

  assert.equal(merged.length, 3);
  assert.equal(merged.filter((entry) => entry.name === "billing-service").length, 1);
  assert.deepEqual(
    merged.map((entry) => entry.name),
    ["gateway", "billing-service", "user-service"],
  );
  assert.equal(
    merged.find((entry) => entry.name === "billing-service")?.defaultUrl,
    "http://localhost:3040",
  );
});

test("certificate-service registry entry exposes OpenAPI and internal smoke metadata", () => {
  const entry = getServiceRegistryEntry("certificate-service");

  assert.deepEqual(entry, {
    name: "certificate-service",
    packagePath: "services/certificate-service",
    defaultUrl: "http://localhost:3041",
    urlEnvKey: "CERTIFICATE_SERVICE_URL",
    openapiSpecPath: "services/certificate-service/src/openapi/spec.ts",
    authModes: ["public", "bearer", "admin-bearer", "internal-token"],
    internalTokenEnvKey: "CERTIFICATE_SERVICE_INTERNAL_TOKEN",
    prismaOutputPath: "services/certificate-service/src/generated/prisma",
  });
});

test("extractOpenApiOperationsFromSource discovers path operations from spec source", () => {
  const operations = extractOpenApiOperationsFromSource(`
    export const spec = {
      paths: {
        "/health": {
          get: { responses: {} },
        },
        "/billing/invoices": {
          post: { responses: {} },
          get: { responses: {} },
        },
      },
    };
  `);

  assert.deepEqual(operations, [
    { method: "GET", path: "/health" },
    { method: "POST", path: "/billing/invoices" },
    { method: "GET", path: "/billing/invoices" },
  ]);
});

test("buildGeneratedSmokeOperations creates runnable probes and route placeholders", () => {
  const config = deriveServiceHarnessConfig({
    service: "billing-service",
    port: "3040",
  });
  const discoveredOperations = [
    { method: "GET", path: "/health" },
    { method: "GET", path: "/ready" },
    { method: "POST", path: "/billing/invoices" },
  ];

  const scaffold = buildGeneratedSmokeOperations(config, discoveredOperations);

  assert.deepEqual(scaffold.operations, [
    {
      service: "billing-service",
      method: "GET",
      path: "/health",
      action: "serviceHealth",
      target: "direct",
      auth: "public",
    },
    {
      service: "billing-service",
      method: "GET",
      path: "/ready",
      action: "serviceReady",
      target: "direct",
      auth: "public",
    },
  ]);
  assert.deepEqual(scaffold.routePlaceholders, [
    {
      service: "billing-service",
      method: "POST",
      path: "/billing/invoices",
      target: "gateway",
      auth: "bearer",
      suggestedAction: "billingServicePostBillingInvoices",
    },
  ]);
});

test("formatGeneratedSmokeModule emits deterministic ESM for generated probes", () => {
  const output = formatGeneratedSmokeModule({
    service: "billing-service",
    operations: [{ service: "billing-service", method: "GET", path: "/health" }],
    routePlaceholders: [
      {
        service: "billing-service",
        method: "POST",
        path: "/billing/invoices",
        suggestedAction: "billingServicePostBillingInvoices",
      },
    ],
  });

  assert.match(output, /Generated by scripts\/generate-service-harness\.mjs/);
  assert.match(output, /export const operations = \[/);
  assert.match(output, /export const routePlaceholders = \[/);
  assert.match(output, /billingServicePostBillingInvoices/);
});

test("all-services smoke builds user and task payloads from a verified department", () => {
  const source = fs.readFileSync(new URL("./all-services-smoke.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(source, /department_id: requireState\("baselineDepartmentId"\)/);
  assert.doesNotMatch(source, /department_id: state\.baselineDepartmentId/);
  assert.doesNotMatch(source, /user_id: requireState\("session"\)\.id/);
  assert.match(source, /name: uniqueText\("Smoke Helper Department"\)/);
  assert.match(source, /department_id: await ensureDepartmentId\(\)/);
});

test("all-services smoke includes certificate-service state and handlers", () => {
  const source = fs.readFileSync(new URL("./all-services-smoke.mjs", import.meta.url), "utf8");
  const generatedCertificateSmoke = fs.readFileSync(
    new URL("./generated/certificate-service.smoke.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /certificatePjId: ""/);
  assert.match(source, /certificatePfId: ""/);
  assert.match(source, /modules: \{ certificado: 1 \}/);
  assert.match(source, /modules: \{ certificado: 2 \}/);
  assert.match(source, /async certificatePjCreate\(op\)/);
  assert.match(source, /async certificatePjFileUpload\(op\)/);
  assert.match(source, /async certificatePjFileDownload\(op\)/);
  assert.match(source, /async certificatePjFileDelete\(op\)/);
  assert.match(source, /async certificatePfCreate\(op\)/);
  assert.match(source, /async certificatePfFileUpload\(op\)/);
  assert.match(source, /async certificatePfFileDownload\(op\)/);
  assert.match(source, /async certificatePfFileDelete\(op\)/);
  assert.match(source, /async certificateNotificationRun\(op\)/);
  assert.match(generatedCertificateSmoke, /certificatePjFileUploadForbidden/);
  assert.match(generatedCertificateSmoke, /certificatePjFileDownloadForbidden/);
  assert.match(generatedCertificateSmoke, /certificatePjFileDeleteForbidden/);
  assert.match(generatedCertificateSmoke, /certificatePfFileUploadForbidden/);
  assert.match(generatedCertificateSmoke, /certificatePfFileDownloadForbidden/);
  assert.match(generatedCertificateSmoke, /certificatePfFileDeleteForbidden/);
});

test("all-services smoke includes the task model dependency options handler", () => {
  const source = fs.readFileSync(new URL("./all-services-smoke.mjs", import.meta.url), "utf8");

  assert.match(source, /async taskDepsOptions\(op\)/);
});

test("all-services smoke exits non-zero when continue-on-failure collects failures", () => {
  const result = runSmoke(["--filter=gatewayHealth"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /Smoke run completed with failures/);
  assert.doesNotMatch(output, /Smoke run completed successfully/);
});

test("all-services smoke dry-run still exits successfully", () => {
  const result = runSmoke(["--dry-run", "--filter=gatewayHealth"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /Smoke run completed successfully/);
});

test("task reporting smoke stays disabled without its explicit gate", () => {
  const result = runSmoke(["--dry-run", "--filter=taskReporting"]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /TASK_REPORTING_SMOKE_ENABLED is false/);
  assert.doesNotMatch(output, /Missing REPORTS_GRANT_SECRET for task reporting smoke/);
});
