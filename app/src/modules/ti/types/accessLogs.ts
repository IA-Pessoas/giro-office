export type TiAccessLogType = "login" | "access";

/** Acesso migrado do Workspace antigo (`tb_admin.logs`). */
export interface TiAccessLogItem {
  id: string;
  type: TiAccessLogType;
  referring: string;
  referring_id: string;
  date: string;
  /** Local/origem do acesso; não foi preservado na migração. */
  origin: string | null;
}

export interface TiAccessLogList {
  user: { id: string; name: string; full_name: string | null };
  items: TiAccessLogItem[];
  has_more: boolean;
}
