import { api } from "@shared/services/apiClient";

import type {
  TiEnvelope,
  TiId,
  TiInventoryAsset,
  TiInventoryAssignUserPayload,
  TiInventoryCategory,
  TiInventoryCategoryPayload,
  TiInventoryLocation,
  TiInventoryLocationPayload,
  TiInventoryPayload,
  TiInventoryReturnPayload,
  TiListFilters,
} from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiInventoryService = {
  async listInventory(filters?: TiListFilters): Promise<TiInventoryAsset[]> {
    const response = await api.get(TI_ENDPOINTS.inventory.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiInventoryAsset>(response.data);
  },

  async createInventoryAsset(payload: TiInventoryPayload): Promise<TiInventoryAsset> {
    const response = await api.post<TiEnvelope<TiInventoryAsset>>(
      TI_ENDPOINTS.inventory.base,
      payload,
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async getInventoryAssetById(id: TiId): Promise<TiInventoryAsset> {
    const response = await api.get<TiEnvelope<TiInventoryAsset>>(
      buildTiPath(TI_ENDPOINTS.inventory.detail, id),
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async updateInventoryAsset(id: TiId, payload: TiInventoryPayload): Promise<TiInventoryAsset> {
    const response = await api.patch<TiEnvelope<TiInventoryAsset>>(
      buildTiPath(TI_ENDPOINTS.inventory.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async assignInventoryAssetUser(
    id: TiId,
    payload: TiInventoryAssignUserPayload,
  ): Promise<TiInventoryAsset> {
    const response = await api.patch<TiEnvelope<TiInventoryAsset>>(
      buildTiPath(TI_ENDPOINTS.inventory.assignUser, id),
      payload,
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async returnInventoryAsset(
    id: TiId,
    payload: TiInventoryReturnPayload = {},
  ): Promise<TiInventoryAsset> {
    const response = await api.patch<TiEnvelope<TiInventoryAsset>>(
      buildTiPath(TI_ENDPOINTS.inventory.returnAsset, id),
      payload,
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async listInventoryCategories(filters?: TiListFilters): Promise<TiInventoryCategory[]> {
    const response = await api.get(TI_ENDPOINTS.inventoryCategories.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiInventoryCategory>(response.data);
  },

  async createInventoryCategory(payload: TiInventoryCategoryPayload): Promise<TiInventoryCategory> {
    const response = await api.post<TiEnvelope<TiInventoryCategory>>(
      TI_ENDPOINTS.inventoryCategories.base,
      payload,
    );

    return unwrapTiEnvelope<TiInventoryCategory>(response.data);
  },

  async updateInventoryCategory(
    id: TiId,
    payload: TiInventoryCategoryPayload,
  ): Promise<TiInventoryCategory> {
    const response = await api.patch<TiEnvelope<TiInventoryCategory>>(
      buildTiPath(TI_ENDPOINTS.inventoryCategories.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiInventoryCategory>(response.data);
  },

  async listInventoryLocations(filters?: TiListFilters): Promise<TiInventoryLocation[]> {
    const response = await api.get(TI_ENDPOINTS.inventoryLocations.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiInventoryLocation>(response.data);
  },

  async createInventoryLocation(payload: TiInventoryLocationPayload): Promise<TiInventoryLocation> {
    const response = await api.post<TiEnvelope<TiInventoryLocation>>(
      TI_ENDPOINTS.inventoryLocations.base,
      payload,
    );

    return unwrapTiEnvelope<TiInventoryLocation>(response.data);
  },

  async updateInventoryLocation(
    id: TiId,
    payload: TiInventoryLocationPayload,
  ): Promise<TiInventoryLocation> {
    const response = await api.patch<TiEnvelope<TiInventoryLocation>>(
      buildTiPath(TI_ENDPOINTS.inventoryLocations.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiInventoryLocation>(response.data);
  },
};
