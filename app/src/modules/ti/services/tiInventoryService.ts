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
  async list(filters?: TiListFilters): Promise<TiInventoryAsset[]> {
    const response = await api.get(TI_ENDPOINTS.inventory.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiInventoryAsset>(response.data);
  },

  async create(payload: TiInventoryPayload): Promise<TiInventoryAsset> {
    const response = await api.post<TiEnvelope<TiInventoryAsset>>(
      TI_ENDPOINTS.inventory.base,
      payload,
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async getById(id: TiId): Promise<TiInventoryAsset> {
    const response = await api.get<TiEnvelope<TiInventoryAsset>>(
      buildTiPath(TI_ENDPOINTS.inventory.detail, id),
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async update(id: TiId, payload: TiInventoryPayload): Promise<TiInventoryAsset> {
    const response = await api.patch<TiEnvelope<TiInventoryAsset>>(
      buildTiPath(TI_ENDPOINTS.inventory.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async assignUser(id: TiId, payload: TiInventoryAssignUserPayload): Promise<TiInventoryAsset> {
    const response = await api.patch<TiEnvelope<TiInventoryAsset>>(
      buildTiPath(TI_ENDPOINTS.inventory.assignUser, id),
      payload,
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async returnAsset(id: TiId, payload: TiInventoryReturnPayload = {}): Promise<TiInventoryAsset> {
    const response = await api.patch<TiEnvelope<TiInventoryAsset>>(
      buildTiPath(TI_ENDPOINTS.inventory.returnAsset, id),
      payload,
    );

    return unwrapTiEnvelope<TiInventoryAsset>(response.data);
  },

  async listCategories(filters?: TiListFilters): Promise<TiInventoryCategory[]> {
    const response = await api.get(TI_ENDPOINTS.inventoryCategories.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiInventoryCategory>(response.data);
  },

  async createCategory(payload: TiInventoryCategoryPayload): Promise<TiInventoryCategory> {
    const response = await api.post<TiEnvelope<TiInventoryCategory>>(
      TI_ENDPOINTS.inventoryCategories.base,
      payload,
    );

    return unwrapTiEnvelope<TiInventoryCategory>(response.data);
  },

  async updateCategory(
    id: TiId,
    payload: TiInventoryCategoryPayload,
  ): Promise<TiInventoryCategory> {
    const response = await api.patch<TiEnvelope<TiInventoryCategory>>(
      buildTiPath(TI_ENDPOINTS.inventoryCategories.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiInventoryCategory>(response.data);
  },

  async listLocations(filters?: TiListFilters): Promise<TiInventoryLocation[]> {
    const response = await api.get(TI_ENDPOINTS.inventoryLocations.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiInventoryLocation>(response.data);
  },

  async createLocation(payload: TiInventoryLocationPayload): Promise<TiInventoryLocation> {
    const response = await api.post<TiEnvelope<TiInventoryLocation>>(
      TI_ENDPOINTS.inventoryLocations.base,
      payload,
    );

    return unwrapTiEnvelope<TiInventoryLocation>(response.data);
  },

  async updateLocation(
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
