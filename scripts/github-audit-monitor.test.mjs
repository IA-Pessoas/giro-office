import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildAuditReport,
  classifyAuditEvent,
  correlateAuditEvents,
  deduplicateAlerts,
  fetchAuditEvents,
  main,
  normalizeAuditEvent,
} from "./github-audit-monitor.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function auditEvent(overrides = {}) {
  return {
    actor: "davi-araujo",
    actor_type: "User",
    org: "IA-Pessoas",
    repo: "IA-Pessoas/giro-office",
    action: "git.push",
    ref: "refs/heads/develop",
    old_oid: "a".repeat(40),
    new_oid: "b".repeat(40),
    force_push: true,
    source: "github-rest-audit-log",
    created_at: "2026-08-14T10:00:00Z",
    ...overrides,
  };
}

test("classifica os eventos oficiais de alto risco e conserva desconhecidos sem alerta", () => {
  const highRisk = [
    "protected_branch.policy_override",
    "protected_branch.update_allow_force_pushes_enforcement_level",
    "protected_branch.update_allow_deletions_enforcement_level",
    "protected_branch.destroy",
    "secret_scanning_push_protection.bypass",
  ];

  for (const action of highRisk) {
    const result = classifyAuditEvent({ action });
    assert.equal(result.severity, "high", action);
    assert.equal(result.alert, true, action);
  }

  assert.equal(classifyAuditEvent({ action: "git.push", force_push: true }).severity, "high");
  assert.equal(classifyAuditEvent({ action: "git.push", deleted: true }).category, "ref-deletion");
  assert.equal(classifyAuditEvent({ action: "protected_branch.authorized_users_teams" }).severity, "high");
  assert.equal(classifyAuditEvent({ action: "protected_branch.branch_allowances" }).severity, "high");
  for (const action of [
    "repository_ruleset.create",
    "repository_ruleset.update",
    "repository_ruleset.destroy",
    "protected_branch.update_admin_enforced",
    "protected_branch.update_ignore_approvals_from_contributors",
    "protected_branch.update_linear_history_requirement_enforcement_level",
    "protected_branch.update_lock_allows_fetch_and_merge",
    "protected_branch.update_lock_branch_enforcement_level",
    "protected_branch.update_merge_queue_enforcement_level",
    "protected_branch.update_name",
    "protected_branch.update_pull_request_reviews_enforcement_level",
    "protected_branch.update_require_code_owner_review",
    "protected_branch.update_require_last_push_approval",
    "protected_branch.update_required_approving_review_count",
    "protected_branch.update_required_status_checks_enforcement_level",
    "protected_branch.update_signature_requirement_enforcement_level",
    "protected_branch.update_strict_required_status_checks_policy",
  ]) {
    const result = classifyAuditEvent({ action });
    assert.equal(result.severity, "high", action);
    assert.equal(result.alert, true, action);
  }
  assert.match(classifyAuditEvent({ action: "personal_access_token.access_granted" }).severity, /high|medium/u);
  assert.match(classifyAuditEvent({ action: "personal_access_token.access_revoked" }).severity, /high|medium/u);
  assert.equal(classifyAuditEvent({ action: "workflows.created_workflow_run" }).severity, "low");
  assert.equal(classifyAuditEvent({ action: "repo.access" }).alert, true);

  assert.deepEqual(classifyAuditEvent({ action: "future.unknown_action" }), {
    severity: "unclassified",
    category: "unclassified",
    alert: false,
  });
});

test("normaliza somente campos permitidos e elimina dados sensíveis", () => {
  const normalized = normalizeAuditEvent(
    auditEvent({
      actor: "person@example.com",
      actor_type: "Bot",
      source_ip: "192.0.2.10",
      email: "person@example.com",
      token_id: "ghp_fake_token_should_never_appear",
      token_scopes: ["repo"],
      authorization: "Bearer ghp_fake_token_should_never_appear",
      request_headers: { authorization: "Bearer ghp_fake_token_should_never_appear" },
      data: { old_payload: "decoded-malicious-payload" },
      unknown_field: "must-be-dropped",
    }),
  );

  assert.deepEqual(Object.keys(normalized).sort(), [
    "action",
    "actor",
    "actorType",
    "alert",
    "category",
    "createdAt",
    "metadataStatus",
    "newSha",
    "oldSha",
    "organization",
    "ref",
    "repository",
    "severity",
    "source",
  ]);
  assert.equal(normalized.actorType, "Bot");
  assert.equal(normalized.organization, "IA-Pessoas");
  assert.equal(normalized.repository, "IA-Pessoas/giro-office");
  assert.equal(normalized.oldSha, "a".repeat(40));
  assert.equal(normalized.newSha, "b".repeat(40));
  assert.doesNotMatch(JSON.stringify(normalized), /ghp_|authorization|example\.com|192\.0\.2\.10|payload|unknown_field/iu);
});

test("normaliza flags oficiais de ator e nome de protected branch", () => {
  const bot = normalizeAuditEvent(
    auditEvent({ actor_is_bot: true, actor_is_agent: false, actor_type: undefined }),
  );
  const agent = normalizeAuditEvent(
    auditEvent({ actor_is_bot: false, actor_is_agent: true, actor_type: undefined }),
  );
  const app = normalizeAuditEvent(auditEvent({ actor_type: "Integration" }));
  const protectedBranch = normalizeAuditEvent({
    action: "protected_branch.destroy",
    actor: "security-canary",
    actor_is_bot: true,
    org: "IA-Pessoas",
    repo: "IA-Pessoas/giro-office",
    name: "refs/heads/main",
    created_at: "2026-08-14T10:00:00Z",
  });

  assert.equal(bot.actorType, "Bot");
  assert.equal(agent.actorType, "Agent");
  assert.equal(app.actorType, "App");
  assert.equal(protectedBranch.ref, "refs/heads/main");
});

test("deduplica alertas por ação, ator, repositório, ref e timestamp", () => {
  const duplicate = auditEvent();
  const alerts = deduplicateAlerts([
    duplicate,
    { ...duplicate, data: { duplicated: true } },
    { ...duplicate, repo: "IA-Pessoas/another-repo" },
    { ...duplicate, ref: "refs/tags/v1.0.0" },
  ]);

  assert.equal(alerts.length, 3);
  assert.deepEqual(
    alerts.map((alert) => [alert.repository, alert.ref]),
    [
      ["IA-Pessoas/another-repo", "refs/heads/develop"],
      ["IA-Pessoas/giro-office", "refs/heads/develop"],
      ["IA-Pessoas/giro-office", "refs/tags/v1.0.0"],
    ],
  );
});

test("relatório sinaliza atraso e timestamp inválido sem expor evento bruto", () => {
  const now = "2026-08-14T10:30:00Z";
  const lagging = buildAuditReport([auditEvent()], {
    now,
    lagThresholdMinutes: 10,
    startedAt: "2026-08-14T10:30:00Z",
    completedAt: now,
    pages: 1,
  });
  assert.equal(lagging.ok, false);
  assert.equal(lagging.collection.lagMinutes, 30);
  assert.equal(lagging.collection.latestEventAt, "2026-08-14T10:00:00.000Z");
  assert.equal(lagging.error.code, "audit_lag");

  const malformed = buildAuditReport([auditEvent({ created_at: "not-a-timestamp" })], { now });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.error.code, "invalid_event_timestamp");
  assert.doesNotMatch(JSON.stringify(malformed), /not-a-timestamp|force_push|old_oid|"data"/iu);

  const empty = buildAuditReport([], { now });
  assert.equal(empty.collection.events, 0);
  assert.equal(empty.collection.latestEventAt, null);
  assert.equal(empty.collection.lagMinutes, null);
});

test("coleta REST usa paginação limitada e não inclui token nos erros", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) =>
          name.toLowerCase() === "link"
            ? '<https://api.github.com/orgs/IA-Pessoas/audit-log?include=all&page=2>; rel="next"'
            : null,
      },
      json: async () => [auditEvent()],
    };
  };

  try {
    await assert.rejects(
      fetchAuditEvents({
        organization: "IA-Pessoas",
        token: "ghp_fake_token_should_never_appear",
        since: "2026-08-14T09:00:00Z",
        pageLimit: 1,
      }),
      (error) => error.code === "pagination_limit" && !error.message.includes("ghp_"),
    );
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /orgs%2FIA-Pessoas|orgs\/IA-Pessoas/u);
    const firstUrl = new URL(calls[0].url);
    assert.equal(firstUrl.searchParams.get("include"), "all");
    assert.equal(firstUrl.searchParams.get("after"), null);
    assert.equal(firstUrl.searchParams.get("phrase"), "created:>=2026-08-14T09:00:00Z");
    assert.match(calls[0].options.headers.Authorization, /^Bearer /u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("separa since ISO de cursor after", async () => {
  const originalFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => [] };
  };
  try {
    await fetchAuditEvents({
      organization: "IA-Pessoas",
      token: "safe-test-token",
      since: "2026-08-14T09:00:00Z",
      cursor: "opaque-cursor",
      pageLimit: 1,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const url = new URL(urls[0]);
  assert.equal(url.searchParams.get("include"), "all");
  assert.equal(url.searchParams.get("phrase"), "created:>=2026-08-14T09:00:00Z");
  assert.equal(url.searchParams.get("after"), "opaque-cursor");
});

test("rejeita Link rel=next externo antes da segunda chamada e sem vazar token", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => '<https://evil.example/audit-log>; rel="next"' },
      json: async () => [auditEvent()],
    };
  };
  try {
    await assert.rejects(
      fetchAuditEvents({ organization: "IA-Pessoas", token: "ghp_secret-must-not-leak", pageLimit: 2 }),
      (error) => error.code === "invalid_next_link" && !error.message.includes("ghp_secret"),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("coleta rejeita configuração ausente e respostas não-2xx sem corpo", async () => {
  await assert.rejects(
    fetchAuditEvents({ organization: "IA-Pessoas", token: "", pageLimit: 1 }),
    (error) => error.code === "missing_token" && !error.message.includes("ghp_"),
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    headers: { get: () => null },
    text: async () => "secret response body must not be read",
  });
  try {
    await assert.rejects(
      fetchAuditEvents({ organization: "IA-Pessoas", token: "safe-test-token", pageLimit: 1 }),
      (error) => error.code === "api_http_error" && !error.message.includes("secret response body"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("coleta rejeita página REST acima do limite seguro e JSON sem lista de eventos", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => Array.from({ length: 101 }, () => auditEvent()),
  });
  try {
    await assert.rejects(
      fetchAuditEvents({ organization: "IA-Pessoas", token: "safe-test-token", pageLimit: 1 }),
      (error) => error.code === "api_page_too_large",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ unexpected: true }),
  });
  try {
    await assert.rejects(
      fetchAuditEvents({ organization: "IA-Pessoas", token: "safe-test-token", pageLimit: 1 }),
      (error) => error.code === "api_malformed_json",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CLI grava relatório sanitizado e retorna falha somente com alerta relevante", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "github-audit-monitor-"));
  const inputPath = path.join(directory, "events.json");
  const reportPath = path.join(directory, "report.json");
  await writeFile(inputPath, JSON.stringify([auditEvent({ token_id: "ghp_not-for-output" })]));

  try {
    const exitCode = await main([
      "--input",
      inputPath,
      "--report",
      reportPath,
      "--fail-on-alert",
      "--now",
      "2026-08-14T10:01:00Z",
    ]);
    assert.equal(exitCode, 1);
    const report = await readFile(reportPath, "utf8");
    assert.match(report, /ref-rewrite/u);
    assert.doesNotMatch(report, /ghp_not-for-output|old_oid|token_id|force_push/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("workflow e fixture mantêm coleta somente leitura", async () => {
  const workflow = await readFile(path.join(repositoryRoot, ".github/workflows/github-audit-monitor.yml"), "utf8");
  const fixture = await readFile(path.join(repositoryRoot, "scripts/fixtures/github-audit-events.json"), "utf8");

  assert.match(workflow, /cron:\s*["']?\*\/5 \* \* \* \*["']?/u);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/u);
  assert.match(workflow, /persist-credentials:\s*false/u);
  assert.match(workflow, /node-version:\s*["']?22["']?/u);
  assert.match(workflow, /secrets\.GITHUB_AUDIT_LOG_TOKEN/u);
  assert.match(workflow, /if:\s*always\(\)/u);
  assert.match(workflow, /retention-days:\s*7/u);
  assert.doesNotMatch(workflow, /permissions:\s*write-all|git push|--force/iu);
  assert.doesNotMatch(fixture, /ghp_|authorization|request_headers|decoded-malicious/iu);
});

test("payload oficial mínimo de git.push não inventa metadados ausentes", async () => {
  const official = JSON.parse(
    await readFile(path.join(repositoryRoot, "scripts/fixtures/github-audit-events-official.json"), "utf8"),
  );
  const gitPush = official.find((event) => event.action === "git.push");
  const normalized = normalizeAuditEvent(gitPush);
  const report = buildAuditReport(official, { now: "2026-08-14T10:05:00Z" });

  assert.equal(normalized.oldSha, undefined);
  assert.equal(normalized.newSha, undefined);
  assert.equal(normalized.metadataStatus, "insufficient");
  assert.equal(normalized.category, "metadata-insufficient");
  assert.equal(report.error.code, "metadata_insufficient");
  assert.doesNotMatch(JSON.stringify(report), /token_id|hashed_token|request_access_security_header/iu);
});

test("correlaciona eventos sanitizados por ator/repo/ref/request em janela e tamanho limitados", () => {
  const events = [
    auditEvent({ action: "workflows.created_workflow_run", request_id: "req-1", created_at: "2026-08-14T10:00:00Z" }),
    auditEvent({ action: "protected_branch.policy_override", request_id: "req-1", created_at: "2026-08-14T10:04:00Z" }),
    auditEvent({ action: "git.push", request_id: "req-1", force_push: true, created_at: "2026-08-14T10:06:00Z" }),
    auditEvent({ action: "git.push", request_id: "req-1", force_push: true, created_at: "2026-08-14T10:20:00Z" }),
  ];
  const correlations = correlateAuditEvents(events, { windowMinutes: 10, maxEvents: 10, maxGroups: 10 });
  assert.equal(correlations.length, 2);
  assert.equal(correlations[0].eventCount, 3);
  assert.deepEqual(correlations[0].actions, [
    "git.push",
    "protected_branch.policy_override",
    "workflows.created_workflow_run",
  ]);
  assert.doesNotMatch(JSON.stringify(correlations), /request_headers|token_id|force_push|data/iu);

  const bounded = correlateAuditEvents(events, { windowMinutes: 10, maxEvents: 2, maxGroups: 1 });
  assert.equal(bounded.length, 1);
  assert.equal(bounded[0].eventCount, 2);
});

test("input normalizado complementar identifica a fonte sem alegar que REST fornece SHAs", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "github-audit-source-"));
  const inputPath = path.join(directory, "webhook.json");
  const reportPath = path.join(directory, "report.json");
  await writeFile(
    inputPath,
    JSON.stringify({
      source: "normalized-webhook",
      events: [auditEvent({ source_type: "webhook", force_push: true })],
    }),
  );
  try {
    const exitCode = await main(["--input", inputPath, "--report", reportPath, "--now", "2026-08-14T10:01:00Z"]);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(exitCode, 0);
    assert.equal(report.collection.source, "normalized-webhook");
    assert.equal(report.alerts[0].category, "ref-rewrite");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
