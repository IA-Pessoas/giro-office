import { setupAPIClient } from '@shared/services/api';
import type { UserItem, CreateUserData, AdminCreateUserData, UpdateUserData } from '../types';

type UsersListEnvelope = {
  users?: UserItem[];
  total?: number;
  skip?: number;
  take?: number;
};

export interface UserListFilters {
  skip?: number;
  take?: number;
  status?: string;
}

export interface UsersListPage {
  users: UserItem[];
  total: number | null;
  skip: number | null;
  take: number | null;
}

function extractUsersListPage(payload: unknown): UsersListPage {
  if (Array.isArray(payload)) {
    return {
      users: payload as UserItem[],
      total: payload.length,
      skip: null,
      take: null,
    };
  }

  if (!payload || typeof payload !== 'object') {
    return {
      users: [],
      total: 0,
      skip: null,
      take: null,
    };
  }

  const directPayload = payload as UsersListEnvelope & { data?: unknown };
  const directUsers = Array.isArray(directPayload.users) ? directPayload.users : null;

  if (directUsers) {
    return {
      users: directUsers,
      total: typeof directPayload.total === 'number' ? directPayload.total : null,
      skip: typeof directPayload.skip === 'number' ? directPayload.skip : null,
      take: typeof directPayload.take === 'number' ? directPayload.take : null,
    };
  }

  const nestedData = directPayload.data;
  if (Array.isArray(nestedData)) {
    return {
      users: nestedData as UserItem[],
      total: nestedData.length,
      skip: null,
      take: null,
    };
  }

  if (nestedData && typeof nestedData === 'object') {
    const nestedUsers = (nestedData as UsersListEnvelope).users;
    if (Array.isArray(nestedUsers)) {
      return {
        users: nestedUsers,
        total: typeof (nestedData as UsersListEnvelope).total === 'number' ? (nestedData as UsersListEnvelope).total : null,
        skip: typeof (nestedData as UsersListEnvelope).skip === 'number' ? (nestedData as UsersListEnvelope).skip : null,
        take: typeof (nestedData as UsersListEnvelope).take === 'number' ? (nestedData as UsersListEnvelope).take : null,
      };
    }
  }

  return {
    users: [],
    total: 0,
    skip: null,
    take: null,
  };
}

function extractUsersList(payload: unknown): UserItem[] {
  return extractUsersListPage(payload).users;
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
  list: async (filters?: UserListFilters): Promise<UserItem[]> => {
    const api = setupAPIClient();
    const response = await api.get('/user', { params: filters });
    return extractUsersList(response.data);
  },

  listPage: async (filters?: UserListFilters): Promise<UsersListPage> => {
    const api = setupAPIClient();
    const response = await api.get('/user', { params: filters });
    return extractUsersListPage(response.data);
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
    if (data.permission !== undefined) payload.permission = data.permission;
    if (data.department_id !== undefined) payload.department_id = data.department_id;
    if (data.status !== undefined) payload.status = data.status;
    if (data.modules !== undefined) payload.modules = data.modules;

    const response = await api.put(`/user/${id}`, payload);
    return extractUser(response.data);
  },

  resetPassword: async (id: string, password: string): Promise<void> => {
    const api = setupAPIClient();
    await api.post(`/user/${id}/password-reset`, { password });
  },
};

export { extractUser, extractUsersList, extractUsersListPage };
