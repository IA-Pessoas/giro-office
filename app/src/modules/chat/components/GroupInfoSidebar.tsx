import React, { useState, useEffect, useRef } from 'react';
import { 
    Box, 
    Button, 
    Input, 
    Textarea,
    Text, 
    Checkbox
} from '@chakra-ui/react';

import { useAuth } from '../../context/AuthContext';
import { useChat } from '../context/ChatContext';
import * as styles from '../../styles/chat'

import { BsFillPersonPlusFill } from "react-icons/bs";
import { MdGroups } from "react-icons/md";
import { MdEdit } from "react-icons/md";
import { GrUserAdmin } from "react-icons/gr";
import { RiAdminLine } from "react-icons/ri";
import { MdOutlinePersonRemove } from "react-icons/md";

const AddMembersModal = ({ chat, onClose, onAddMembers }) => {
    const { fetchAllUsers } = useChat();
    const [allUsers, setAllUsers] = useState([]);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchAllUsers().then(users => {
            // Filtra para mostrar apenas usuários que NÃO estão no chat
            const currentMemberIds = new Set(chat.participants.map(p => p.user.id));
            const availableUsers = users.filter(u => !currentMemberIds.has(u.id));
            setAllUsers(availableUsers);
        });
    }, [fetchAllUsers, chat.participants]);

    const handleUserSelect = (userId: string) => {
        const newSelection = new Set(selectedUserIds);
        newSelection.has(userId) ? newSelection.delete(userId) : newSelection.add(userId);
        setSelectedUserIds(newSelection);
    };

    const handleConfirmAdd = () => {
        onAddMembers(Array.from(selectedUserIds));
        onClose();
    };

    return (
        <Box
            position={'fixed'}
            top={0}
            left={0}
            width={'100%'}
            height={'100%'}
            backgroundColor={'rgba(0, 0, 0, 0.5)'}
            display={'flex'}
            justifyContent={'center'}
            alignItems={'center'}
            zIndex={1000}
        >
            <Box 
                backgroundColor={'bodyBg'}
                borderRadius={'8px'}
                p={'20px'}
                minW={'40%'}
                maxW={'90%'}
                maxH={'90%'}
                overflow={'auto'}
                textAlign={'center'}
                display={'flex'}
                flexDirection={'column'}
            >
                <Text fontSize={'25px'} fontWeight={'bold'} mb={'10px'}>Adicionar Participantes</Text>
                <Box
                    flexGrow={1}
                    overflowY={'auto'}
                    borderTop={'1px solid'}
                    borderColor={'borderColor'}
                >
                    {allUsers.map(user => (
                        <Box 
                            key={user.id} 
                            style={selectedUserIds.has(user.id) ? styles.chatListItemSelectedStyle : styles.chatListItemStyle} 
                            onClick={() => handleUserSelect(user.id)}
                            p={'10px 0'}
                            display={'flex'}
                            alignItems={'center'}
                            justifyContent={'start'}
                            cursor={'pointer'} 
                            w={'100%'}
                            borderBottom={'1px solid'}
                            borderColor={'borderColor'}
                            _hover={{ bg: 'componentColor', color: 'white' }}
                        >
                            <Checkbox display={'none'} checked={selectedUserIds.has(user.id)} readOnly mr={'10px'} />
                            <Text>{user.name}</Text>
                        </Box>
                    ))}
                </Box>
                <Box
                    mt={'20px'}
                    display={'flex'}
                    justifyContent={'space-between'}
                    gap={'10px'}
                >
                    <Button onClick={onClose} bg={'transparent'}>Cancelar</Button>
                    <Button onClick={handleConfirmAdd} _hover={{ bg: 'componentColor', }}>Adicionar</Button>
                </Box>
            </Box>
        </Box>
    );
};

export const GroupInfoSidebar = ({ chat, onClose }) => {
    const { user: currentUser } = useAuth();
    const { updateGroupDetails, removeMemberFromGroup, addMembersToGroup, updateMemberRole } = useChat();

    const [groupName, setGroupName] = useState(chat.name);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(chat.photo);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Verifica se o usuário logado é admin
    const myParticipation = chat.participants.find(p => p.user.id === currentUser.id);
    const isAdmin = myParticipation?.role === 'ADMIN';

    const handleRemoveMember = (userIdToRemove: string, userName: string) => {
        if (window.confirm(`Tem certeza que deseja remover ${userName} do grupo?`)) {
            removeMemberFromGroup(chat.id, userIdToRemove);
        }
    };
    const handleAddMembers = (userIdsToAdd: string[]) => {
        if (userIdsToAdd.length > 0) {
            addMembersToGroup(chat.id, userIdsToAdd);
        }
    };
    const handlePromoteToAdmin = (targetUserId: string) => {
        updateMemberRole(chat.id, targetUserId, 'ADMIN');
    };

    const handleDemoteToMember = (targetUserId: string) => {
        updateMemberRole(chat.id, targetUserId, 'MEMBER');
    };

    const handleAvatarClick = () => {
        if (isAdmin) {
            fileInputRef.current?.click();
        }
    };
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file); // Guarda o arquivo para o upload
            setPhotoPreviewUrl(URL.createObjectURL(file)); // Gera uma URL local para a pré-visualização
        }
    };

    const handleSaveChanges = () => {
        const nameChanged = groupName.trim();
        const photoChanged = photoFile;

        if (!nameChanged && !photoChanged) {
            onClose(); // Se nada mudou, apenas fecha
            return;
        }

        if (photoFile !== null) {
            const dataToUpdate: { name?: string; photo?: File } = {};
            if (nameChanged) dataToUpdate.name = nameChanged;
                dataToUpdate.photo = photoChanged;
            
            updateGroupDetails(chat.id, dataToUpdate).then(() => {
                onClose();
            });
        } else {
            const dataToUpdate: { name?: string; } = {};
            if (nameChanged) dataToUpdate.name = nameChanged;
            
            updateGroupDetails(chat.id, dataToUpdate).then(() => {
                onClose();
            });
        }
    };

    return (
         <>
            {isAddModalOpen && (
                <AddMembersModal 
                    chat={chat} 
                    onClose={() => setIsAddModalOpen(false)} 
                    onAddMembers={handleAddMembers} 
                />
            )}
            <Box 
                position={'absolute'}
                top={0}
                right={'100%'}
                width={'43%'}
                minW={'280px'}
                maxW={'400px'}
                h={'100%'}
                bg={'bodyBg'}
                boxShadow={'-5px 0px 15px rgba(0,0,0,0.9)'}
                zIndex={20}
                display={'flex'}
                flexDirection={'column'}
            >
                <Box
                    p={'10px'}
                    bg={'bodyBg'}
                >
                    <Box 
                        display={'flex'}
                        alignItems={'center'}
                        justifyContent={'space-between'}
                        gap={'20px'}
                    >
                        <Text>Informações do Grupo</Text>
                        <Button 
                            onClick={onClose} 
                            background={'none'}
                            border={'none'} 
                            fontSize={'24px'} 
                            cursor={'pointer'}
                        >
                            &times;
                        </Button>
                    </Box>
                </Box>

                <Box 
                    onClick={handleAvatarClick}
                    title={isAdmin ? "Clique para alterar a foto" : ""}
                    w={'150px'}
                    h={'150px'}
                    borderRadius={'50%'}
                    display={'flex'}
                    alignItems={'center'}
                    justifyContent={'center'}
                    fontWeight={'bold'}
                    fontSize={'20px'}
                    bg={'bodyBg'}
                    m={'0 auto 20px auto'}
                    position={'relative'}
                    flexShrink={0}
                    overflow={'hidden'}
                    cursor={isAdmin ? 'pointer' : 'default'}
                >
                    {photoPreviewUrl ? (
                        <img
                            src={`${photoPreviewUrl}`}
                            alt={groupName}
                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', }}
                        />
                    ) : (
                        <span style={{fontSize: '50px'}}><MdGroups /></span>
                    )}

                    {isAdmin && (
                        <Input 
                            type="file" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                            accept="image/*"
                        />
                    )}
                </Box>

                <Box 
                    flexGrow={1} 
                    overflowY={'auto'} 
                    p={'20px'} 
                    sx={{
                        '&::-webkit-scrollbar': { width: '4px' },
                        '&::-webkit-scrollbar-track': { background: 'transparent' },
                        '&::-webkit-scrollbar-thumb': { background: 'borderColorReverse', borderRadius: '24px' },
                    }}
                >
                    {isAdmin && (
                        <Box 
                            display={'flex'}
                            alignItems={'flex-end'}
                            justifyContent={'space-between'}
                            mb={'25px'}
                            gap={'10px'}
                        >
                            <Box display={'flex'} flexDirection={'column'} alignItems={'start'} gap={'10px'}>
                                <Text>Nome do Grupo</Text>
                                <Input 
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                    w={'100%'}
                                    p={'8px'}
                                    border={'1px solid'}
                                    borderColor={'borderColor'}
                                    borderRadius={'4px'}
                                />
                            </Box>
                            <Button onClick={handleSaveChanges}>
                                <MdEdit />
                            </Button>
                        </Box>
                    )}

                    <Box mb={'25px'}>
                        <Box display={'flex'} justifyContent={'start'} alignItems={'center'}>
                            <Text>{chat.participants.length} Participantes</Text>
                            {isAdmin && (
                                <Button 
                                    onClick={() => setIsAddModalOpen(true)}
                                    bg={'none'}
                                    border={'none'}
                                    fontSize={'24px'}
                                    fontWeight={'bold'}
                                    cursor={'pointer'}
                                    _hover={{ color: 'primaryText' }}
                                >
                                    <BsFillPersonPlusFill />
                                </Button>
                            )}
                        </Box>
                        {chat.participants.map(({ user, role }) => (
                            <Box 
                                key={user.id} 
                                p={'10px 0'}
                                borderBottom={'1px solid'}
                                borderColor={'borderColor'}
                                display={'flex'}
                                alignItems={'center'}
                                justifyContent={'start'}
                                cursor={'pointer'} 
                                w={'100%'}
                                color={'bodyText'}
                            >
                                <Text style={{width: '100%'}}>
                                    {user.name} 
                                    {role === 'ADMIN' && 
                                        <span style={{
                                            backgroundColor: 'borderColorReverse',
                                            color: 'primaryText',
                                            border: '1px solid',
                                            borderColor: 'borderColor',
                                            borderRadius: '4px',
                                            padding: '2px 6px',
                                            fontSize: '0.75em',
                                            marginLeft: '8px'
                                        }}>Admin</span>
                                    }
                                </Text>
                                {isAdmin && user.id !== currentUser.id && (
                                    <Box display={'flex'} flexDirection={'row'} justifyContent={'start'} width={'100%'} gap={'10px'} marginLeft={'30px'}>
                                        {role === 'MEMBER' ? (
                                            <Button onClick={() => handlePromoteToAdmin(user.id)} title="Promover a Admin" bg={'none'}><GrUserAdmin /></Button>
                                        ) : (
                                            <Button onClick={() => handleDemoteToMember(user.id)} title="Rebaixar para Membro" bg={'none'}><RiAdminLine /></Button>
                                        )}
                                        <Button onClick={() => handleRemoveMember(user.id, user.name)} title="Remover Membro" bg={'none'} color={'red'} fontSize={'22px'}>
                                            <MdOutlinePersonRemove />
                                        </Button>
                                    </Box>
                                )}
                            </Box>
                        ))}
                    </Box>
                </Box>
            </Box>
        </>
    );
};