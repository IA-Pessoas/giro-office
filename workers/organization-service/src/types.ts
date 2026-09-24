import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export type OrganizationStatus = "trial" | "past_due" | "active" | "suspended" | "cancelled";
export type SubscriptionPlan = "trial" | "pro" | "enterprise";

export interface OrganizationWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUDIT_SERVICE?: ServiceBinding;
  USER_SERVICE?: ServiceBinding;
  ORGANIZATION_DOMAIN_AUDIT_ENABLED?: string;
  ENABLE_API_DOCS?: string;
  NODE_ENV?: string;
  SERVICE_ALLOWED_ORIGINS?: string;
}

export interface OrganizationPrismaClient {
  organization: {
    findFirst(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
    count(args: Record<string, unknown>): Promise<number>;
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  platformAuthSession: {
    findFirst(args: Record<string, unknown>): Promise<PlatformSessionRecord | null>;
  };
  $disconnect(): Promise<void>;
}

export interface PlatformSessionRecord {
  csrf_hash: string;
  platformUser: {
    id: string;
    name: string;
    email: string;
    platform_role: string;
    status: string;
    session_version: number;
  } | null;
}

export type OrganizationPrismaConstructor = new (options: {
  adapter: unknown;
}) => OrganizationPrismaClient;

export interface OrganizationAuditEvent {
  actorPlatformUserId: string;
  organizationId: string;
  action:
    | "organization.created"
    | "organization.status.updated"
    | "organization.subscription_plan.updated"
    | "organization.logo_url.updated";
  changes: Record<string, { from: unknown; to: unknown }>;
}

export type OrganizationAuditRecorder = (event: OrganizationAuditEvent) => Promise<void>;
