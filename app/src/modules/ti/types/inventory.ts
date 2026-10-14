import type { TiId, TiStatus } from "./common";

export interface TiInventoryRelatedUser {
  id: TiId;
  name?: string | null;
  full_name?: string | null;
  department_id?: TiId | null;
  organization_id?: TiId | null;
  [key: string]: unknown;
}

export interface TiInventoryAsset {
  id: TiId;
  asset_code?: string | null;
  user_id?: TiId | null;
  user?: TiInventoryRelatedUser | null;
  responsible_it_staff_id?: TiId | null;
  responsible_it_staff?: TiInventoryRelatedUser | null;
  delivery_date?: string | null;
  return_date?: string | null;
  name?: string;
  description?: string | null;
  code?: string | null;
  patrimony_code?: string | null;
  serial_number?: string | null;
  category_id?: TiId | null;
  category?: TiInventoryCategory | null;
  location_id?: TiId | null;
  location?: TiInventoryLocation | null;
  assigned_user_id?: TiId | null;
  assigned_to_user_id?: TiId | null;
  assigned_user_name?: string | null;
  assigned_to_user_name?: string | null;
  brand?: string | null;
  model?: string | null;
  notes?: string | null;
  status?: TiStatus;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiInventoryCategory {
  id: TiId;
  name?: string;
  tag?: string | null;
  description?: string | null;
  active?: boolean | null;
  status?: TiStatus | boolean;
  is_active?: boolean | null;
  [key: string]: unknown;
}

export interface TiInventoryLocation {
  id: TiId;
  name?: string;
  active?: boolean;
  description?: string | null;
  status?: TiStatus | boolean;
  is_active?: boolean | null;
  [key: string]: unknown;
}

export interface TiInventoryPayload {
  asset_code?: string;
  category_id?: TiId | "";
  location_id?: TiId | "";
  user_id?: TiId | "";
  responsible_it_staff_id?: TiId | "";
  notes?: string;
  delivery_date?: string;
  [key: string]: unknown;
}

export interface TiInventoryAssignUserPayload {
  user_id?: TiId | "";
  delivery_date?: string;
  [key: string]: unknown;
}

export interface TiInventoryReturnPayload {
  notes?: string;
  return_date?: string;
  [key: string]: unknown;
}

/** Destino da transferência: uma pessoa ou um local, nunca os dois. */
export type TiInventoryTransferPayload = { user_id: TiId } | { location_id: TiId };

/** Lote: vários ativos para o mesmo usuário ou departamento, todos ou nenhum. */
export type TiInventoryTransferBatchPayload = { asset_ids: TiId[] } & TiInventoryTransferPayload;

/** Troca: cada ativo passa para quem está com o outro. */
export interface TiInventorySwapPayload {
  asset_id: TiId;
  other_asset_id: TiId;
}

export type TiInventoryEventAction = "assign" | "return" | "transfer" | "swap";

interface TiInventoryEventParty {
  id: TiId;
  name?: string | null;
  full_name?: string | null;
}

/** Evento do histórico patrimonial de um ativo. */
export interface TiInventoryEvent {
  id: TiId;
  inventory_id: TiId;
  action: TiInventoryEventAction | string;
  created_at: string;
  actor?: TiInventoryEventParty | null;
  from_user?: TiInventoryEventParty | null;
  to_user?: TiInventoryEventParty | null;
  from_location?: TiInventoryEventParty | null;
  to_location?: TiInventoryEventParty | null;
}

/** Equipamento do mapa: os dados vêm das observações do item, quando seguem o padrão. */
export interface TiInventoryEquipmentMapItem {
  id: TiId;
  asset_code: string;
  category: string | null;
  /** Computador ou notebook: é onde os periféricos se ligam. */
  is_host: boolean;
  brand: string | null;
  inputs: string[];
  outputs: string[];
  configuration: string[];
}

export interface TiInventoryEquipmentMapConnection {
  host_id: TiId;
  equipment_id: TiId;
  ports: string[];
}

/** Mapa somente leitura dos equipamentos ativos de um usuário, derivado do inventário. */
export interface TiInventoryEquipmentMap {
  user?: TiInventoryRelatedUser | null;
  equipment: TiInventoryEquipmentMapItem[];
  connections: TiInventoryEquipmentMapConnection[];
}

export interface TiInventoryCategoryPayload {
  name?: string;
  tag?: string;
  active?: boolean;
}

export interface TiInventoryLocationPayload {
  name?: string;
  active?: boolean;
  description?: string;
  status?: string | boolean;
  is_active?: boolean;
  [key: string]: unknown;
}
