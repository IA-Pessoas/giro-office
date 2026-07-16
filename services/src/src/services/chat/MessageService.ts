import prismaClient from "../../prisma"
import { bucket } from '../../config/firebase'; // Importa a configuração do Firebase

type MulterFile = Express.Multer.File;

interface GetMessagesRequest {
    chat_id: string
    user_id: string
    limit?: number
    page?: number
}
interface CreateRequest {
    sender_id: string
    chat_id: string
    content?: string
    fileUrl?: string
    type: 'TEXT' | 'IMAGE' | 'AUDIO'
}
export class MessageService {
    async createMessage({ sender_id, chat_id, content, fileUrl, type }: CreateRequest) {
        const participant = await prismaClient.chatParticipant.findFirst({
            where: {
                chat_id,
                user_id: sender_id,
            },
        })

        if (!participant)
            throw new Error('Você não está no chat')

        const message = await prismaClient.message.create({
            data: {
                content,
                fileUrl,
                type,
                chat_id,
                sender_id,
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        })

        await prismaClient.chat.update({
            where: { id: chat_id },
            data: { updatedAt: new Date() },
        })

        return message
    }

    async getMessagesForChat({ chat_id, user_id, limit = 50, page = 1 }: GetMessagesRequest) {
        const participant = await prismaClient.chatParticipant.findFirst({ where: { chat_id, user_id }})
        if (!participant)
            throw new Error('Você não está no chat')

        const pageNumber = Number(page)
        const limitNumber = Number(limit)
        const skip = (pageNumber - 1) * limitNumber
        
        console.log(`BACKEND: Buscando mensagens para chat ${chat_id} - Página: ${pageNumber}, Limite: ${limitNumber}, Pular: ${skip}`);

        const [messages, total] = await prismaClient.$transaction([
            prismaClient.message.findMany({
                where: { chat_id },
                take: Number(limit),
                skip: skip,
                orderBy: { createdAt: 'desc' },
                include: {
                    sender: {
                        select: { id: true, name: true },
                    },
                },
            }),
            prismaClient.message.count({ where: { chat_id } }),
        ])

        return { messages, total }
    }

    async searchMessages(user_id: string, query: string) {
        if (!query)
            return []

        const cleanedQuery = query.replace(/[\p{P}\p{S}]/gu, '')
        const trimmedQuery = cleanedQuery.trim().replace(/\s+/g, ' ')
        const formattedQuery = trimmedQuery.split(' ').join(' & ')
        console.log(`Busca original: "${query}" | Query formatada para FTS: "${formattedQuery}"`);
    
        const userChats = await prismaClient.chat.findMany({
            where: { participants: { some: { user_id } } },
            select: { id: true },
        })

        const chats_ids = userChats.map(chat => chat.id)
        if (chats_ids.length === 0)
            return []

        const messages = await prismaClient.message.findMany({
            where: {
                chat_id: { in: chats_ids },
                content: { search: formattedQuery }, // prepara para buscar todas as palavras
            },
            include: {
                sender: { select: { id: true, name: true } },
                chat: { select: { id: true, name: true } }
            },
            orderBy: { 
              _relevance: {
                fields: ['content'],
                search: formattedQuery,
                sort: 'desc'
              }  
            },
        })

        return messages
    }

    async uploadMedia(file: MulterFile, chat_id: string) {
        return new Promise<{ filePath: string }>((resolve, reject) => {
            try {
                const filePath = `chats/${chat_id}/${Date.now()}_${file.originalname}`;
                const blob = bucket.file(filePath);

                const blobStream = blob.createWriteStream({
                    metadata: {
                        contentType: file.mimetype,
                    },
                });

                blobStream.on("finish", async () => {
                    resolve({ filePath });
                });

                blobStream.on("error", (err) => {
                    reject(new Error("Erro no upload para o Firebase: " + err.message));
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
}