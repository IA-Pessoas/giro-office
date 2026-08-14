import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.github.com";
const DEFAULT_PAGE_LIMIT = 10;
const DEFAULT_LAG_THRESHOLD_MINUTES = 10;
const MAX_PAGE_LIMIT = 100;
const MAX_EVENTS_PER_PAGE = 100;

export const EVENT_RULES = Object.freeze({
  "protected_branch.policy_override": {
    severity: "high",
    category: "protected-ref-bypass",
    alert: true,
  },
  "protected_branch.authorized_users_teams": {
    severity: "high",
    category: "protected-ref-bypass",
    alert: true,
  },
  "protected_branch.branch_allowances": {
    severity: "high",
    category: "protected-ref-bypass",
    alert: true,
  },
  "protected_branch.update_allow_force_pushes_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_allow_deletions_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.destroy": {
    severity: "high",
    category: "protected-ref-deletion",
    alert: true,
  },
  "secret_scanning_push_protection.bypass": {
    severity: "high",
    category: "security-control-bypass",
    alert: true,
  },
  "personal_access_token.access_granted": {
    severity: "high",
    category: "credential-change",
    alert: true,
  },
  "personal_access_token.access_revoked": {
    severity: "medium",
    category: "credential-change",
    alert: true,
  },
  "workflows.created_workflow_run": {
    severity: "low",
    category: "workflow-activity",
    alert: true,
  },
  "repo.access": {
    severity: "high",
    category: "repository-access-change",
    alert: true,
  },
});

const SEVERITY_RANK = Object.freeze({ high: 0, medium: 1, low: 2, unclassified: 3 });
const SENSITIVE_VALUE = /(?:gh[pousr]_|github_pat_|bearer\s+|authorization\b|token\b)/iu;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const IPV4_VALUE = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const SHA_VALUE = /^[a-f0-9]{7,64}$/iu;

export class AuditMonitorError extends Error {
  constructor(code) {
    super(code);
    this.name = "AuditMonitorError";
    this.code = code;
  }
}

function safeString(value, { sensitive = true, maxLength = 256 } = {}) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (sensitive && (SENSITIVE_VALUE.test(normalized) || EMAIL_VALUE.test(normalized) || IPV4_VALUE.test(normalized))) {
    return "[redacted]";
  }
  return normalized.slice(0, maxLength);
}

function firstString(...values) {
  for (const value of values) {
    const result = safeString(value);
    if (result !== undefined) return result;
  }
  return undefined;
}

function readActor(event) {
  const actor = event?.actor;
  if (actor && typeof actor === "object") {
    return firstString(actor.login, actor.name, actor.id);
  }
  return firstString(event?.actor_login, actor, event?.user_login, event?.user_name);
}

function readActorType(event) {
  const actor = event?.actor;
  if (actor && typeof actor === "object") {
    return firstString(actor.type, actor.actor_type);
  }
  return firstString(event?.actor_type, event?.user_type, event?.actorType);
}

function readRepository(event) {
  const repo = event?.repo ?? event?.repository;
  if (repo && typeof repo === "object") {
    return firstString(repo.name, repo.full_name, repo.fullName);
  }
  return firstString(repo, event?.repo_name, event?.repository_name);
}

function readOrganization(event) {
  const organization = event?.org ?? event?.organization;
  if (organization && typeof organization === "object") {
    return firstString(organization.login, organization.name);
  }
  return firstString(organization, event?.org_name, event?.organization_name);
}

function readTimestamp(event) {
  return event?.created_at ?? event?.createdAt ?? event?.timestamp ?? event?.["@timestamp"];
}

function toIsoTimestamp(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function readSha(...values) {
  for (const value of values) {
    const candidate = safeString(value, { sensitive: false, maxLength: 64 });
    if (candidate && SHA_VALUE.test(candidate)) return candidate;
  }
  return undefined;
}

function isForcedPush(event) {
  return (
    event?.force_push === true ||
    event?.force_push === "true" ||
    event?.forced === true ||
    event?.forced === "true" ||
    event?.force === true ||
    event?.force === "true" ||
    event?.ref_update_type === "forced"
  );
}

function isDeletedRef(event) {
  return (
    event?.deleted === true ||
    event?.deleted === "true" ||
    event?.ref_deleted === true ||
    event?.ref_deleted === "true" ||
    event?.ref_update_type === "deleted" ||
    event?.ref_update_type === "delete"
  );
}

export function classifyAuditEvent(event) {
  const action = safeString(event?.action, { sensitive: false });
  if (action === "git.push") {
    if (isDeletedRef(event)) return { severity: "high", category: "ref-deletion", alert: true };
    if (isForcedPush(event)) return { severity: "high", category: "ref-rewrite", alert: true };
    return { severity: "low", category: "ref-update", alert: false };
  }

  return (
    EVENT_RULES[action] ?? {
      severity: "unclassified",
      category: "unclassified",
      alert: false,
    }
  );
}

export function normalizeAuditEvent(event) {
  const classification = classifyAuditEvent(event);
  const normalized = {
    action: safeString(event?.action, { sensitive: false }) ?? "unclassified",
    actor: readActor(event) ?? "[unknown]",
    actorType: readActorType(event) ?? "[unknown]",
    alert: classification.alert,
    category: classification.category,
    createdAt: toIsoTimestamp(readTimestamp(event)),
    newSha: readSha(event?.new_sha, event?.new_oid, event?.new_commit, event?.new_commit_id),
    oldSha: readSha(event?.old_sha, event?.old_oid, event?.old_commit, event?.old_commit_id),
    organization: readOrganization(event) ?? "[unknown]",
    ref: firstString(event?.ref, event?.branch, event?.tag) ?? "[unknown]",
    repository: readRepository(event) ?? "[unknown]",
    severity: classification.severity,
    source: firstString(event?.source, event?.source_name, event?.origin) ?? "github-audit-log",
  };

  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
}

export function deduplicateAlerts(events) {
  const unique = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    const normalized = normalizeAuditEvent(event);
    if (!normalized.alert) continue;
    const key = [
      normalized.action,
      normalized.actorType,
      normalized.actor,
      normalized.repository,
      normalized.ref,
      normalized.createdAt ?? "[unknown-time]",
    ].join("|");
    unique.set(key, normalized);
  }

  return [...unique.values()].sort((left, right) => {
    const severity = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
    if (severity !== 0) return severity;
    return JSON.stringify(left).localeCompare(JSON.stringify(right));
  });
}

function positiveInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new AuditMonitorError("invalid_page_limit");
  }
  return parsed;
}

function nextPageFromLink(linkHeader) {
  if (typeof linkHeader !== "string") return undefined;
  const match = linkHeader.match(/<([^>]+)>\s*;\s*rel=["']next["']/iu);
  return match?.[1];
}

function buildAuditUrl(organization, since) {
  const url = new URL(`/orgs/${encodeURIComponent(organization)}/audit-log`, API_URL);
  url.searchParams.set("per_page", String(MAX_EVENTS_PER_PAGE));
  if (since) url.searchParams.set("after", since);
  return url;
}

async function collectAuditEvents({ organization, token, since, pageLimit = DEFAULT_PAGE_LIMIT }) {
  if (!organization || typeof organization !== "string" || !organization.trim()) {
    throw new AuditMonitorError("missing_organization");
  }
  if (!token || typeof token !== "string") throw new AuditMonitorError("missing_token");

  const limit = positiveInteger(pageLimit, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const events = [];
  let url = buildAuditUrl(organization.trim(), since);
  let pages = 0;
  let hasNextPage = false;

  while (url && pages < limit) {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    } catch {
      throw new AuditMonitorError("api_request_failed");
    }

    if (!response?.ok) throw new AuditMonitorError("api_http_error");

    let page;
    try {
      page = await response.json();
    } catch {
      throw new AuditMonitorError("api_malformed_json");
    }
    if (!Array.isArray(page)) throw new AuditMonitorError("api_malformed_json");
    if (page.length > MAX_EVENTS_PER_PAGE) throw new AuditMonitorError("api_page_too_large");
    events.push(...page);
    pages += 1;
    url = nextPageFromLink(response.headers?.get?.("link"));
    hasNextPage = Boolean(url);
  }

  if (hasNextPage) throw new AuditMonitorError("pagination_limit");
  return { events, pages, paginationLimitReached: false };
}

export async function fetchAuditEvents(options) {
  const result = await collectAuditEvents(options ?? {});
  return result.events;
}

function parseLagThreshold(value) {
  if (value === undefined) return DEFAULT_LAG_THRESHOLD_MINUTES;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24 * 60) {
    throw new AuditMonitorError("invalid_lag_threshold");
  }
  return parsed;
}

function safeNow(value) {
  const iso = toIsoTimestamp(value ?? new Date());
  if (!iso) throw new AuditMonitorError("invalid_now");
  return iso;
}

function hasMalformedTimestamp(event) {
  const raw = readTimestamp(event);
  return raw !== undefined && raw !== null && raw !== "" && !toIsoTimestamp(raw);
}

function roundMinutes(value) {
  return Math.round(value * 100) / 100;
}

export function buildAuditReport(events, options = {}) {
  const rawEvents = Array.isArray(events) ? events : [];
  const now = safeNow(options.now);
  const startedAt = toIsoTimestamp(options.startedAt) ?? now;
  const completedAt = toIsoTimestamp(options.completedAt) ?? now;
  const lagThresholdMinutes = parseLagThreshold(options.lagThresholdMinutes);
  const normalizedEvents = rawEvents.map(normalizeAuditEvent);
  const alerts = deduplicateAlerts(rawEvents);
  const latestEventAt = normalizedEvents
    .map((event) => event.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const lagMinutes = latestEventAt
    ? roundMinutes(Math.max(0, (Date.parse(now) - Date.parse(latestEventAt)) / 60000))
    : null;

  let error;
  if (rawEvents.some(hasMalformedTimestamp)) {
    error = { code: "invalid_event_timestamp", message: "audit event timestamp is invalid" };
  } else if (options.paginationLimitReached) {
    error = { code: "pagination_limit", message: "audit pagination limit reached" };
  } else if (lagMinutes !== null && lagMinutes > lagThresholdMinutes) {
    error = { code: "audit_lag", message: "audit collection lag exceeds threshold" };
  }

  const summary = {
    totalEvents: rawEvents.length,
    totalAlerts: alerts.length,
    high: alerts.filter((alert) => alert.severity === "high").length,
    medium: alerts.filter((alert) => alert.severity === "medium").length,
    low: alerts.filter((alert) => alert.severity === "low").length,
    health: error ? "failed" : "ok",
  };
  const blockingAlerts = alerts.some((alert) => alert.severity === "high" || alert.severity === "medium");
  const collection = {
    startedAt,
    completedAt,
    pages: Number.isInteger(options.pages) && options.pages >= 0 ? options.pages : 0,
    events: rawEvents.length,
    latestEventAt: latestEventAt ?? null,
    lagMinutes,
  };

  return {
    ok: !error && !blockingAlerts,
    generatedAt: completedAt,
    collection,
    alerts,
    summary,
    ...(error ? { error } : {}),
  };
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasArgument(args, name) {
  return args.includes(name);
}

function usage() {
  return "usage: node scripts/github-audit-monitor.mjs --org <organization> --report <path> [--since <ISO>] [--page-limit <n>] [--fail-on-alert] [--input <json>]";
}

async function readInput(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    const events = Array.isArray(parsed) ? parsed : parsed?.events;
    if (!Array.isArray(events)) throw new AuditMonitorError("input_malformed_json");
    return events;
  } catch (error) {
    if (error instanceof AuditMonitorError) throw error;
    throw new AuditMonitorError("input_malformed_json");
  }
}

export async function main(args = process.argv.slice(2), environment = process.env) {
  const reportPath = argumentValue(args, "--report");
  const inputPath = argumentValue(args, "--input");
  const organization = argumentValue(args, "--org");
  const since = argumentValue(args, "--since");
  const pageLimit = argumentValue(args, "--page-limit");
  const now = argumentValue(args, "--now");
  const lagThresholdMinutes = argumentValue(args, "--lag-threshold");

  if (!reportPath || (hasArgument(args, "--input") && !inputPath) || (!inputPath && !organization)) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }

  let report;
  try {
    if (inputPath) {
      const events = await readInput(inputPath);
      report = buildAuditReport(events, { now, lagThresholdMinutes, pages: 1 });
    } else {
      const startedAt = safeNow(now);
      const result = await collectAuditEvents({
        organization,
        token: environment.GITHUB_AUDIT_LOG_TOKEN,
        since,
        pageLimit,
      });
      report = buildAuditReport(result.events, {
        now,
        lagThresholdMinutes,
        startedAt,
        completedAt: safeNow(now),
        pages: result.pages,
        paginationLimitReached: result.paginationLimitReached,
      });
    }
  } catch (error) {
    const safeError = error instanceof AuditMonitorError ? error : new AuditMonitorError("collection_failed");
    report = {
      ok: false,
      generatedAt: new Date().toISOString(),
      collection: {
        startedAt: null,
        completedAt: new Date().toISOString(),
        pages: 0,
        events: 0,
        latestEventAt: null,
        lagMinutes: null,
      },
      alerts: [],
      summary: { totalEvents: 0, totalAlerts: 0, high: 0, medium: 0, low: 0, health: "failed" },
      error: { code: safeError.code, message: safeError.message },
    };
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (hasArgument(args, "--fail-on-alert") && !report.ok) return 1;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
