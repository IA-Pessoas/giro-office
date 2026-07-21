export interface User {
  id: string;
  name: string;
}

export interface ChatParticipant {
  user: User;
  unreadCount: number;
}

export interface Message {
  id: string;
  content: string;
  fileUrl: string;
  type: 'TEXT' | 'IMAGE' | 'AUDIO' | 'DELETED';
  createdAt: string;
  chat_id: string;
  sender_id: string;
  sender: User;
  chat?: Chat;
  isEdited?: boolean;
}

export interface Chat {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name?: string;
  participants: ChatParticipant[];
  messages: Message[];
  myUnreadCount?: number;
  firstUnreadMessageId?: string | null;
}

export interface ChatContextType {
  chats: Chat[];
  selectedChat: Chat | null;
  messages: Message[];
  selectChat: (chat: Chat | null, targetMessageId?: string) => void;
  highlightedMessageId: string | null;
  sendMessage: (payload: { content: string; fileUrl?: string; type?: 'TEXT' | 'IMAGE' | 'AUDIO' }) => void;
  searchMessages: (query: string) => Promise<void>;
  searchResults: Message[];
  clearSearch: () => void;
  isSearching: boolean;
  fetchMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  isLoadingMore: boolean;
  onlineUserIds: Set<string>;
  firstUnreadId: string | null;
  createDirectChat: (partnerId: string) => Promise<void>;
  fetchAllUsers: () => Promise<User[]>;
  createGroupChat: (name: string, memberIds: string[]) => Promise<void>;
  scrollToBottomTrigger: number;
  totalUnreadCount: number;
  uploadFileAndSendMessage: (file: File) => Promise<void>;
  isUploading: boolean;
  getSignedMediaUrl: (filePath: string) => Promise<string | null>;
  editingMessage: Message | null;
  startEditingMessage: (message: Message) => void;
  cancelEditingMessage: () => void;
  editMessage: (messageId: string, newContent: string) => void;
  deleteMessage: (messageId: string) => void;
  updateGroupDetails: (chatId: string, data: { name?: string, photo?: File }) => Promise<void>;
  addMembersToGroup: (chatId: string, userIdsToAdd: string[]) => Promise<void>;
  removeMemberFromGroup: (chatId: string, userIdToRemove: string) => Promise<void>;
  updateMemberRole: (chatId: string, targetUserId: string, role: 'ADMIN' | 'MEMBER') => Promise<void>;
}

export interface CreateDirectChatData {
  partnerId: string;
}

export interface CreateGroupChatData {
  name: string;
  memberIds: string[];
}

export interface UpdateGroupDetailsData {
  name?: string;
  photo?: File;
}
