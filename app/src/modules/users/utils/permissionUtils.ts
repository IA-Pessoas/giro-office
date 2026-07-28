import {
  KNOWN_PERMISSION_MODULE_KEYS,
  RETIRED_PERMISSION_MODULE_KEYS,
  normalizePermissionForModule,
} from "../constants/permissionConfig";
import type {
  KnownPermissionModuleKey,
  KnownPermissionRecord,
  PermissionDraft,
  PermissionNormalizationResult,
  UserItem,
} from "../types";

const PERMISSION_METADATA_KEYS = new Set(["id", "user_id", "organization_id"]);
const RETIRED_PERMISSION_MODULE_KEY_SET = new Set<string>(RETIRED_PERMISSION_MODULE_KEYS);

function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV === "development";
}

function warnPermissionInDev(message: string, meta?: unknown): void {
  if (!isDevelopmentEnvironment()) {
    return;
  }

  if (meta === undefined) {
    console.warn(message);
    return;
  }

  console.warn(message, meta);
}

function isKnownPermissionModuleKey(key: string): key is KnownPermissionModuleKey {
  return KNOWN_PERMISSION_MODULE_KEYS.includes(key as KnownPermissionModuleKey);
}

function isRetiredPermissionModuleKey(key: string): boolean {
  return RETIRED_PERMISSION_MODULE_KEY_SET.has(key);
}

function normalizePermissionValue(value: unknown): number {
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return value;
  }

  return 0;
}

function createEmptyKnownPermissionRecord(): KnownPermissionRecord {
  return KNOWN_PERMISSION_MODULE_KEYS.reduce<KnownPermissionRecord>((acc, moduleKey) => {
    acc[moduleKey] = normalizePermissionForModule(moduleKey, undefined);
    return acc;
  }, {} as KnownPermissionRecord);
}

export function isOwnerUser(user: Pick<UserItem, "type"> | null | undefined): boolean {
  return user?.type === "owner";
}

export function normalizePermissionResponse(raw: Record<string, unknown>): PermissionNormalizationResult {
  const known = createEmptyKnownPermissionRecord();
  const extras: PermissionDraft = {};
  const missingKnownKeys: KnownPermissionModuleKey[] = [];
  const invalidExtraKeys: string[] = [];

  for (const moduleKey of KNOWN_PERMISSION_MODULE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, moduleKey)) {
      missingKnownKeys.push(moduleKey);
      warnPermissionInDev("Known permission module missing from backend response.", { moduleKey });
      continue;
    }

    known[moduleKey] = normalizePermissionForModule(
      moduleKey,
      normalizePermissionValue(raw[moduleKey]),
    );
  }

  for (const [key, value] of Object.entries(raw)) {
    if (isKnownPermissionModuleKey(key)) {
      continue;
    }

    if (PERMISSION_METADATA_KEYS.has(key) || isRetiredPermissionModuleKey(key)) {
      continue;
    }

    warnPermissionInDev("Extra permission module returned by backend.", { moduleKey: key });

    const normalizedValue = normalizePermissionValue(value);
    if (value !== undefined && ![0, 1, 2, 3].includes(value as number)) {
      invalidExtraKeys.push(key);
      warnPermissionInDev("Extra permission module returned invalid value.", {
        moduleKey: key,
        value,
      });
    }

    extras[key] = normalizedValue;
  }

  return {
    known,
    extras,
    missingKnownKeys,
    invalidExtraKeys,
  };
}

export function normalizePermissionDraft(
  draft: PermissionDraft,
  allowedExtraKeys: readonly string[] = [],
): PermissionDraft {
  const normalizedDraft: PermissionDraft = createEmptyKnownPermissionRecord();

  for (const moduleKey of KNOWN_PERMISSION_MODULE_KEYS) {
    normalizedDraft[moduleKey] = normalizePermissionForModule(
      moduleKey,
      normalizePermissionValue(draft[moduleKey]),
    );
  }

  for (const extraKey of allowedExtraKeys) {
    if (!extraKey || isKnownPermissionModuleKey(extraKey) || isRetiredPermissionModuleKey(extraKey)) {
      continue;
    }

    normalizedDraft[extraKey] = normalizePermissionValue(draft[extraKey]);
  }

  return normalizedDraft;
}

export function freezePermissionSnapshot(snapshot: PermissionDraft): Readonly<PermissionDraft> {
  const nextSnapshot = { ...snapshot };

  if (isDevelopmentEnvironment()) {
    return Object.freeze(nextSnapshot);
  }

  return nextSnapshot;
}

export function arePermissionDraftsEqual(left: PermissionDraft, right: PermissionDraft): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const leftKey = leftKeys[index];
    const rightKey = rightKeys[index];

    if (leftKey !== rightKey) {
      return false;
    }

    if (left[leftKey] !== right[rightKey]) {
      return false;
    }
  }

  return true;
}

export function buildPermissionUpdatePayload(
  draft: PermissionDraft,
  extraKeys: readonly string[] = [],
): PermissionDraft {
  const normalizedDraft = normalizePermissionDraft(draft, extraKeys);
  const payload: PermissionDraft = {};

  for (const moduleKey of KNOWN_PERMISSION_MODULE_KEYS) {
    payload[moduleKey] = normalizedDraft[moduleKey] ?? 0;
  }

  if (extraKeys.length > 0) {
    warnPermissionInDev("Including extra permission modules in PUT payload.", {
      extraKeys,
    });
  }

  for (const extraKey of extraKeys) {
    if (!extraKey || isKnownPermissionModuleKey(extraKey) || isRetiredPermissionModuleKey(extraKey)) {
      continue;
    }

    payload[extraKey] = normalizedDraft[extraKey] ?? 0;
  }

  return payload;
}

export function getExtraPermissionLabel(key: string): string {
  const parts = key
    .split(/[_-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return key;
  }

  return parts
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}
