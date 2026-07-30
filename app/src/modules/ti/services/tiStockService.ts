import {
  DEFAULT_PAGE_SIZE,
  normalizePaginatedResult,
  type PaginatedResult,
} from "@shared/pagination/pagination";
import { api } from "@shared/services/apiClient";

import type {
  TiEnvelope,
  TiId,
  TiListFilters,
  TiStockCategory,
  TiStockCategoryCreatePayload,
  TiStockCategoryUpdatePayload,
  TiStockEntryPayload,
  TiStockExitPayload,
  TiStockItem,
  TiStockItemCreatePayload,
  TiStockItemUpdatePayload,
  TiStockLocation,
  TiStockLocationCreatePayload,
  TiStockLocationUpdatePayload,
  TiStockMovement,
} from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiStockService = {
  async listStockItems(filters?: TiListFilters): Promise<PaginatedResult<TiStockItem>> {
    const response = await api.get<TiEnvelope<TiStockItem[] | PaginatedResult<TiStockItem>>>(
      TI_ENDPOINTS.stockItems.list,
      {
        params: buildTiListParams(filters),
      },
    );
    const fallback = {
      page: Number(filters?.page ?? 1),
      limit: Number(filters?.page_size ?? DEFAULT_PAGE_SIZE),
    };

    return normalizePaginatedResult(
      unwrapTiEnvelope<TiStockItem[] | PaginatedResult<TiStockItem>>(response.data),
      fallback,
    );
  },

  async createStockItem(payload: TiStockItemCreatePayload): Promise<TiStockItem> {
    const response = await api.post<TiEnvelope<TiStockItem>>(TI_ENDPOINTS.stockItems.base, payload);

    return unwrapTiEnvelope<TiStockItem>(response.data);
  },

  async getStockItemById(id: TiId): Promise<TiStockItem> {
    const response = await api.get<TiEnvelope<TiStockItem>>(
      buildTiPath(TI_ENDPOINTS.stockItems.detail, id),
    );

    return unwrapTiEnvelope<TiStockItem>(response.data);
  },

  async updateStockItem(id: TiId, payload: TiStockItemUpdatePayload): Promise<TiStockItem> {
    const response = await api.patch<TiEnvelope<TiStockItem>>(
      buildTiPath(TI_ENDPOINTS.stockItems.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiStockItem>(response.data);
  },

  async createStockEntry(id: TiId, payload: TiStockEntryPayload): Promise<TiStockItem> {
    const response = await api.post<TiEnvelope<TiStockItem>>(
      buildTiPath(TI_ENDPOINTS.stockItems.entries, id),
      payload,
    );

    return unwrapTiEnvelope<TiStockItem>(response.data);
  },

  async createStockExit(id: TiId, payload: TiStockExitPayload): Promise<TiStockItem> {
    const response = await api.post<TiEnvelope<TiStockItem>>(
      buildTiPath(TI_ENDPOINTS.stockItems.exits, id),
      payload,
    );

    return unwrapTiEnvelope<TiStockItem>(response.data);
  },

  async listStockItemMovements(id: TiId): Promise<TiStockMovement[]> {
    const response = await api.get<TiEnvelope<TiStockMovement[]>>(
      buildTiPath(TI_ENDPOINTS.stockItems.movements, id),
    );

    return unwrapTiList<TiStockMovement>(response.data);
  },

  async listStockCategories(filters?: TiListFilters): Promise<TiStockCategory[]> {
    const response = await api.get(TI_ENDPOINTS.stockCategories.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiStockCategory>(response.data);
  },

  async createStockCategory(payload: TiStockCategoryCreatePayload): Promise<TiStockCategory> {
    const response = await api.post<TiEnvelope<TiStockCategory>>(
      TI_ENDPOINTS.stockCategories.base,
      payload,
    );

    return unwrapTiEnvelope<TiStockCategory>(response.data);
  },

  async updateStockCategory(
    id: TiId,
    payload: TiStockCategoryUpdatePayload,
  ): Promise<TiStockCategory> {
    const response = await api.patch<TiEnvelope<TiStockCategory>>(
      buildTiPath(TI_ENDPOINTS.stockCategories.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiStockCategory>(response.data);
  },

  async listStockLocations(filters?: TiListFilters): Promise<TiStockLocation[]> {
    const response = await api.get(TI_ENDPOINTS.stockLocations.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiStockLocation>(response.data);
  },

  async createStockLocation(payload: TiStockLocationCreatePayload): Promise<TiStockLocation> {
    const response = await api.post<TiEnvelope<TiStockLocation>>(
      TI_ENDPOINTS.stockLocations.base,
      payload,
    );

    return unwrapTiEnvelope<TiStockLocation>(response.data);
  },

  async updateStockLocation(
    id: TiId,
    payload: TiStockLocationUpdatePayload,
  ): Promise<TiStockLocation> {
    const response = await api.patch<TiEnvelope<TiStockLocation>>(
      buildTiPath(TI_ENDPOINTS.stockLocations.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiStockLocation>(response.data);
  },
};
