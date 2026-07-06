import { api } from "@shared/services/apiClient";

import type {
  TiEnvelope,
  TiId,
  TiListFilters,
  TiMutationMessage,
  TiStockCategory,
  TiStockCategoryPayload,
  TiStockItem,
  TiStockItemPayload,
  TiStockLocation,
  TiStockLocationPayload,
  TiStockMovementPayload,
} from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiStockService = {
  async listItems(filters?: TiListFilters): Promise<TiStockItem[]> {
    const response = await api.get(TI_ENDPOINTS.stockItems.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiStockItem>(response.data);
  },

  async createItem(payload: TiStockItemPayload): Promise<TiStockItem> {
    const response = await api.post<TiEnvelope<TiStockItem>>(TI_ENDPOINTS.stockItems.base, payload);

    return unwrapTiEnvelope<TiStockItem>(response.data);
  },

  async getItem(id: TiId): Promise<TiStockItem> {
    const response = await api.get<TiEnvelope<TiStockItem>>(
      buildTiPath(TI_ENDPOINTS.stockItems.detail, id),
    );

    return unwrapTiEnvelope<TiStockItem>(response.data);
  },

  async updateItem(id: TiId, payload: TiStockItemPayload): Promise<TiStockItem> {
    const response = await api.patch<TiEnvelope<TiStockItem>>(
      buildTiPath(TI_ENDPOINTS.stockItems.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiStockItem>(response.data);
  },

  async createEntry(id: TiId, payload: TiStockMovementPayload): Promise<TiMutationMessage> {
    const response = await api.post<TiEnvelope<TiMutationMessage>>(
      buildTiPath(TI_ENDPOINTS.stockItems.entries, id),
      payload,
    );

    return unwrapTiEnvelope<TiMutationMessage>(response.data);
  },

  async createExit(id: TiId, payload: TiStockMovementPayload): Promise<TiMutationMessage> {
    const response = await api.post<TiEnvelope<TiMutationMessage>>(
      buildTiPath(TI_ENDPOINTS.stockItems.exits, id),
      payload,
    );

    return unwrapTiEnvelope<TiMutationMessage>(response.data);
  },

  async listCategories(filters?: TiListFilters): Promise<TiStockCategory[]> {
    const response = await api.get(TI_ENDPOINTS.stockCategories.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiStockCategory>(response.data);
  },

  async createCategory(payload: TiStockCategoryPayload): Promise<TiStockCategory> {
    const response = await api.post<TiEnvelope<TiStockCategory>>(
      TI_ENDPOINTS.stockCategories.base,
      payload,
    );

    return unwrapTiEnvelope<TiStockCategory>(response.data);
  },

  async updateCategory(id: TiId, payload: TiStockCategoryPayload): Promise<TiStockCategory> {
    const response = await api.patch<TiEnvelope<TiStockCategory>>(
      buildTiPath(TI_ENDPOINTS.stockCategories.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiStockCategory>(response.data);
  },

  async listLocations(filters?: TiListFilters): Promise<TiStockLocation[]> {
    const response = await api.get(TI_ENDPOINTS.stockLocations.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiStockLocation>(response.data);
  },

  async createLocation(payload: TiStockLocationPayload): Promise<TiStockLocation> {
    const response = await api.post<TiEnvelope<TiStockLocation>>(
      TI_ENDPOINTS.stockLocations.base,
      payload,
    );

    return unwrapTiEnvelope<TiStockLocation>(response.data);
  },

  async updateLocation(id: TiId, payload: TiStockLocationPayload): Promise<TiStockLocation> {
    const response = await api.patch<TiEnvelope<TiStockLocation>>(
      buildTiPath(TI_ENDPOINTS.stockLocations.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiStockLocation>(response.data);
  },
};
