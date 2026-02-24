import prismaClient from "../../prisma"
import { ChatType, Role } from '@prisma/client'
type MulterFile = Express.Multer.File;
import { bucket } from '../../config/firebase'; // Importa a configuração do Firebase

interface CreateGroupChatRequest {
    creator_id: string
    name: string
    member_ids: string[]
}

const verifyAdminPermission = async (chat_id: string, userId: string) => {
    const participant = await prismaClient.chatParticipant.findUnique({
        where: { chat_id_user_id: { chat_id: chat_id, user_id: userId } }
    });
    if (!participant || participant.role !== 'ADMIN') {
        throw new Error("Ação não autorizada. Apenas administradores do grupo podem realizar esta operação.");
    }
};

export class ChatService {
    async createDirectChat(user_id_1: string, user_id_2: string) {
        const exists = await prismaClient.chat.findFirst({
            where: {
                type: ChatType.DIRECT,
                AND: [
                    { participants: { some: { user_id: user_id_1 } } },
                    { participants: { some: { user_id: user_id_2 } } }
                ],
            },
        })
        if (exists)
            return exists

        const newChat = await prismaClient.$transaction(async (tx) => {
            const chat = await tx.chat.create({
                data: {
                    name: '',
                    type: ChatType.DIRECT,
                },
            })

            await tx.chatParticipant.createMany({
                data: [
                    { chat_id: chat.id, user_id: user_id_1 },
                    { chat_id: chat.id, user_id: user_id_2 },
                ],
            })

            return chat
        })
        const fullChat = await prismaClient.chat.findUnique({
            where: { id: newChat.id },
            include: {
                participants: {
                    include: {
                        user: {
                            select: { id: true, name: true }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        return fullChat;
    }

    async createGroupChat({ creator_id, name, member_ids }: CreateGroupChatRequest) {
        if (!name)
            throw new Error('O nome do grupo é obrigatório')
        if (member_ids.length < 1)
            throw new Error('O grupo deve ter pelo menos 1 membro')

        const newGroupChat = await prismaClient.$transaction(async (tx) => {
            const chat = await tx.chat.create({
                data: {
                    name,
                    type: ChatType.GROUP,
                },
            })

            const participants = [
                { chat_id: chat.id, user_id: creator_id, role: Role.ADMIN },
                ...member_ids
                    .filter(id => id !== creator_id)
                    .map(id => ({ chat_id: chat.id, user_id: id, role: Role.MEMBER })),
            ]

            await tx.chatParticipant.createMany({
                data: participants,
            })

            return chat
        })

        const fullChat = await prismaClient.chat.findUnique({
            where: { id: newGroupChat.id },
            include: {
                participants: {
                    include: {
                        user: {
                            select: { id: true, name: true, photo: true }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                }
            }
        });

        return fullChat
    }
    async updateGroupDetails(chat_id: string, user_id: string, data: { name?: string; photo?: string }) {
        const participant = await prismaClient.chatParticipant.findUnique({
            where: {
                chat_id_user_id: {
                    chat_id,
                    user_id,
                },
            },
        });

        if (!participant || participant.role !== 'ADMIN') {
            throw new Error("Apenas administradores podem editar o grupo.");
        }

        const chat = await prismaClient.chat.findUnique({
            where: {
                id: chat_id,
            },
        });

        // 2. Atualiza os dados do chat
        const updatedChat = await prismaClient.chat.update({
            where: { id: chat_id },
            data: {
                name: data.name,
                photo: (data.photo === '') ? chat?.photo : data.photo
            },
            include: { // Retorna os dados completos para o broadcast
                participants: { include: { user: true } },
                messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            }
        });

        return updatedChat;
    }
    async updateGroupPhoto(file: MulterFile, chat_id: string) {
        return new Promise<{ filePath: string }>((resolve, reject) => {
            try {
                const fileExtension = file.originalname.split('.').pop();
                const filePath = `chats/photos/${chat_id}.${fileExtension}`;
                const blob = bucket.file(filePath);

                const blobStream = blob.createWriteStream({
                    metadata: {
                        contentType: file.mimetype,
                        cacheControl: 'public, max-age=31536000',
                    },
                });

                blobStream.on("error", (err) => {
                    reject(new Error("Erro no upload para o Firebase: " + err.message));
                });

                blobStream.on("finish", async () => {
                    // Torar o arquivo publico
                    blob.makePublic()
                        .then(() => {
                            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
                            resolve({ filePath: publicUrl })
                        })
                        .catch((err) => {
                            reject(new Error("Não foi possível tornar o arquivo público: " + err.message));
                        });
                });


                blobStream.end(file.buffer);
            } catch (err) {
                if (err instanceof Error) {
                    reject(new Error("Erro interno: " + err.message));
                } else {
                    reject(new Error("Erro interno desconhecido"));
                }
            }
        });
    }  

    async listUserChats(user_id: string) {
        // 1. Busca primeiro os registros de participação do usuário
        const participations = await prismaClient.chatParticipant.findMany({
            where: { user_id: user_id },
            include: {
                // 2. Para cada participação, inclui os dados completos do chat correspondente
                chat: {
                    include: {
                        participants: {
                            include: {
                                user: { select: { id: true, name: true, photo: true } }
                            }
                        },
                        messages: {
                            orderBy: { createdAt: 'desc' },
                            take: 1 // Pega a última mensagem para preview
                        }
                    }
                }
            },
            orderBy: {
                chat: {
                    updatedAt: 'desc'
                }
            }
        });

        // 3. Processa os dados para adicionar a propriedade 'firstUnreadMessageId'
        const chatsWithMarker = await Promise.all(
            participations.map(async (p) => {
                let firstUnreadMessageId: string | null = null;
                if (p.unreadCount > 0) {
                    // A lógica para encontrar a primeira não lida permanece a mesma
                    const firstUnread = await prismaClient.message.findFirst({
                        where: { chat_id: p.chat_id },
                        orderBy: { createdAt: 'desc' },
                        skip: p.unreadCount - 1,
                        take: 1,
                        select: { id: true }
                    });
                    firstUnreadMessageId = firstUnread?.id || null;
                }
                // Retorna o objeto do chat, com a contagem de não lidas e o ID do marcador
                return {
                    ...p.chat,
                    myUnreadCount: p.unreadCount,
                    firstUnreadMessageId: firstUnreadMessageId
                };
            })
        );

        return chatsWithMarker;
    }
    async listContacts(my_id: string) {
        const users = await prismaClient.user.findMany({
            where:{
                id: {
                    not: my_id
                },
                status: 'Ativo'
            },
            select:{
                id: true,
                name: true,
                department_id: true,
                department: {
                    select: {
                        name: true,
                        color: true
                    }
                }
            }, 
            orderBy: {
                name: 'asc'
            }
        })

        return users;
    }

    private async getFullChat(chatId: string) {
        return prismaClient.chat.findUnique({
            where: { id: chatId },
            include: {
                participants: { include: { user: true } },
                messages: { orderBy: { createdAt: 'desc' }, take: 1 }
            }
        });
    }
    async addParticipants(chat_id: string, admin_id: string, userIdsToAdd: string[]) {
        await verifyAdminPermission(chat_id, admin_id);

        const data = userIdsToAdd.map(user_id => ({
            chat_id: chat_id,
            user_id: user_id,
            role: Role.MEMBER
        }));

        await prismaClient.chatParticipant.createMany({
            data: userIdsToAdd.map(userId => ({ chat_id, user_id: userId, role: 'MEMBER' })),
            skipDuplicates: true,
        });
        return this.getFullChat(chat_id);
    }
    async removeParticipant(chat_id: string, admin_id: string, userIdToRemove: string) {
        await verifyAdminPermission(chat_id, admin_id);

        // Lógica de segurança para não remover o último admin
        const adminCount = await prismaClient.chatParticipant.count({ where: { chat_id: chat_id, role: 'ADMIN' } });
        const targetParticipant = await prismaClient.chatParticipant.findUnique({ where: { chat_id_user_id: { chat_id: chat_id, user_id: userIdToRemove } } });
        
        if (adminCount <= 1 && targetParticipant?.role === 'ADMIN') {
            throw new Error("Não é possível remover o último administrador do grupo.");
        }

        await prismaClient.chatParticipant.delete({
            where: { chat_id_user_id: { chat_id, user_id: userIdToRemove } }
        });
        return this.getFullChat(chat_id);
    }

    async updateParticipantRole(chat_id: string, admin_id: string, targetUserId: string, newRole: Role) {
        await verifyAdminPermission(chat_id, admin_id);

        const adminParticipant = await prismaClient.chatParticipant.findUnique({
            where: { chat_id_user_id: { chat_id: chat_id, user_id: admin_id } }
        });

        if (!adminParticipant || adminParticipant.role !== 'ADMIN') {
            throw new Error("Apenas administradores podem alterar permissões.");
        }

        if (adminParticipant.user_id === targetUserId && newRole === 'MEMBER') {
            const adminCount = await prismaClient.chatParticipant.count({
                where: { chat_id: chat_id, role: 'ADMIN' }
            });
            if (adminCount <= 1) {
                throw new Error("Não é possível remover o último administrador do grupo.");
            }
        }

        await prismaClient.chatParticipant.update({
            where: { chat_id_user_id: { chat_id, user_id: targetUserId } },
            data: { role: newRole }
        });
        return this.getFullChat(chat_id);
    }

    async markChatAsRead(user_id: string, chat_id: string) {
        return prismaClient.chatParticipant.update({
            where: {
                chat_id_user_id: { // Usa a chave única que definimos no schema
                    user_id: user_id,
                    chat_id: chat_id,
                },
            },
            data: {
                unreadCount: 0
            }
        });
    }
}