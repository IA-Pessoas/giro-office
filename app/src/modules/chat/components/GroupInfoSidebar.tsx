import React, { useState, useEffect, useRef } from 'react';

import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import * as styles from '../../../styles/chat'
import css from './GroupInfoSidebar.module.css'

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
        <div className={css.modalOverlay}>
            <div className={css.modalCard}>
                <p className={css.modalTitle}>Adicionar Participantes</p>
                <div className={css.modalList}>
                    {allUsers.map(user => (
                        <div
                            key={user.id} 
                            style={selectedUserIds.has(user.id) ? styles.chatListItemSelectedStyle : styles.chatListItemStyle} 
                            onClick={() => handleUserSelect(user.id)}
                            className={css.userRow}
                        >
                            <input type="checkbox" checked={selectedUserIds.has(user.id)} readOnly className={css.hiddenCheckbox} />
                            <p>{user.name}</p>
                        </div>
                    ))}
                </div>
                <div className={css.modalActions}>
                    <button onClick={onClose} className={css.ghostBtn}>Cancelar</button>
                    <button onClick={handleConfirmAdd} className={css.primaryBtn}>Adicionar</button>
                </div>
            </div>
        </div>
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
            <div className={css.sidebar}>
                <div className={css.sidebarHeader}>
                    <div className={css.headerRow}>
                        <p>Informações do Grupo</p>
                        <button onClick={onClose} className={css.closeBtn}>
                            &times;
                        </button>
                    </div>
                </div>

                <div
                    onClick={handleAvatarClick}
                    title={isAdmin ? "Clique para alterar a foto" : ""}
                    className={css.avatar}
                    style={{ cursor: isAdmin ? 'pointer' : 'default' }}
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
                        <input
                            type="file" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                            accept="image/*"
                        />
                    )}
                </div>

                <div className={css.sidebarBody}>
                    {isAdmin && (
                        <div className={css.editRow}>
                            <div className={css.editField}>
                                <p>Nome do Grupo</p>
                                <input
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                />
                            </div>
                            <button onClick={handleSaveChanges} className={css.iconBtn}>
                                <MdEdit />
                            </button>
                        </div>
                    )}

                    <div className={css.membersBlock}>
                        <div className={css.membersHeader}>
                            <p>{chat.participants.length} Participantes</p>
                            {isAdmin && (
                                <button
                                    onClick={() => setIsAddModalOpen(true)}
                                    className={css.iconBtn}
                                >
                                    <BsFillPersonPlusFill />
                                </button>
                            )}
                        </div>
                        {chat.participants.map(({ user, role }) => (
                            <div
                                key={user.id} 
                                className={css.memberRow}
                            >
                                <p style={{width: '100%'}}>
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
                                </p>
                                {isAdmin && user.id !== currentUser.id && (
                                    <div className={css.memberActions}>
                                        {role === 'MEMBER' ? (
                                            <button onClick={() => handlePromoteToAdmin(user.id)} title="Promover a Admin" className={css.iconBtn}><GrUserAdmin /></button>
                                        ) : (
                                            <button onClick={() => handleDemoteToMember(user.id)} title="Rebaixar para Membro" className={css.iconBtn}><RiAdminLine /></button>
                                        )}
                                        <button onClick={() => handleRemoveMember(user.id, user.name)} title="Remover Membro" className={css.removeBtn}>
                                            <MdOutlinePersonRemove />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
};