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

export const userService = {
  list: async (filters?: { status?: string }): Promise<UserItem[]> => {
    const api = setupAPIClient();
    const response = await api.get('/users', { params: filters });
    return extractUsersList(response.data);
  },

  getById: async (id: string): Promise<UserItem> => {
    const api = setupAPIClient();
    const response = await api.get('/users-detail', { params: { user_id: id } });
    return response.data.user;
  },

  create: async (data: CreateUserData | AdminCreateUserData): Promise<UserItem> => {
    const api = setupAPIClient();
    const response = await api.post('/users', data);
    return response.data.data;
  },

  update: async (id: string, data: UpdateUserData): Promise<UserItem> => {
    const api = setupAPIClient();
    const formData = new FormData();
    formData.append('user_id', id);
    
    if (data.name) formData.append('name', data.name);
    if (data.password) formData.append('password', data.password);
    if (data.permission !== undefined) formData.append('permission', String(data.permission));
    if (data.department_id) formData.append('department_id', data.department_id);
    if (data.status) formData.append('status', data.status);
    if (data.file) formData.append('file', data.file);

    const response = await api.put('/users', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

export { extractUsersList };
