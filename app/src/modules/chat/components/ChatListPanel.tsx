import React, { useState, useEffect } from 'react';
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdGroupAdd } from "react-icons/md";
import { CiCirclePlus } from "react-icons/ci";
import { toast } from "react-toastify";

import { useChat } from '../../../context/ChatContext';
import { useAuth } from '../../../context/AuthContext';
import * as styles from '../../../styles/chat'
import css from './ChatListPanel.module.css';

const NewChatView = ({ onBack, onSelectUser, onNewGroupClick }) => {
    const { fetchAllUsers } = useChat();
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    useEffect(() => {
        fetchAllUsers().then(setUsers);
        setIsLoading(false)
    }, [fetchAllUsers]);

    const filteredUsers = users.filter(user => 
        user.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className={css.panel}>
            <div className={css.header}>
                <div className={css.headerRow}>
                    <button onClick={onBack} className={css.iconBtn}>
                       <IoMdArrowRoundBack />
                    </button>
                    <p className={css.title}>Nova Conversa</p>
                </div>
            </div>
            <div className={css.searchWrap}>
                <input
                    className={css.input}
                    placeholder="Pesquisar contatos..."
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                />
            </div>
            <div className={css.list}>
                <div
                    className={css.item}
                    onClick={onNewGroupClick}
                >
                    <div className={css.avatar}>
                        <MdGroupAdd />
                    </div>
                    <div className={css.grow}>
                        <p className={css.itemTitle}>
                            Novo Grupo
                        </p>
                    </div>
                </div>
                {isLoading && 
                    <p className={css.centerText}>Carregando...</p>
                }
                {!isLoading && filteredUsers.map(user => (
                    <div
                        onClick={() => onSelectUser(user.id)}
                        key={user.id} 
                        className={css.item}
                    >
                        <div className={css.avatar}>
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className={css.grow}>
                            <p className={css.itemTitle}>
                                {user.name}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
const NewGroupView = ({ onBack, onGroupCreated }) => {
    const { fetchAllUsers, createGroupChat } = useChat();
    const [users, setUsers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [groupName, setGroupName] = useState('');

    useEffect(() => {
        fetchAllUsers().then(fetchedUsers => {
            setUsers(fetchedUsers);
            setIsLoading(false);
        });
    }, [fetchAllUsers]);

    const handleUserSelect = (userId: string) => {
        const newSelection = new Set(selectedUserIds);
        if (newSelection.has(userId)) {
            newSelection.delete(userId);
        } else {
            newSelection.add(userId);
        }
        setSelectedUserIds(newSelection);
    };

    const handleCreateGroup = () => {
        if (!groupName.trim()) {
            toast.error("Por favor, digite um nome para o grupo.");
            return;
        }
        if (selectedUserIds.size === 0) {
            toast.error("Selecione pelo menos um participante.");
            return;
        }
        createGroupChat(groupName, Array.from(selectedUserIds));
        onGroupCreated(); // Avisa o componente pai para voltar à lista principal
    };

    return (
        <div className={css.panel}>
            <div className={css.header}>
                <div className={css.headerBetween}>
                    <button onClick={onBack} className={css.iconBtn}>
                        <IoMdArrowRoundBack />
                    </button>
                    <p className={css.title}>Novo Grupo</p>
                </div>
            </div>
            <div className={css.searchWrapRow}>
                <input
                    className={css.input}
                    placeholder="Nome do Grupo" 
                    value={groupName} 
                    onChange={e => setGroupName(e.target.value)} 
                />
                <button onClick={handleCreateGroup} className={css.iconBtn}><MdGroupAdd /></button>
            </div>
            <div className={css.list}>
                {isLoading && 
                    <p className={css.centerText}>Carregando...</p>
                }
                {!isLoading && users.map(user => (
                    <div
                        key={user.id} style={selectedUserIds.has(user.id) ? styles.chatListItemSelectedStyle : styles.chatListItemStyle} 
                        onClick={() => handleUserSelect(user.id)}
                        className={css.item}
                    >
                        <input type="checkbox" checked={selectedUserIds.has(user.id)} readOnly className={css.hiddenCheckbox} />
                        <div className={css.avatar}>
                            {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className={css.grow}>
                            <p className={css.itemTitle}>
                                {user.name}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const SearchBar = () => {
    const { searchMessages, clearSearch, isSearching } = useChat();
    const [query, setQuery] = useState('');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        searchMessages(query);
        setQuery('');
    };

    const handleClear = () => {
        setQuery('');
        clearSearch();
    };
    return (
        <div className={css.searchWrap}>
            <form style={{ display: 'flex' }} onSubmit={handleSearch}>
                <input
                    placeholder='Pesquisar mensagens...' 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={css.input}
                />
                {isSearching && (
                    <button
                        onClick={handleClear}
                        className={css.iconBtn}
                    >
                        &times;
                    </button>)
                }
            </form>
        </div>
    );
};

const SearchResultItem = ({ message }) => {
    const { chats, selectChat } = useChat();
    const handleResultClick = () => {
        const targetChat = chats.find(c => c.id === message.chat_id);
        if (targetChat) {
            selectChat(targetChat, message.id);
        }
    };
    return (
        <div
            onClick={handleResultClick}
            className={css.item}
        >
            <div className={css.grow}>
                <p className={css.itemTitle}>
                    {message.sender.name} em <strong>{message.chat.name || 'Conversa Direta'}</strong>
                </p>
                <p className={css.itemSubtitle}>
                    {message.content}
                </p>
            </div>
        </div>
    );
};

const ChatListItem = ({ chat, isSelected, onSelect }) => {
    const { user: currentUser } = useAuth();
    const { onlineUserIds } = useChat();

    if (!currentUser) {
        return null;
    }

     const getChatDetails = () => {
        if (chat.type === 'GROUP') {
            return {
                name: chat.name,
                photo: chat.photo || null, 
                isOnline: false, // Status online não se aplica a grupos
            };
        }
        
        // Para chats diretos
        const otherParticipant = chat.participants.find(p => currentUser && p.user.id !== currentUser.id);
        if (!otherParticipant) {
            return { name: 'Chat Inválido', photo: null, isOnline: false };
        }

        return {
            name: otherParticipant.user.name,
            photo: otherParticipant.user.photo,
            isOnline: onlineUserIds.has(otherParticipant.user.id),
        };
    };
    
    const details = getChatDetails();
    const lastMessage = chat.messages?.[0];

    const myParticipation = chat.participants.find(p => p.user_id === currentUser.id);
    const unreadCount = myParticipation?.unreadCount || 0;
    const itemStyle = isSelected ? styles.chatListItemSelectedStyle : styles.chatListItemStyle;
    
    
    return (
        <div
            onClick={onSelect}
            className={css.item}
        >
            <div className={css.avatar}>
                {details.photo ? (
                    <img 
                        src={details.photo} 
                        alt={`Foto de ${details.name}`} 
                        loading="lazy"
                        decoding="async"
                        style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            objectFit: 'cover',
                        }}
                    />
                ) : (
                    details.name?.charAt(0).toUpperCase()
                )}
                {details.isOnline && <span className={css.onlineDot}></span>}
            </div>
            <div className={css.grow}>
                <p className={css.itemTitle}>
                    {details.name}
                </p>
                <div className={css.rowBetween}>
                    <p className={css.itemSubtitle}>
                        {lastMessage?.content}
                    </p>
                    {unreadCount > 0 && (
                        <span 
                            style={{
                                backgroundColor: '#2f406a',
                                color: 'white',
                                borderRadius: '50%',
                                padding: '2px 6px',
                                fontSize: '0.75em',
                                fontWeight: 'bold',
                                minWidth: '20px',
                                textAlign: 'center',
                            }}
                        >{unreadCount}</span>
                    )}
                </div>
            </div>
        </div>
    );
};

const ChatListView = ({ onNewChatClick }) => {
    const { chats, selectedChat, selectChat, isSearching, searchResults } = useChat();
    
    return (
        <div className={css.panel}>
            <div className={css.header}>
                <div className={css.headerBetween}>
                    <p className={css.title}>Conversas</p>
                    <button
                        onClick={onNewChatClick} 
                        title="Nova Conversa" 
                        className={css.iconBtnLarge}
                    >
                        <CiCirclePlus />
                    </button>
                </div>
                <SearchBar />
            </div>
            <div className={css.list}>
                {isSearching ? (
                    <div>
                        {searchResults.length > 0 ? (
                            searchResults.map(msg => <SearchResultItem key={msg.id} message={msg} />)
                        ) : (
                            <p className={css.centerText}>Nenhum resultado encontrado.</p>
                        )}
                    </div>
                ) : (
                    chats.map(chat => (
                        <ChatListItem
                            key={chat.id}
                            chat={chat}
                            isSelected={selectedChat?.id === chat.id}
                            onSelect={() => selectChat(chat, undefined)}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export const ChatListPanel = () => {
    const [view, setView] = useState<'list' | 'new_chat' | 'new_group'>('list');
    const { user: currentUser } = useAuth();
    const { chats, selectChat, createDirectChat } = useChat();

    const handleSelectUser = (partnerId: string) => {
        if (!currentUser) return;
        const existingChat = chats.find(chat =>
            chat.type === 'DIRECT' &&
            chat.participants.length === 2 &&
            chat.participants.some(p => p.user.id === partnerId)
        );

        if (existingChat) {
            selectChat(existingChat);
        } else {
            createDirectChat(partnerId);
        }
        setView('list');
    };


    switch (view) {
        case 'new_chat':
            return <NewChatView onBack={() => setView('list')} onSelectUser={handleSelectUser} onNewGroupClick={() => setView('new_group')} />;
        case 'new_group':
            return <NewGroupView onBack={() => setView('new_chat')} onGroupCreated={() => setView('list')} />;
        default:
            return <ChatListView onNewChatClick={() => setView('new_chat')} />;
    }
};
