export const PESSOAL_GROUP_POLICIES = ["NORMAL", "NO_OBLIGATIONS"] as const;
export type PessoalGroupPolicy = (typeof PESSOAL_GROUP_POLICIES)[number];

export const NORMAL_GROUP_POLICY: PessoalGroupPolicy = "NORMAL";
export const NO_OBLIGATIONS_GROUP_POLICY: PessoalGroupPolicy = "NO_OBLIGATIONS";
