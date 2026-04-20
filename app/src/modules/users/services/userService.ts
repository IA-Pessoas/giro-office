import { setupAPIClient } from '@shared/services/api';
import type { UserItem, CreateUserData, AdminCreateUserData, UpdateUserData } from '../types';

type UsersListEnvelope = {
  users?: UserItem[];
};

function extractUsersList(payload: unknown): UserItem[] {
  if (Array.isArray(payload)) {
    return payload as UserItem[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const directUsers = (payload as UsersListEnvelope).users;
  if (Array.isArray(directUsers)) {
    return directUsers;
  }

  const nestedData = (payload as { data?: unknown }).data;
  if (Array.isArray(nestedData)) {
    return nestedData as UserItem[];
  }

  if (nestedData && typeof nestedData === 'object') {
    const nestedUsers = (nestedData as UsersListEnvelope).users;
    if (Array.isArray(nestedUsers)) {
      return nestedUsers;
    }
  }

  return [];
}

function extractUser(payload: unknown): UserItem {
  if (payload && typeof payload === 'object') {
    const directUser = (payload as { user?: UserItem }).user;
    if (directUser && typeof directUser === 'object') {
      return directUser;
    }

    const nestedData = (payload as { data?: unknown }).data;
    if (nestedData && typeof nestedData === 'object' && !Array.isArray(nestedData)) {
      const nestedUser = (nestedData as { user?: UserItem }).user;
      if (nestedUser && typeof nestedUser === 'object') {
        return nestedUser;
      }

      return nestedData as UserItem;
    }

    if (!Array.isArray(payload)) {
      return payload as UserItem;
    }
  }

  throw new Error('Unexpected user payload shape.');
}

export const userService = {
  list: async (filters?: { status?: string }): Promise<UserItem[]> => {
    const api = setupAPIClient();
    const response = await api.get('/user', { params: filters });
    return extractUsersList(response.data);
  },

  getById: async (id: string): Promise<UserItem> => {
    const api = setupAPIClient();
    const response = await api.get(`/user/${id}`);
    return extractUser(response.data);
  },

  create: async (data: CreateUserData | AdminCreateUserData): Promise<UserItem> => {
    const api = setupAPIClient();
    const response = await api.post('/user', data);
    return response.data.data ?? response.data?.data ?? response.data;
  },

  update: async (id: string, data: UpdateUserData): Promise<UserItem> => {
    const api = setupAPIClient();
    const payload: Record<string, unknown> = {};

    if (data.name !== undefined) payload.name = data.name;
    if (data.password !== undefined) payload.password = data.password;
    if (data.permission !== undefined) payload.permission = data.permission;
    if (data.department_id !== undefined) payload.department_id = data.department_id;
    if (data.status !== undefined) payload.status = data.status;

    const response = await api.patch(`/user/${id}`, payload);
    return extractUser(response.data);
  },
};

export { extractUser, extractUsersList };
