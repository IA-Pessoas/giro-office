export interface PessoalGroup {
  id: string;
  name: string;
  policy: string | null;
  system_key: string | null;
  archived_at: string | null;
}

export interface PessoalGroupPayload {
  name: string;
}
