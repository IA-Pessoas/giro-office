import React, { useState, useEffect } from 'react';
import { Box, 
    Button, 
    Input, 
    Checkbox,
    Text 
} from '@chakra-ui/react';
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdGroupAdd } from "react-icons/md";
import { CiCirclePlus } from "react-icons/ci";

import { useChat } from '../../../context/ChatContext';
import { useAuth } from '../../../context/AuthContext';
import * as styles from '../../../styles/chat'

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
        <Box 
            display={'flex'}
            flexDirection={'column'}
            w={'30%'}
            maxW={'400px'}
            minW={'280px'}
            bg={'bodyBg'}
            borderRight={'1px solid'}
            borderColor={'mainOpacity'}
        >
            <Box 
                p={'4px 16px'}
                bg={'bodyBg'}
                borderBottom={'1px solid'}
                borderColor={'mainOpacity'}
            >
                <Box 
                    display={'flex'}
                    alignItems={'center'}
                    gap={'20px'}
                >
                    <Button 
                        onClick={onBack} 
                        bg={'none'}
                        border={'none'}
                        fontSize={'24px'}
                        cursor={'pointer'}
                    >
                       <IoMdArrowRoundBack />
                    </Button>
                    <Text fontWeight={'bold'}>Nova Conversa</Text>
                </Box>
            </Box>
            <Box 
                position={'relative'}
                p={'8px 12px'}
                bg={'bodyBg'}
            >
                <Input 
                    placeholder="Pesquisar contatos..."
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    w={'100%'}
                    p={'8px 12px'}
                    borderRadius={'8px'}
                    border={'1px solid'}
                    borderColor={'mainOpacity'}
                />
            </Box>
            <Box 
                flexGrow={1}
                overflowY={'auto'}
                borderTop={'1px solid'}
                borderColor={'mainOpacity'}
                sx={{
                    '&::-webkit-scrollbar': { width: '4px' },
                    '&::-webkit-scrollbar-track': { background: 'transparent' },
                    '&::-webkit-scrollbar-thumb': { background: 'borderColorReverse', borderRadius: '24px' },
                }}
            >
                <Box 
                    display={'flex'}
                    alignItems={'center'}
                    p={'12px 15px'}
                    cursor={'pointer'}
                    borderBottom={'1px solid'}
                    borderColor={'mainOpacity'}
                    onClick={onNewGroupClick}
                    _hover={{ opacity: .7 }}
                >
                    <Box 
                        w={'50px'}
                        h={'50px'}
                        borderRadius={'50%'}
                        display={'flex'}
                        justifyContent={'center'}
                        alignItems={'center'}
                        fontSize={'20px'}
                        fontWeight={'bold'}
                        bg={'transparent'}
                        mr={'15px'}
                        position={'relative'}
                        flexShrink={0}
                        overflow={'hidden'}
                    >
                        <MdGroupAdd />
                    </Box>
                    <Box flexGrow={1} overflow={'hidden'}>
                        <Text 
                            fontWeight={600}
                            m={0}
                            color={'primaryText'}
                            overflowWrap={'break-word'}
                            wordBreak={'break-word'}
                        >
                            Novo Grupo
                        </Text>
                    </Box>
                </Box>
                {isLoading && 
                    <Text style={{textAlign: 'center', padding: '20px'}}>Carregando...</Text>
                }
                {!isLoading && filteredUsers.map(user => (
                    <Box 
                        onClick={() => onSelectUser(user.id)}
                        key={user.id} 
                        display={'flex'}
                        alignItems={'center'}
                        p={'12px 15px'}
                        cursor={'pointer'}
                        borderBottom={'1px solid'}
                        borderColor={'mainOpacity'}
                        transition={'all .2s ease-in-out'}
                        _hover={{ bg: 'componentColor', color: 'white' }}
                    >
                        <Box 
                            w={'50px'}
                            h={'50px'}
                            borderRadius={'50%'}
                            display={'flex'}
                            alignItems={'center'}
                            justifyContent={'center'}
                            fontSize={'20px'}
                            fontWeight={'bold'}
                            bg={'componentColorReverse'}
                            mr={'15px'}
                            pos={'relative'}
                            flexShrink={0}
                            overflow={'hidden'}
                        >
                            {user.name.charAt(0).toUpperCase()}
                        </Box>
                        <Box flexGrow={1} overflow={'hidden'}>
                            <Text 
                                fontWeight={600}
                                m={0}
                                overflowWrap={'break-word'}
                                wordBreak={'break-word'}
                            >
                                {user.name}
                            </Text>
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
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
            alert("Por favor, digite um nome para o grupo.");
            return;
        }
        if (selectedUserIds.size === 0) {
            alert("Selecione pelo menos um participante.");
            return;
        }
        createGroupChat(groupName, Array.from(selectedUserIds));
        onGroupCreated(); // Avisa o componente pai para voltar à lista principal
    };

    return (
        <Box 
            display={'flex'}
            flexDirection={'column'}
            w={'30%'}
            maxW={'400px'}
            minW={'280px'}
            bg={'bodyBg'}
            borderRight={'1px solid'}
            borderColor={'mainOpacity'}
        >
            <Box
                p={'4px 16px'}
                bg={'bodyBg'}
                borderBottom={'1px solid'}
                borderColor={'mainOpacity'}
            >
                <Box display={'flex'} justifyContent={'space-between'} alignItems={'center'}>
                    <Button 
                        onClick={onBack} 
                        bg={'none'}
                        border={'none'}
                        fontSize={'24px'}
                        cursor={'pointer'}
                    >
                        <IoMdArrowRoundBack />
                    </Button>
                    <Text fontWeight={'bold'}>Novo Grupo</Text>
                </Box>
            </Box>
            <Box 
                position={'relative'}
                p={'8px 12px'}
                bg={'bodyBg'}
                display={'flex'}
                gap={1}
            >
                <Input 
                    placeholder="Nome do Grupo" 
                    value={groupName} 
                    onChange={e => setGroupName(e.target.value)} 
                    w={'100%'}
                    p={'8px 12px'}
                    borderRadius={'8px'}
                    border={'1px solid'}
                    borderColor={'mainOpacity'}
                />
                <Button onClick={handleCreateGroup}><MdGroupAdd /></Button>
            </Box>
            <Box 
                flexGrow={1} 
                overflowY={'auto'} 
                borderTop={'1px solid'} 
                borderColor={'mainOpacity'} 
                sx={{
                    '&::-webkit-scrollbar': { width: '4px' },
                    '&::-webkit-scrollbar-track': { background: 'transparent' },
                    '&::-webkit-scrollbar-thumb': { background: 'borderColorReverse', borderRadius: '24px' },
                }}
            >
                {isLoading && 
                    <Text style={{textAlign: 'center', padding: '20px'}}>Carregando...</Text>
                }
                {!isLoading && users.map(user => (
                    <Box
                        key={user.id} style={selectedUserIds.has(user.id) ? styles.chatListItemSelectedStyle : styles.chatListItemStyle} 
                        onClick={() => handleUserSelect(user.id)}
                        display={'flex'}
                        alignItems={'center'}
                        p={'12px 15px'}
                        cursor={'pointer'}
                        borderBottom={'1px solid'}
                        borderColor={'mainOpacity'}
                        transition={'all .2s ease-in-out'}
                        _hover={{ bg: 'componentColor', color: 'white' }}
                    >
                        <Checkbox display={'none'} type="checkbox" checked={selectedUserIds.has(user.id)} readOnly mr={'10px'} />
                        <Box
                            w={'50px'}
                            h={'50px'}
                            borderRadius={'50%'}
                            display={'flex'}
                            alignItems={'center'}
                            justifyContent={'center'}
                            fontSize={'20px'}
                            fontWeight={'bold'}
                            bg={'componentColorReverse'}
                            mr={'15px'}
                            pos={'relative'}
                            flexShrink={0}
                            overflow={'hidden'}
                        >
                            {user.name.charAt(0).toUpperCase()}
                        </Box>
                        <Box flexGrow={1} overflow={'hidden'}>
                            <Text
                                fontWeight={600}
                                m={0}
                                overflowWrap={'break-word'}
                                wordBreak={'break-word'}
                            >
                                {user.name}
                            </Text>
                        </Box>
                    </Box>
                ))}
            </Box>
        </Box>
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
        <Box pos={'relative'} p={'8px 12px'} bg={'bodyBg'}>
            <form style={{ display: 'flex' }} onSubmit={handleSearch}>
                <Input 
                    placeholder='Pesquisar mensagens...' 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    w={'100%'}
                    p={'8px 12px'}
                    borderRadius={'8px'}
                    border={'1px solid'}
                    borderColor={'mainOpacity'}
                />
                {isSearching && (
                    <Button 
                        onClick={handleClear}
                        bg={'none'}
                        border={'none'}
                        fontSize={'24px'}
                        cursor={'pointer'}
                        color={'primaryText'}
                        _hover={{bg: 'transparent'}}
                    >
                        &times;
                    </Button>)
                }
            </form>
        </Box>
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
        <Box 
            onClick={handleResultClick}
            display={'flex'}
            alignItems={'center'}
            p={'12px 15px'}
            cursor={'pointer'}
            borderBottom={'1px solid'}
            borderColor={'mainOpacity'}
            transition={'all .2s ease-in-out'}
            _hover={{ bg: 'componentColor', color: 'white' }}
        >
            <Box flexGrow={1} overflow={'hidden'}>
                <Text 
                    fontWeight={600}
                    m={0}
                    overflowWrap={'break-word'}
                    wordBreak={'break-word'}
                    color={'secondaryText'}
                >
                    {message.sender.name} em <strong>{message.chat.name || 'Conversa Direta'}</strong>
                </Text>
                <Text
                    m={0}
                    fontSize={'0.9em'}
                    whiteSpace={'nowrap'}
                    textOverflow={'ellipsis'}
                    overflowWrap={'break-word'}
                >
                    {message.content}
                </Text>
            </Box>
        </Box>
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
        <Box 
            onClick={onSelect}
            display={'flex'}
            alignItems={'center'}
            p={'12px 15px'}
            cursor={'pointer'}
            borderBottom={'1px solid'}
            borderColor={'mainOpacity'}
        >
            <Box 
                w={'50px'}
                h={'50px'}
                borderRadius={'50%'}
                display={'flex'}
                justifyContent={'center'}
                alignItems={'center'}
                fontSize={'20px'}
                fontWeight={'bold'}
                bg={'transparent'}
                mr={'15px'}
                position={'relative'}
                flexShrink={0}
                overflow={'hidden'}
            >
                {details.photo ? (
                    <img 
                        src={details.photo} 
                        alt={`Foto de ${details.name}`} 
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
                {details.isOnline && <Box pos={'absolute'} bottom={'2px'} right={'1px'} w={'12px'} h={'12px'} borderRadius={'50%'} bg={'componentColorReberse'}></Box>}
            </Box>
            <Box flexGrow={1} overflow={'hidden'}>
                <Text 
                    fontWeight={600}
                    m={0}
                    overflowWrap={'break-word'}
                    wordBreak={'break-word'}
                >
                    {details.name}
                </Text>
                <Box display={'flex'} justifyContent={'space-between'}>
                    <Text 
                        m={0}
                        fontSize={'0.9em'}
                        whiteSpace={'nowrap'}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        overflowWrap={'break-word'}
                    >
                        {lastMessage?.content}
                    </Text>
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
                </Box>
            </Box>
        </Box>
    );
};

const ChatListView = ({ onNewChatClick }) => {
    const { chats, selectedChat, selectChat, isSearching, searchResults } = useChat();
    
    return (
        <Box 
            display={'flex'}
            flexDirection={'column'}
            w={'30%'}
            maxW={'400px'}
            bg={'bodyBg'}
            borderRight={'1px solid'}
            borderColor={'mainOpacity'}
        >
            <Box 
                p={'4px 16px'}
                bg={'bodyBg'}
                borderBottom={'1px solid'}
                borderColor={'mainOpacity'}
            >
                <Box display={'flex'} justifyContent={'space-between'} alignItems={'center'}>
                    <Text>Conversas</Text>
                    <Button 
                        onClick={onNewChatClick} 
                        title="Nova Conversa" 
                        bg={'none'}
                        border={'none'}
                        fontSize={'35px'}
                        cursor={'pointer'}
                    >
                        <CiCirclePlus />
                    </Button>
                </Box>
                <SearchBar />
            </Box>
            <Box 
                flexGrow={1} 
                overflowY={'auto'} 
                borderTop={'1px solid'} 
                borderColor={'mainOpacity'} 
                sx={{
                    '&::-webkit-scrollbar': { width: '4px' },
                    '&::-webkit-scrollbar-track': { background: 'transparent' },
                    '&::-webkit-scrollbar-thumb': { background: 'borderColorReverse', borderRadius: '24px' },
                }}
            >
                {isSearching ? (
                    <Box>
                        {searchResults.length > 0 ? (
                            searchResults.map(msg => <SearchResultItem key={msg.id} message={msg} />)
                        ) : (
                            <Text textAlign={'center'} p={'20px'} color={'primaryText'}>Nenhum resultado encontrado.</Text>
                        )}
                    </Box>
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
            </Box>
        </Box>
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