import { setupAPIClient } from '@shared/services/api';
import type { Chat, User, CreateDirectChatData, CreateGroupChatData, UpdateGroupDetailsData } from '../types';

export const chatService = {
  fetchContacts: async (): Promise<User[]> => {
    const api = setupAPIClient();
    const response = await api.get('/chat/contacts');
    return response.data;
  },

  createDirectChat: async (data: CreateDirectChatData): Promise<Chat> => {
    const api = setupAPIClient();
    const response = await api.post('/chat/direct', {
      user_id_2: data.partnerId
    });
    return response.data;
  },

  createGroupChat: async (data: CreateGroupChatData): Promise<Chat> => {
    const api = setupAPIClient();
    const response = await api.post('/chat/group', {
      name: data.name,
      member_ids: data.memberIds
    });
    return response.data;
  },

  updateGroupDetails: async (chatId: string, data: UpdateGroupDetailsData): Promise<void> => {
    const api = setupAPIClient();
    const formData = new FormData();
    if (data.name) formData.append('name', data.name);
    if (data.photo) formData.append('photo', data.photo);

    await api.post(`/chat/${chatId}/group`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getSignedMediaUrl: async (filePath: string): Promise<string | null> => {
    const api = setupAPIClient();
    try {
      const response = await api.get('/chat/media/link', {
        params: { filePath }
      });
      return response.data.url;
    } catch (error) {
      console.error('Erro ao obter URL assinada:', error);
      return null;
    }
  },

  addMembersToGroup: async (chatId: string, userIdsToAdd: string[]): Promise<void> => {
    const api = setupAPIClient();
    await api.post(`/chat/${chatId}/participants`, { userIdsToAdd });
  },

  removeMemberFromGroup: async (chatId: string, userIdToRemove: string): Promise<void> => {
    const api = setupAPIClient();
    await api.delete(`/chat/participants`, {
      data: { chat_id: chatId, user_id_to_remove: userIdToRemove }
    });
  },

  updateMemberRole: async (chatId: string, targetUserId: string, role: 'ADMIN' | 'MEMBER'): Promise<void> => {
    const api = setupAPIClient();
    await api.patch(`/chat/${chatId}/participants/${targetUserId}/role`, { role });
  },
};
