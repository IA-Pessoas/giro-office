export const PESSOAL_GROUP_POLICIES = ["NORMAL", "NO_OBLIGATIONS"] as const;
export type PessoalGroupPolicy = (typeof PESSOAL_GROUP_POLICIES)[number];

export const PESSOAL_GROUP_POLICY_LABELS: Record<PessoalGroupPolicy, string> = {
  NORMAL: "Normal",
  NO_OBLIGATIONS: "Sem obrigações",
};

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
