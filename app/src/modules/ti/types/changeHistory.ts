export type TiChangeHistoryItemType =
  | "inventory"
  | "inventory_category"
  | "term"
  | "password"
  | "robot";

export interface TiChangeHistoryItem {
  id: string;
  item_type: TiChangeHistoryItemType;
  item_id: string;
  /** Código patrimonial, quando o item é de inventário e ainda existe. */
  item_label: string | null;
  field: string;
  before: string | null;
  after: string | null;
  /** Valor de credencial: o serviço nunca devolve antes/depois. */
  masked: boolean;
  note: string | null;
  actor: { id: string; name: string; full_name: string | null } | null;
  created_at: string;
}

export interface TiChangeHistoryList {
  items: TiChangeHistoryItem[];
  page: number;
  page_size: number;
  hasMore: boolean;
}
