export type OrganizationStatus = 'trial' | 'past_due' | 'active' | 'suspended' | 'cancelled';

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

export interface CreateOrganizationData {
  name: string;
  slug: string;
  cnpj: string;
  email_created_by: string;
  logo_url?: string;
  status?: OrganizationStatus;
  subscription_plan?: string;
}

export interface UpdateOrganizationData {
  name?: string;
  slug?: string;
  cnpj?: string;
  email_created_by?: string;
  logo_url?: string;
  status?: OrganizationStatus;
  subscription_plan?: string;
}
