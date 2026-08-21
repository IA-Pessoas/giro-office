import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { api } from '@shared/services/apiClient';
import { chatService } from '../modules/chat/services/chatService';
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';
import type { ChatParticipant, User, Message, Chat } from '../modules/chat/types';

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

export const ChatContext = createContext<ChatContextType | null>(null);

const MESSAGES_PER_PAGE = 30;
const MAX_CHAT_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_CHAT_UPLOAD_MB = MAX_CHAT_UPLOAD_BYTES / (1024 * 1024);
const CHAT_UPLOAD_SIZE_ERROR_MESSAGE = `Arquivo excede o limite de ${MAX_CHAT_UPLOAD_MB} MB.`;

export function ChatProvider({ children }: { children: ReactNode }) {
    const { user, isAuthenticated } = useAuth(); 
    const { socket } = useSocket();

    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [searchResults, setSearchResults] = useState<Message[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalMessages, setTotalMessages] = useState(0);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [onlineUserIds, setOnlineUserIds] = useState(new Set<string>());
    const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
    const [scrollToBottomTrigger, setScrollToBottomTrigger] = useState(0);
    const [totalUnreadCount, setTotalUnreadCount] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);

    const selectedChatRef = useRef(selectedChat);
    const userRef = useRef(user);
    const chatsRef = useRef(chats);
    const messagesRef = useRef(messages);
    const isSearchingRef = useRef(isSearching);
    const currentPageRef = useRef(currentPage);
    const hasMoreMessagesRef = useRef(hasMoreMessages);
    const isFetchingMore = useRef(false);
    const fetchControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        selectedChatRef.current = selectedChat;
    }, [selectedChat]);

    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        chatsRef.current = chats;
    }, [chats]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        isSearchingRef.current = isSearching;
    }, [isSearching]);

    useEffect(() => {
        currentPageRef.current = currentPage;
    }, [currentPage]);

    useEffect(() => {
        hasMoreMessagesRef.current = hasMoreMessages;
    }, [hasMoreMessages]);

    useEffect(() => {
        if (!socket) return;

        const handleUpdateOnlineList = (onlineIds: string[]) => {
            setOnlineUserIds(new Set(onlineIds));
        };
        
        const handleUserOnline = ({ user_id }) => {
            setOnlineUserIds(prev => new Set(prev).add(user_id));
        };

        const handleUserOffline = ({ user_id }) => {
            setOnlineUserIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(user_id);
                return newSet;
            });
        };

        const handleMessageUpdated = (updatedMessage: Message) => {
            setMessages(prev => prev.map(msg => msg.id === updatedMessage.id ? updatedMessage : msg));
        };

        const handleMessageDeleted = ({ chatId, messageId }) => {
            setMessages(prev => prev.map(msg => 
                msg.id === messageId 
                    ? { ...msg, type: 'DELETED', content: 'Mensagem apagada' } 
                    : msg
            ));
        };

        const handleNewMessage = (newMessage: Message) => {
            const currentUser = userRef.current;
            if (!currentUser) return;
            // Se a mensagem é do usuário logado (o "eco"), substitui a temporária
            if (newMessage.sender_id === currentUser.id) {
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id.startsWith('temp_') && msg.content === newMessage.content
                            ? newMessage
                            : msg
                    )
                );
            } else { 
                // Se for de outro usuário, adiciona normalmente
                if (selectedChatRef.current?.id === newMessage.chat_id) {
                    setMessages(prev => [...prev, newMessage]);
                    setScrollToBottomTrigger(prev => prev + 1);
                }
                if (newMessage.sender_id !== currentUser.id) {
                    const targetChat = chatsRef.current.find(c => c.id === newMessage.chat_id);
                    const chatName = targetChat?.type === 'GROUP' ? targetChat.name : newMessage.sender.name;

                    // CHAMA A FUNÇÃO DE NOTIFICAÇÃO
                    showNotification(`Nova mensagem de ${chatName}`, {
                        body: newMessage.content,
                        icon: '/favicon.ico' // Opcional: coloque o caminho para o ícone do seu site
                    });
                }
                setChats(prev => {
                    const targetChat = prev.find(c => c.id === newMessage.chat_id);
                    if (!targetChat) return prev;
                    const updatedChat = {
                        ...targetChat,
                        messages: [newMessage],
                        participants: targetChat.participants.map(p =>
                            p.user.id === currentUser.id ? { ...p, unreadCount: (p.unreadCount || 0) + 1 } : p
                        )
                    };
                    const otherChats = prev.filter(c => c.id !== newMessage.chat_id);
                    return [updatedChat, ...otherChats];
                });
            }
        };

        const handleNewGroup = (newChat: Chat) => setChats(prev => [newChat, ...prev]);
        
        const handleMembersAdded = (payload: { chatId: string, participants: ChatParticipant[] }) => {
            console.log("FRONTEND: Evento 'membersAdded' recebido. Payload:", payload);
            
            // Agora esta verificação passará, pois o payload terá a propriedade 'participants'
            if (!payload || !payload.chatId || !payload.participants) {
                console.error("Payload do evento 'membersAdded' é inválido.");
                return;
            }

            const { chatId, participants } = payload;

            const updateFunc = (chat) => ({ ...chat, participants });

            setChats(prev => prev.map(c => c.id === chatId ? updateFunc(c) : c));
            
            setSelectedChat(prevSelectedChat => 
                prevSelectedChat?.id === chatId ? updateFunc(prevSelectedChat) : prevSelectedChat
            );
        };

        const handleMemberRemoved = ({ chatId, removedUserId }) => {
            console.log(`FRONTEND: Evento 'memberRemoved' recebido para o usuário ${removedUserId}`);
            
            const updateState = (currentChat) => {
                if (!currentChat) return null;
                return { 
                    ...currentChat, 
                    participants: (currentChat.participants || []).filter(p => p.user.id !== removedUserId)
                };
            };
            
            setChats(prevChats => prevChats.map(c => c.id === chatId ? updateState(c) : c));
            setSelectedChat(prevSelectedChat => prevSelectedChat?.id === chatId ? updateState(prevSelectedChat) : prevSelectedChat);
        };

        const handleMemberRoleUpdated = ({ chatId, targetUserId, newRole }) => {
            console.log(`FRONTEND: Evento 'memberRoleUpdated' recebido para o usuário ${targetUserId}`);

            const updateState = (currentChat) => {
                if (!currentChat) return null;
                return {
                    ...currentChat,
                    participants: (currentChat.participants || []).map(p => 
                        p.user.id === targetUserId ? { ...p, role: newRole } : p
                    )
                };
            };

            setChats(prevChats => prevChats.map(c => c.id === chatId ? updateState(c) : c));
            setSelectedChat(prevSelectedChat => prevSelectedChat?.id === chatId ? updateState(prevSelectedChat) : prevSelectedChat);
        };
        const handleChatUpdate = (updatedChat: Chat) => {
            console.log(`FRONTEND: Evento 'chat_updated' recebido para o chat ${updatedChat.id}`);
            
            // Lógica simples: encontra o chat antigo e o substitui pelo novo
            setChats(prevChats => prevChats.map(c => c.id === updatedChat.id ? updatedChat : c));

            // Se o chat atualizado for o que está selecionado, atualiza-o também
            if (selectedChatRef.current?.id === updatedChat.id) {
                setSelectedChat(updatedChat);
            }
        };
        
        socket.on('chat_updated', handleChatUpdate);
        socket.on('update_online_list', handleUpdateOnlineList);
        socket.on('user_online', handleUserOnline);
        socket.on('user_offline', handleUserOffline);
        socket.on('newMessage', handleNewMessage);
        socket.on('newGroupChat', handleNewGroup);
        socket.on('messageUpdated', handleMessageUpdated);
        socket.on('messageDeleted', handleMessageDeleted);
        // socket.on('membersAdded', handleParticipantUpdate);
        // socket.on('memberRemoved', handleParticipantUpdate);
        // socket.on('memberRoleUpdated', handleParticipantUpdate);

        return () => {
            socket.off('update_online_list', handleUpdateOnlineList);
            socket.off('user_online', handleUserOnline);
            socket.off('user_offline', handleUserOffline);
            socket.off('newMessage', handleNewMessage);
            socket.off('newGroupChat', handleNewGroup);
            socket.off('messageUpdated', handleMessageUpdated);
            socket.off('messageDeleted', handleMessageDeleted);
            // socket.off('membersAdded', handleParticipantUpdate);
            // socket.off('memberRemoved', handleParticipantUpdate);
            // socket.off('memberRoleUpdated', handleParticipantUpdate);
        };
    }, [socket]);

    useEffect(() => {
        if (isAuthenticated && socket?.connected) {
            api.get<Chat[]>('/chat')
                .then(response => setChats(response.data))
                .catch(err => console.error("Falha ao buscar chats:", err));
        }
    }, [isAuthenticated, socket]);

    useEffect(() => {
        if (!user) {
            setTotalUnreadCount(0);
            return;
        };

        // O método 'reduce' soma os valores de um array, que é perfeito para nosso caso.
        const newTotal = chats.reduce((acc, chat) => {
            // Encontra a participação do usuário logado no chat atual
            const myParticipation = chat.participants.find(p => p.user.id === user.id);
            // Soma o unreadCount dele ao acumulador
            const count = myParticipation?.unreadCount || 0;
            return acc + count;
        }, 0); // O valor inicial da soma é 0

        // Atualiza o estado do contador total
        setTotalUnreadCount(newTotal);
        
    }, [chats, user]);

    // Efeito para pedir permissão de notificação assim que o chat é inicializado
    useEffect(() => {
        // Verifica se o navegador suporta notificações
        if (!("Notification" in window)) {
            console.log("Este navegador não suporta notificações de desktop.");
        }
        // Se a permissão ainda não foi pedida, pede ao usuário.
        else if (Notification.permission === "default") {
            Notification.requestPermission();
        }
    }, []);
    
    const selectChat = useCallback(async (chat: Chat | null, targetMessageId?: string) => {
        fetchControllerRef.current?.abort();

        // if (isSearching) clearSearch();

        setHighlightedMessageId(null);
        setSelectedChat(chat);
        setIsLoadingMore(false);
        setHasMoreMessages(true);
        setCurrentPage(1);
        isFetchingMore.current = false;

        if (!chat) {
            setMessages([]);
            return;
        }

        if (isSearchingRef.current) {
            clearSearch();
        }

        setMessages([]);
        
        const currentUser = userRef.current;
        const myParticipation = currentUser
            ? chat.participants.find(p => p.user.id === currentUser.id)
            : undefined;
        if (myParticipation && myParticipation.unreadCount > 0) {
            markChatAsRead(chat.id);
        }

        let initialData;

        try {
            const controller = new AbortController();
            fetchControllerRef.current = controller;

            let hasMoreInLoop = true;
            let currentPageInLoop = 1;
            let messageFound = false;
            let accumulatedMessages: Message[] = [];

            // Carga inicial da página 1
            const initialResponse = await api.get(`/chat/${chat.id}/messages?limit=${MESSAGES_PER_PAGE}&page=${currentPageInLoop}`, {
                signal: controller.signal
            });

            initialData = initialResponse.data;
            const initialMessages = initialData.messages.reverse();
            setMessages(initialMessages);
            setTotalMessages(initialData.total);
            
            while (!messageFound && hasMoreInLoop) {
                const response = await api.get(`/chat/${chat.id}/messages?limit=${MESSAGES_PER_PAGE}&page=${currentPageInLoop}`, {
                    signal: controller.signal
                });
                const data = response.data;
                
                if (currentPageInLoop === 1) setTotalMessages(data.total);

                if (data.messages.length > 0) {
                    const newMessages = data.messages.reverse();
                    accumulatedMessages = [...newMessages, ...accumulatedMessages];
                    if (targetMessageId) messageFound = newMessages.some(msg => msg.id === targetMessageId);
                    else messageFound = true;
                }
                
                if (data.messages.length < MESSAGES_PER_PAGE || (currentPageInLoop * MESSAGES_PER_PAGE >= data.total)) {
                    hasMoreInLoop = false;
                }

                if (!messageFound && hasMoreInLoop) currentPageInLoop++;
            }
            setMessages(accumulatedMessages);
            setCurrentPage(currentPageInLoop);
            setHasMoreMessages(hasMoreInLoop);

            if (targetMessageId && messageFound) {
                setHighlightedMessageId(targetMessageId);
            } else {
                setScrollToBottomTrigger(prev => prev + 1);
            }
        } catch (error) {
            if (!(error instanceof Error) || error.name !== 'AbortError') console.error("Erro em selectChat:", error);
        }
    }, []);

    const fetchMoreMessages = useCallback(async () => {
        const currentChat = selectedChatRef.current;
        if (isFetchingMore.current || !hasMoreMessagesRef.current || !currentChat) return;

        isFetchingMore.current = true;
        setIsLoadingMore(true);
        const nextPage = currentPageRef.current + 1;

        try {
            const response = await api.get(`/chat/${currentChat.id}/messages?limit=${MESSAGES_PER_PAGE}&page=${nextPage}`);
            const data = response.data;
            if (data.messages.length > 0) {
                const existingMessageIds = new Set(messagesRef.current.map(msg => msg.id));
                const uniqueNewMessages = data.messages.reverse().filter(msg => !existingMessageIds.has(msg.id));
                setMessages(prevMessages => [...uniqueNewMessages.reverse(), ...prevMessages]);
                setCurrentPage(nextPage);
            } else {
                setHasMoreMessages(false);
            }
        } catch (error) { console.error("Erro ao buscar mais mensagens:", error);
        } finally {
            setIsLoadingMore(false);
            isFetchingMore.current = false;
        }
    }, []);
    
    const searchMessages = useCallback(async (query: string) => {
        setIsSearching(true)

        try {
            const response = await api.get(`/messages/search?query=${encodeURIComponent(query)}`)
            setSearchResults(response.data)
        } catch (error) {
            console.error('Erro ao buscar mensagens:', error)
            setSearchResults([])
        } 
    }, []);
    
    const clearSearch = useCallback(() => {
        setIsSearching(false);
        setSearchResults([]);
    }, []);

    const fetchAllUsers = useCallback(async (): Promise<User[]> => {
        try {
            return await chatService.fetchContacts();
        } catch (error) {
            console.error("Erro ao buscar usuários:", error);
            return [];
        }
    }, []);
    
    const createDirectChat = useCallback(async (partnerId: string) => {
        try {
            const newChat = await chatService.createDirectChat({ partnerId });

            if (socket) {
                socket.emit('joinRoom', newChat.id);
            }
            
            setChats(prev => [newChat, ...prev.filter(c => c.id !== newChat.id)]);
            selectChat(null);
        } catch (error) {
            console.error("Erro ao criar chat direto:", error);
        }
    }, [selectChat, socket]);

    const createGroupChat = useCallback(async (name: string, memberIds: string[]) => {
        try {
            const newGroup = await chatService.createGroupChat({ name, memberIds });

            if (socket) {
                socket.emit('joinRoom', newGroup.id);
            }

            setChats(prev => [newGroup, ...prev.filter(c => c.id !== newGroup.id)]);
            selectChat(null);
        } catch (error) {
            console.error("Erro ao criar grupo:", error);
        }
    }, [selectChat, socket]);
    const updateGroupDetails = useCallback(async (chatId: string, data: { name?: string; photo?: File }) => {
        try {
            setIsUploading(true);
            await chatService.updateGroupDetails(chatId, data);
            toast.success("Atualizado com sucesso!")
        } catch (error) {
            console.error("Erro ao atualizar grupo:", error);
            toast.error("Não foi possível atualizar os detalhes do grupo.");
        } finally {
            setIsUploading(false);
        }
    }, []);

    // 3. Adicione o novo listener ao useEffect do socket
    useEffect(() => {
        if (!socket) return;
        
        const handleGroupDetailsUpdated = (updatedChat: Chat) => {
            console.log("Grupo atualizado recebido:", updatedChat);
            // Atualiza a lista de chats
            setChats(prev => prev.map(c => c.id === updatedChat.id ? updatedChat : c));
            // Se for o chat selecionado, atualiza também
            if (selectedChatRef.current?.id === updatedChat.id) {
                setSelectedChat(updatedChat);
            }
        };

        socket.on('groupDetailsUpdated', handleGroupDetailsUpdated);

        return () => {
            socket.off('groupDetailsUpdated', handleGroupDetailsUpdated);
        };
    }, [socket]);
    
    const sendMessage = useCallback((payload: { content: string, fileUrl?: string, type?: 'TEXT' | 'IMAGE' | 'AUDIO' }) => {
        const currentChat = selectedChatRef.current;
        const currentUser = userRef.current;
        if (!socket || !currentChat || !currentUser) return;

        const tempMessage: Message = {
            id: `temp_${Date.now()}`,
            content: payload.content,
            fileUrl: payload.fileUrl,
            type: payload.type || 'TEXT',
            createdAt: new Date().toISOString(),
            chat_id: currentChat.id,
            sender_id: currentUser.id,
            sender: {
                id: currentUser.id,
                name: currentUser.name,
            },
        };

        setMessages(prevMessages => [...prevMessages, tempMessage]);
        setScrollToBottomTrigger(prev => prev + 1);

        setChats(prev => {
            const otherChats = prev.filter(c => c.id !== currentChat.id);
            const updatedChat = { ...currentChat, messages: [tempMessage] };
            return [updatedChat, ...otherChats];
        });

        socket.emit('sendMessage', {
            chat_id: currentChat.id,
            ...payload
        });
    }, [socket]);
    const deleteMessage = useCallback((messageId: string) => {
        if (socket) socket.emit('deleteMessage', { messageId });
    }, [socket]);
    const editMessage = useCallback((messageId: string, newContent: string) => {
        if (socket) {
            socket.emit('editMessage', { messageId, newContent });
            setEditingMessage(null);
        }
    }, [socket]);

    const markChatAsRead = useCallback((chatId: string) => {
        const currentUser = userRef.current;
        if (!currentUser) return;

        // 1. Atualização Otimista da UI: zera o contador imediatamente
        setChats(prevChats =>
            prevChats.map(chat => {
                if (chat.id === chatId) {
                    const myNewParticipation = chat.participants.map(p =>
                        p.user.id === currentUser.id ? { ...p, unreadCount: 0 } : p
                    );
                    return { ...chat, myUnreadCount: 0, participants: myNewParticipation };
                }
                return chat;
            })
        );
        // Limpa o marcador de "novas mensagens"
        setFirstUnreadId(null);

        // 2. Sincronização com o Backend em segundo plano
        void api.post(`/chat/${chatId}/read`);
    }, []);
    const uploadFileAndSendMessage = useCallback(async (file: File) => {
        const currentChat = selectedChatRef.current;
        const currentUser = userRef.current;
        if (!currentChat || !currentUser) return;

        const supportedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const supportedAudioTypes = ['audio/mpeg', 'audio/webm', 'audio/wav', 'audio/ogg'];
        
        if (![...supportedImageTypes, ...supportedAudioTypes].includes(file.type)) {
            toast.error("Tipo de arquivo não suportado.");
            return;
        }

        if (file.size > MAX_CHAT_UPLOAD_BYTES) {
            toast.error(CHAT_UPLOAD_SIZE_ERROR_MESSAGE);
            return;
        }

        setIsUploading(true);

        const formData = new FormData();
        formData.append('chat_id', currentChat.id);
        formData.append('file', file);

        try {
            const response = await api.post('/chat/media', formData);
            const result = response.data;
            const { fileUrl } = result;
            const messageType = file.type.startsWith('image') ? 'IMAGE' : 'AUDIO';

            // Reutiliza a função sendMessage para enviar a mensagem de mídia
            sendMessage({
                content: file.name,
                fileUrl: fileUrl,
                type: messageType
            });

        } catch (error) {
            console.error("Erro no processo de upload:", error);
            toast.error("Não foi possível enviar sua mídia.");
        } finally {
            setIsUploading(false);
        }
    }, [sendMessage]);
    const getSignedMediaUrl = useCallback(async (filePath: string): Promise<string | null> => {
        return await chatService.getSignedMediaUrl(filePath);
    }, []);

    const updateUnreadBadge = (currentChats: Chat[]) => {
        if (!user) return;

        const newTotal = currentChats.reduce((acc, chat) => {
            const myParticipation = chat.participants.find(p => p.user.id === user.id);
            const count = myParticipation?.unreadCount || 0;
            return acc + count;
        }, 0);

        const badge = document.getElementById('chat-notification-badge');
        if (badge) {
            if (newTotal > 0) {
                badge.style.display = 'flex'; // Torna o badge visível
                badge.textContent = newTotal > 99 ? '99+' : String(newTotal);
            } else {
                badge.style.display = 'none'; // Esconde o badge
            }
        }
    };

    const showNotification = (title: string, options: NotificationOptions) => {
        // Garante que temos permissão e que a aba do chat NÃO está em foco
        if (Notification.permission === "granted" && document.hidden) {
            const notification = new Notification(title, options);
            
            // Opcional: faz com que, ao clicar na notificação, o usuário seja levado para a janela do chat
            notification.onclick = () => {
                window.focus();
            };
        }
    };

    const startEditingMessage = useCallback((message: Message) => setEditingMessage(message), []);
    const cancelEditingMessage = useCallback(() => setEditingMessage(null), []);

    const addMembersToGroup = useCallback(async (chatId: string, userIdsToAdd: string[]) => {
        try {
            await chatService.addMembersToGroup(chatId, userIdsToAdd);
            toast.success("Adicionado com sucesso!")
        } catch (error) { console.error("Erro ao adicionar membros:", error); }
    }, []);

    const removeMemberFromGroup = useCallback(async (chatId: string, userIdToRemove: string) => {
        try {
            await chatService.removeMemberFromGroup(chatId, userIdToRemove);
            toast.success("Removido com sucesso!")
        } catch (error) { console.error("Erro ao remover participante:", error); }
    }, []);

    const updateMemberRole = useCallback(async (chatId: string, targetUserId: string, role: 'ADMIN' | 'MEMBER') => {
        try {
            await chatService.updateMemberRole(chatId, targetUserId, role);
            toast.success("Atualizado com sucesso!")
        } catch (error) { console.error("Erro ao atualizar permissão:", error); }
    }, []);

    const value = useMemo<ChatContextType>(() => ({
        chats,
        selectedChat,
        messages,
        highlightedMessageId,
        currentPage,
        selectChat,
        sendMessage,
        searchMessages,
        searchResults,
        clearSearch,
        isSearching,
        fetchMoreMessages,
        hasMoreMessages,
        isLoadingMore,
        scrollToBottomTrigger,
        fetchAllUsers,
        createDirectChat,
        createGroupChat,
        onlineUserIds,
        firstUnreadId,
        totalUnreadCount,
        uploadFileAndSendMessage,
        isUploading,
        getSignedMediaUrl,
        editingMessage,
        startEditingMessage,
        cancelEditingMessage,
        editMessage,
        deleteMessage,
        updateGroupDetails,
        removeMemberFromGroup,
        updateMemberRole,
        addMembersToGroup,
    }), [
        chats,
        selectedChat,
        messages,
        highlightedMessageId,
        currentPage,
        selectChat,
        sendMessage,
        searchMessages,
        searchResults,
        clearSearch,
        isSearching,
        fetchMoreMessages,
        hasMoreMessages,
        isLoadingMore,
        scrollToBottomTrigger,
        fetchAllUsers,
        createDirectChat,
        createGroupChat,
        onlineUserIds,
        firstUnreadId,
        totalUnreadCount,
        uploadFileAndSendMessage,
        isUploading,
        getSignedMediaUrl,
        editingMessage,
        startEditingMessage,
        cancelEditingMessage,
        editMessage,
        deleteMessage,
        updateGroupDetails,
        removeMemberFromGroup,
        updateMemberRole,
        addMembersToGroup,
    ]);

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export const useChat = () => {
    const context = useContext(ChatContext);
    if (context === null) throw new Error('useChat must be used within a ChatProvider');
    return context;
};
