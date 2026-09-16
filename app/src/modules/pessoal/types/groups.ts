export const PESSOAL_GROUP_POLICIES = ["NORMAL", "NO_OBLIGATIONS"] as const;
export type PessoalGroupPolicy = (typeof PESSOAL_GROUP_POLICIES)[number];

export interface PessoalGroup {
  id: string;
  name: string;
  policy: PessoalGroupPolicy;
  system_key: string | null;
  archived_at: string | null;
}

export interface PessoalGroupPayload {
  name: string;
  policy: PessoalGroupPolicy;
}
