export type OrganizationStatus = "trial" | "past_due" | "active" | "suspended" | "cancelled";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
  email_created_by: string;
  cnpj: string;
  subscription_plan: string;
}

export interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  cnpj: string;
  subscription_plan: string;
}

export interface UserOrganization {
  organization_id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  department_id: string | null;
}

export interface OrganizationSession {
  id: string;
  name: string;
  login: string;
  permission: number;
  department_id: string;
  organization_id: string;
  type?: "owner" | "admin" | "user";
  modules: Record<string, number>;
  token: string;
}

/** Payload for POST /organizations (matches organization-service create body). */
export interface OrganizationCreatePayload {
  name: string;
  email_created_by: string;
  cnpj: string;
}

/** Reserved for future fields once API contract is extended. */

export interface UpdateOrganizationData {
  name?: string;
  slug?: string;
  cnpj?: string;
  email_created_by?: string;
  logo_url?: string;
  status?: OrganizationStatus;
  subscription_plan?: string;
}
