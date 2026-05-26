export type ContabilCompetence = `${number}-${number}`;

export interface ContabilControl {
  id: string;
  client_id: string;
  competence: ContabilCompetence;
  notes: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [field: string]: boolean | string | null | undefined;
}

export interface ContabilResponsible {
  id: string;
  client_id: string;
  person_responsible_id: string | null;
  posted_by_id: string | null;
  customer_with_movement: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  [field: string]: string | boolean | null | undefined;
}

export interface ContabilRelationship {
  id: string;
  client_id: string;
  created_at?: string | null;
  updated_at?: string | null;
  [field: string]: string | boolean | number | null | undefined;
}

export interface ContabilControlFilters {
  clientId: string;
  competence: ContabilCompetence;
}

export interface CreateOrGetContabilControlPayload {
  client_id: string;
  competence: ContabilCompetence;
}

export interface PatchContabilControlFieldPayload {
  field: string;
  value: boolean | string | null;
}

export interface CreateContabilResponsiblePayload {
  client_id: string;
  person_responsible_id?: string | null;
  posted_by_id?: string | null;
  customer_with_movement?: boolean | null;
  [field: string]: string | boolean | null | undefined;
}

export interface UpdateContabilResponsiblePayload {
  person_responsible_id?: string | null;
  posted_by_id?: string | null;
  customer_with_movement?: boolean | null;
  [field: string]: string | boolean | null | undefined;
}

export interface DeleteContabilResponsiblePayload {
  id: string;
}

export interface CreateContabilRelationshipPayload {
  client_id: string;
  [field: string]: string | boolean | number | null | undefined;
}

export interface UpdateContabilRelationshipPayload {
  [field: string]: string | boolean | number | null | undefined;
}

export interface DeleteContabilRelationshipPayload {
  id: string;
}
