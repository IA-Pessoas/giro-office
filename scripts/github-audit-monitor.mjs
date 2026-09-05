import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.github.com";
const DEFAULT_PAGE_LIMIT = 10;
const DEFAULT_LAG_THRESHOLD_MINUTES = 10;
const MAX_PAGE_LIMIT = 100;
const MAX_EVENTS_PER_PAGE = 100;
const DEFAULT_CORRELATION_WINDOW_MINUTES = 10;
const MAX_CORRELATION_EVENTS = 200;
const MAX_CORRELATION_GROUPS = 50;
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_INPUT_EVENTS = 1000;
const DEFAULT_INPUT_MAX_AGE_MINUTES = 15;

export const EVENT_RULES = Object.freeze({
  "protected_branch.policy_override": {
    severity: "high",
    category: "protected-ref-bypass",
    alert: true,
  },
  "protected_branch.create": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.dismiss_stale_reviews": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.dismissal_restricted_users_teams": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.rejected_ref_update": {
    severity: "medium",
    category: "protected-ref-rejected-update",
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
  "protected_branch.update_admin_enforced": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_ignore_approvals_from_contributors": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_linear_history_requirement_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_lock_allows_fetch_and_merge": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_lock_branch_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_merge_queue_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_name": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_pull_request_reviews_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_require_code_owner_review": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_require_last_push_approval": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_required_approving_review_count": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_required_status_checks_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_required_deployments_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_required_review_thread_resolution_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "repo.add_member": { severity: "high", category: "repository-access-change", alert: true },
  "repo.remove_member": { severity: "high", category: "repository-access-change", alert: true },
  "org.add_member": { severity: "high", category: "organization-access-change", alert: true },
  "org.remove_member": { severity: "high", category: "organization-access-change", alert: true },
  "org.add_outside_collaborator": {
    severity: "high",
    category: "organization-access-change",
    alert: true,
  },
  "org.remove_outside_collaborator": {
    severity: "high",
    category: "organization-access-change",
    alert: true,
  },
  "org.required_workflow_create": { severity: "high", category: "workflow-security", alert: true },
  "org.required_workflow_delete": { severity: "high", category: "workflow-security", alert: true },
  "org.required_workflow_update": { severity: "high", category: "workflow-security", alert: true },
  "integration.create": { severity: "high", category: "integration-change", alert: true },
  "integration.destroy": { severity: "high", category: "integration-change", alert: true },
  "integration.revoke_tokens": { severity: "high", category: "credential-change", alert: true },
  "integration.revoke_all_tokens": { severity: "high", category: "credential-change", alert: true },
  "integration.suspend": { severity: "high", category: "integration-change", alert: true },
  "integration.unsuspend": { severity: "high", category: "integration-change", alert: true },
  "integration.transfer": { severity: "high", category: "integration-change", alert: true },
  "integration.manager_added": { severity: "high", category: "integration-change", alert: true },
  "integration.manager_removed": { severity: "high", category: "integration-change", alert: true },
  "integration.remove_client_secret": {
    severity: "high",
    category: "credential-change",
    alert: true,
  },
  "integration_installation.create": {
    severity: "high",
    category: "integration-change",
    alert: true,
  },
  "integration_installation.destroy": {
    severity: "high",
    category: "integration-change",
    alert: true,
  },
  "integration_installation.repositories_added": {
    severity: "high",
    category: "integration-change",
    alert: true,
  },
  "integration_installation.repositories_removed": {
    severity: "high",
    category: "integration-change",
    alert: true,
  },
  "protected_branch.update_signature_requirement_enforcement_level": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "protected_branch.update_strict_required_status_checks_policy": {
    severity: "high",
    category: "protected-ref-policy-change",
    alert: true,
  },
  "repository_ruleset.create": {
    severity: "high",
    category: "ruleset-change",
    alert: true,
  },
  "repository_ruleset.update": {
    severity: "high",
    category: "ruleset-change",
    alert: true,
  },
  "repository_ruleset.destroy": {
    severity: "high",
    category: "ruleset-change",
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
  "workflows.prepared_workflow_job": {
    severity: "high",
    category: "workflow-security",
    alert: true,
  },
  "workflows.completed_workflow_run": {
    severity: "low",
    category: "workflow-activity",
    alert: true,
  },
  "workflows.disable_workflow": { severity: "high", category: "workflow-security", alert: true },
  "workflows.enable_workflow": { severity: "medium", category: "workflow-security", alert: true },
  "workflows.delete_workflow_run": { severity: "high", category: "workflow-security", alert: true },
  "workflows.reject_workflow_job": { severity: "high", category: "workflow-security", alert: true },
  "workflows.rerun_workflow_run": {
    severity: "medium",
    category: "workflow-security",
    alert: true,
  },
  "workflows.cancel_workflow_run": {
    severity: "medium",
    category: "workflow-security",
    alert: true,
  },
  "workflows.actions_policy_violation": {
    severity: "high",
    category: "workflow-security",
    alert: true,
  },
  "workflows.approve_workflow_job": {
    severity: "high",
    category: "workflow-security",
    alert: true,
  },
  "workflows.pin_workflow": { severity: "medium", category: "workflow-security", alert: true },
  "workflows.unpin_workflow": { severity: "medium", category: "workflow-security", alert: true },
  "public_key.create": { severity: "high", category: "deploy-key-change", alert: true },
  "public_key.delete": { severity: "high", category: "deploy-key-change", alert: true },
  "public_key.update": { severity: "high", category: "deploy-key-change", alert: true },
  "public_key.unverify": { severity: "high", category: "deploy-key-change", alert: true },
  "public_key.unverification_failure": {
    severity: "high",
    category: "deploy-key-change",
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
const ALLOWED_NEXT_QUERY_KEYS = new Set([
  "after",
  "before",
  "include",
  "order",
  "page",
  "per_page",
  "phrase",
]);
const HMAC_SIGNATURE = /^sha256=([a-f0-9]{64})$/iu;

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
  if (
    sensitive &&
    (SENSITIVE_VALUE.test(normalized) ||
      EMAIL_VALUE.test(normalized) ||
      IPV4_VALUE.test(normalized))
  ) {
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
  if (event?.actor_is_agent === true) return "Agent";
  if (event?.actor_is_bot === true) return "Bot";
  if (
    event?.oauth_application_id ||
    /github\s*app|oauth\s*application|integration/iu.test(event?.programmatic_access_type ?? "")
  ) {
    return "App";
  }
  const actor = event?.actor;
  if (actor && typeof actor === "object") {
    const actorType = firstString(actor.type, actor.actor_type);
    if (actorType && /integration|app/iu.test(actorType)) return "App";
    if (actorType && /agent/iu.test(actorType)) return "Agent";
    if (actorType && /bot/iu.test(actorType)) return "Bot";
    if (actorType && /user/iu.test(actorType)) return "User";
    return actorType;
  }
  const actorType = firstString(event?.actor_type, event?.user_type, event?.actorType);
  if (actorType && /integration|app/iu.test(actorType)) return "App";
  if (actorType && /agent/iu.test(actorType)) return "Agent";
  if (actorType && /bot/iu.test(actorType)) return "Bot";
  if (actorType && /user/iu.test(actorType)) return "User";
  if (event?.actor_is_bot === false && event?.actor_is_agent === false) return "User";
  return actorType;
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

function readRef(event) {
  const action = safeString(event?.action, { sensitive: false }) ?? "";
  if (action.startsWith("protected_branch.")) {
    return firstString(event?.name, event?.branch, event?.ref);
  }
  return firstString(event?.ref, event?.branch, event?.tag);
}

function readRulesetName(event) {
  const action = safeString(event?.action, { sensitive: false }) ?? "";
  return action.startsWith("repository_ruleset.")
    ? firstString(event?.ruleset_name, event?.name)
    : undefined;
}

function readRequestId(event) {
  return firstString(event?.request_id, event?.requestId, event?.event_id, event?.document_id);
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

function buildAlertKey(event) {
  return createHash("sha256")
    .update(
      [
        event.action,
        event.actorType,
        event.actor,
        event.organization,
        event.repository,
        event.ref,
        event.rulesetName ?? "",
        event.requestId ?? "",
        event.createdAt ?? "[unknown-time]",
      ].join("\u001f"),
    )
    .digest("hex");
}

function hasRefMetadata(event) {
  return Boolean(
    readRef(event) ||
      readSha(event?.old_sha, event?.old_oid, event?.old_commit, event?.old_commit_id) ||
      readSha(event?.new_sha, event?.new_oid, event?.new_commit, event?.new_commit_id),
  );
}

export function classifyAuditEvent(event) {
  const action = safeString(event?.action, { sensitive: false });
  if (action === "git.push") {
    if (isDeletedRef(event)) return { severity: "high", category: "ref-deletion", alert: true };
    if (isForcedPush(event)) return { severity: "high", category: "ref-rewrite", alert: true };
    if (!hasRefMetadata(event)) {
      return { severity: "medium", category: "metadata-insufficient", alert: true };
    }
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
    metadataStatus:
      classification.category === "metadata-insufficient" ? "insufficient" : "complete",
    newSha: readSha(event?.new_sha, event?.new_oid, event?.new_commit, event?.new_commit_id),
    oldSha: readSha(event?.old_sha, event?.old_oid, event?.old_commit, event?.old_commit_id),
    organization: readOrganization(event) ?? "[unknown]",
    ref: readRef(event) ?? "[unknown]",
    requestId: readRequestId(event),
    repository: readRepository(event) ?? "[unknown]",
    severity: classification.severity,
    source: firstString(event?.source, event?.source_name, event?.origin) ?? "github-audit-log",
  };

  const sanitized = Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== undefined),
  );
  const rulesetName = readRulesetName(event);
  if (rulesetName) sanitized.rulesetName = rulesetName;
  sanitized.alertKey = buildAlertKey(sanitized);
  return sanitized;
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

function parseCorrelationOption(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new AuditMonitorError("invalid_correlation_limit");
  }
  return parsed;
}

export function correlateAuditEvents(events, options = {}) {
  const windowMinutes = parseCorrelationOption(
    options.windowMinutes,
    DEFAULT_CORRELATION_WINDOW_MINUTES,
    24 * 60,
  );
  const maxEvents = parseCorrelationOption(
    options.maxEvents,
    MAX_CORRELATION_EVENTS,
    MAX_CORRELATION_EVENTS,
  );
  const maxGroups = parseCorrelationOption(
    options.maxGroups,
    MAX_CORRELATION_GROUPS,
    MAX_CORRELATION_GROUPS,
  );
  const normalizedEvents = (Array.isArray(events) ? events : [])
    .map(normalizeAuditEvent)
    .filter(
      (event) =>
        event.createdAt &&
        event.actor !== "[unknown]" &&
        event.repository !== "[unknown]" &&
        (event.ref !== "[unknown]" || event.requestId),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-maxEvents);
  const groups = [];

  for (const event of normalizedEvents) {
    const key = [
      event.actorType,
      event.actor,
      event.repository,
      event.ref,
      event.requestId ?? "",
    ].join("|");
    const timestamp = Date.parse(event.createdAt);
    const group = groups.find(
      (candidate) =>
        candidate.key === key &&
        timestamp - Date.parse(candidate.firstAt) <= windowMinutes * 60_000,
    );
    if (group) {
      group.lastAt = event.createdAt;
      group.eventCount += 1;
      group.actions.add(event.action);
      continue;
    }
    if (groups.length >= maxGroups) continue;
    groups.push({
      key,
      actor: event.actor,
      actorType: event.actorType,
      organization: event.organization,
      repository: event.repository,
      ref: event.ref,
      ...(event.requestId ? { requestId: event.requestId } : {}),
      firstAt: event.createdAt,
      lastAt: event.createdAt,
      eventCount: 1,
      actions: new Set([event.action]),
    });
  }

  return groups.map(({ key, actions, ...group }) => ({
    ...group,
    actions: [...actions].sort(),
  }));
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

function validateIsoSince(value) {
  if (value === undefined) return undefined;
  const normalized = toIsoTimestamp(value);
  if (!normalized || !/T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(String(value))) {
    throw new AuditMonitorError("invalid_since");
  }
  return String(value);
}

function validateCursor(value) {
  if (value === undefined) return undefined;
  const normalized = safeString(value, { sensitive: false, maxLength: 512 });
  if (!normalized || /[\r\n]/u.test(normalized)) throw new AuditMonitorError("invalid_cursor");
  return normalized;
}

function resolveBaseUrl(baseUrl, allowCustomBaseUrl = false) {
  let parsed;
  try {
    parsed = new URL(baseUrl ?? API_URL);
  } catch {
    throw new AuditMonitorError("invalid_base_url");
  }
  if (parsed.protocol !== "https:") throw new AuditMonitorError("invalid_base_url");
  if (parsed.hostname !== "api.github.com" && !allowCustomBaseUrl) {
    throw new AuditMonitorError("invalid_base_url");
  }
  return parsed.origin;
}

function buildAuditUrl(organization, { since, cursor, baseUrl } = {}) {
  const url = new URL(`/orgs/${encodeURIComponent(organization)}/audit-log`, baseUrl ?? API_URL);
  url.searchParams.set("per_page", String(MAX_EVENTS_PER_PAGE));
  url.searchParams.set("include", "all");
  if (since) url.searchParams.set("phrase", `created:>=${since}`);
  if (cursor) url.searchParams.set("after", cursor);
  return url;
}

function validateNextPage(link, organization, baseUrl, since) {
  let next;
  try {
    next = new URL(link, baseUrl);
  } catch {
    throw new AuditMonitorError("invalid_next_link");
  }
  const expectedPath = `/orgs/${encodeURIComponent(organization)}/audit-log`;
  if (
    next.protocol !== "https:" ||
    next.origin !== baseUrl ||
    next.pathname !== expectedPath ||
    next.username ||
    next.password
  ) {
    throw new AuditMonitorError("invalid_next_link");
  }
  for (const [key, value] of next.searchParams) {
    if (
      !ALLOWED_NEXT_QUERY_KEYS.has(key) ||
      next.searchParams.getAll(key).length !== 1 ||
      /[\r\n]/u.test(value) ||
      SENSITIVE_VALUE.test(`${key}=${value}`)
    ) {
      throw new AuditMonitorError("invalid_next_link");
    }
  }
  if (next.searchParams.get("include") !== "all") throw new AuditMonitorError("invalid_next_link");
  const expectedPhrase = since ? `created:>=${since}` : null;
  if (next.searchParams.get("phrase") !== expectedPhrase)
    throw new AuditMonitorError("invalid_next_link");
  return next;
}

async function collectAuditEvents({
  organization,
  token,
  since,
  cursor,
  pageLimit = DEFAULT_PAGE_LIMIT,
  baseUrl,
  allowCustomBaseUrl = false,
}) {
  if (!organization || typeof organization !== "string" || !organization.trim()) {
    throw new AuditMonitorError("missing_organization");
  }
  if (!token || typeof token !== "string") throw new AuditMonitorError("missing_token");

  const limit = positiveInteger(pageLimit, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
  const normalizedSince = validateIsoSince(since);
  const normalizedCursor = validateCursor(cursor);
  const resolvedBaseUrl = resolveBaseUrl(baseUrl, allowCustomBaseUrl);
  const events = [];
  let url = buildAuditUrl(organization.trim(), {
    since: normalizedSince,
    cursor: normalizedCursor,
    baseUrl: resolvedBaseUrl,
  });
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
    const nextLink = nextPageFromLink(response.headers?.get?.("link"));
    url = nextLink
      ? validateNextPage(nextLink, organization.trim(), resolvedBaseUrl, normalizedSince)
      : undefined;
    hasNextPage = Boolean(url);
  }

  if (hasNextPage) throw new AuditMonitorError("pagination_limit");
  return { events, pages, cursor: normalizedCursor, paginationLimitReached: false };
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
  const correlations = correlateAuditEvents(rawEvents, options.correlation);
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
  } else if (normalizedEvents.some((event) => event.metadataStatus === "insufficient")) {
    error = { code: "metadata_insufficient", message: "audit event metadata is insufficient" };
  } else if (lagMinutes !== null && lagMinutes > lagThresholdMinutes) {
    error = { code: "audit_lag", message: "audit collection lag exceeds threshold" };
  }

  const summary = {
    totalEvents: rawEvents.length,
    totalAlerts: alerts.length,
    high: alerts.filter((alert) => alert.severity === "high").length,
    medium: alerts.filter((alert) => alert.severity === "medium").length,
    low: alerts.filter((alert) => alert.severity === "low").length,
    metadataInsufficient: normalizedEvents.filter(
      (event) => event.metadataStatus === "insufficient",
    ).length,
    health: error ? "failed" : "ok",
  };
  const blockingAlerts = alerts.some(
    (alert) => alert.severity === "high" || alert.severity === "medium",
  );
  const collection = {
    startedAt,
    completedAt,
    pages: Number.isInteger(options.pages) && options.pages >= 0 ? options.pages : 0,
    events: rawEvents.length,
    latestEventAt: latestEventAt ?? null,
    lagMinutes,
    ...(options.source ? { source: safeString(options.source, { sensitive: false }) } : {}),
    ...(options.cursor ? { cursor: validateCursor(options.cursor) } : {}),
  };

  return {
    ok: !error && !blockingAlerts,
    generatedAt: completedAt,
    collection,
    alerts,
    correlations,
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
  return "usage: node scripts/github-audit-monitor.mjs --org <organization> --report <path> [--since <ISO>] [--cursor <opaque>] [--page-limit <n>] [--fail-on-alert] [--input <json> --input-signature <sha256=...>]";
}

function parseInputMaxAge(value) {
  if (value === undefined) return DEFAULT_INPUT_MAX_AGE_MINUTES;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 60)
    throw new AuditMonitorError("invalid_input_max_age");
  return parsed;
}

function verifyInputSignature(bytes, signature, secret) {
  if (!signature) throw new AuditMonitorError("input_signature_required");
  if (!secret || typeof secret !== "string")
    throw new AuditMonitorError("input_signature_secret_missing");
  const match = HMAC_SIGNATURE.exec(signature);
  if (!match) throw new AuditMonitorError("input_signature_invalid");
  const actual = Buffer.from(match[1].toLowerCase(), "hex");
  const expected = createHmac("sha256", secret).update(bytes).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AuditMonitorError("input_signature_invalid");
  }
}

async function readInput(filePath, { signature, secret, now, maxAgeMinutes } = {}) {
  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch {
    throw new AuditMonitorError("input_malformed_json");
  }
  if (bytes.byteLength > MAX_INPUT_BYTES) throw new AuditMonitorError("input_too_large");
  verifyInputSignature(bytes, signature, secret);

  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new AuditMonitorError("input_malformed_json");
    }
    const source = safeString(parsed.source, { sensitive: false });
    if (!source || !new Set(["normalized-webhook", "audit-stream"]).has(source)) {
      throw new AuditMonitorError("input_source_not_allowed");
    }
    const issuedAt = toIsoTimestamp(parsed.issuedAt ?? parsed.issued_at);
    const nonce = safeString(parsed.nonce, { sensitive: false, maxLength: 128 });
    if (!issuedAt || !nonce || /[\r\n]/u.test(nonce))
      throw new AuditMonitorError("input_envelope_invalid");
    const ageMs = Date.parse(safeNow(now)) - Date.parse(issuedAt);
    if (ageMs < 0 || ageMs > parseInputMaxAge(maxAgeMinutes) * 60_000) {
      throw new AuditMonitorError("input_replay_window");
    }
    const events = parsed.events;
    if (!Array.isArray(events)) throw new AuditMonitorError("input_malformed_json");
    if (events.length > MAX_INPUT_EVENTS) throw new AuditMonitorError("input_too_many_events");
    if (events.some((event) => !event || typeof event !== "object" || Array.isArray(event))) {
      throw new AuditMonitorError("input_malformed_event");
    }
    return {
      events,
      source,
      ...(parsed.cursor !== undefined ? { cursor: validateCursor(parsed.cursor) } : {}),
    };
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
  const cursor = argumentValue(args, "--cursor");
  const pageLimit = argumentValue(args, "--page-limit");
  const now = argumentValue(args, "--now");
  const lagThresholdMinutes = argumentValue(args, "--lag-threshold");
  const inputSignature = argumentValue(args, "--input-signature");
  const inputMaxAge = argumentValue(args, "--input-max-age");

  if (
    !reportPath ||
    (hasArgument(args, "--input") && !inputPath) ||
    (!inputPath && !organization)
  ) {
    process.stderr.write(`${usage()}\n`);
    return 2;
  }

  let report;
  try {
    if (inputPath) {
      const input = await readInput(inputPath, {
        signature: inputSignature,
        secret: environment.GITHUB_AUDIT_INGEST_HMAC_SECRET,
        now,
        maxAgeMinutes: inputMaxAge,
      });
      report = buildAuditReport(input.events, {
        now,
        lagThresholdMinutes,
        pages: 1,
        source: input.source,
        cursor: input.cursor,
      });
    } else {
      const startedAt = safeNow(now);
      const result = await collectAuditEvents({
        organization,
        token: environment.GITHUB_AUDIT_LOG_TOKEN,
        since,
        cursor,
        pageLimit,
      });
      report = buildAuditReport(result.events, {
        now,
        lagThresholdMinutes,
        startedAt,
        completedAt: safeNow(now),
        pages: result.pages,
        cursor: result.cursor,
        paginationLimitReached: result.paginationLimitReached,
      });
    }
  } catch (error) {
    const safeError =
      error instanceof AuditMonitorError ? error : new AuditMonitorError("collection_failed");
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
      correlations: [],
      summary: {
        totalEvents: 0,
        totalAlerts: 0,
        high: 0,
        medium: 0,
        low: 0,
        metadataInsufficient: 0,
        health: "failed",
      },
      error: { code: safeError.code, message: safeError.message },
    };
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (report.error || (hasArgument(args, "--fail-on-alert") && !report.ok)) return 1;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
