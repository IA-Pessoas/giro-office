import { Request, Response } from "express"
import { Server } from 'socket.io';
import { ChatService } from "../../services/chat/ChatService"

export class ChatController {
    private io: Server;
    private onlineUsers: Map<string, string>;

    // Recebe o 'io' e o mapa de usuários no construtor
    constructor(io: Server, onlineUsers: Map<string, string>) {
        this.io = io;
        this.onlineUsers = onlineUsers;
    }

    public createDirectChat = async (req: Request, res: Response): Promise<void> => {
        const user_id_1 = req.user_id
        const { user_id_2 } = req.body

        if (!user_id_2)
            throw new Error('O ID do usuário 2 é obrigatório')

        const chatService = new ChatService()
        const chat = await chatService.createDirectChat(user_id_1, user_id_2)

        res.json(chat)
    }

    public createGroupChat = async (req: Request, res: Response): Promise<void> => {
        const { name, member_ids } = req.body
        const creator_id = req.user_id

        const chatService = new ChatService()
        const chat = await chatService.createGroupChat({ creator_id, name, member_ids })

        if (!chat) {
            throw new Error("Não foi possível criar o grupo de chat.");
        }

        // --- LÓGICA DE NOTIFICAÇÃO EM TEMPO REAL ---
        chat.participants.forEach(participant => {
            if (participant.user_id === creator_id) return;
            const memberSocketId = this.onlineUsers.get(participant.user_id);
            if (memberSocketId) {
                console.log(`Notificando membro ${participant.user_id} sobre o novo grupo ${chat.id}`);
                const memberSocket = this.io.sockets.sockets.get(memberSocketId);
                if (memberSocket) {
                    memberSocket.join(chat.id);
                    this.io.to(memberSocketId).emit('newGroupChat', chat);
                }
            }
        });

        res.json(chat)
    }
    public updateGroupDetails = async (req: Request, res: Response) => {
        const user_id = req.user_id;
        const { chat_id } = req.params;
        const { name } = req.body;
        const file = req.file;
      
        let photo: string = "";

        const chatService = new ChatService();

        if (file) {
          const uploadResult = await chatService.updateGroupPhoto(file, chat_id);
          photo = uploadResult.filePath;
        }

        const updatedChat = await chatService.updateGroupDetails(chat_id, user_id, { name, photo });

        this.io.to(chat_id).emit('groupDetailsUpdated', updatedChat);

        return res.json(updatedChat);
    }
    public addParticipants = async (req: Request, res: Response) => {
        const admin_id = req.user_id;
        const { chat_id } = req.params;
        const { userIdsToAdd } = req.body;

        const chatService = new ChatService();
        const updatedChat = await chatService.addParticipants(chat_id, admin_id, userIdsToAdd);

        if (!updatedChat) {
            throw new Error("Não foi possível adicionar participantes ao chat.");
        }
        // Notifica os membros existentes e os novos sobre a adição
        console.log(`BACKEND: Emitindo 'membersAdded' para a sala ${chat_id}`);
        this.io.to(chat_id).emit('chat_updated', updatedChat);      
        // Inscreve os novos membros na sala do socket e notifica que foram adicionados
        userIdsToAdd.forEach((user_id: string) => {
            const socketId = this.onlineUsers.get(user_id);
            if(socketId) {
                const socket = this.io.sockets.sockets.get(socketId);
                socket?.join(chat_id);
                this.io.to(socketId).emit('addedToNewGroup', updatedChat);
            }
        });

        return res.json(updatedChat);
    }
    public removeParticipant = async (req: Request, res: Response) => {
        const admin_id = req.user_id;
        const { chat_id, user_id_to_remove  } = req.body;

        const chatService = new ChatService();
        
        console.log("Valor extraído de user_id_to_remove:", user_id_to_remove);
        // Notifica todos na sala que um membro foi removido
        const updatedChat = await chatService.removeParticipant(chat_id, admin_id, user_id_to_remove);
        if (!updatedChat) 
            throw new Error("Não foi possível remover o membro do grupo.");

        console.log(`BACKEND: Emitindo 'memberRemoved' para a sala ${chat_id}`);
        this.io.to(chat_id).emit('chat_updated', updatedChat);

        // Força o usuário removido a sair da sala
        const removedSocketId = this.onlineUsers.get(user_id_to_remove);
        if (removedSocketId) {
            const removedSocket = this.io.sockets.sockets.get(removedSocketId);
            removedSocket?.leave(chat_id);
            this.io.to(removedSocketId).emit('removedFromGroup', { chat_id });
        }

        return res.status(200).send();
    }
    public updateParticipantRole = async (req: Request, res: Response) => {
        const admin_id = req.user_id;
        const { chat_id, targetUserId } = req.params;
        const { role } = req.body;

        const chatService = new ChatService();
        await chatService.updateParticipantRole(chat_id, admin_id, targetUserId, role);
        
        // Notifica todos na sala sobre a mudança de permissão
        const updatedChat = await chatService.updateParticipantRole(chat_id, admin_id, targetUserId, role);
        console.log(`BACKEND: Emitindo 'memberRoleUpdated' para a sala ${chat_id}`);
        this.io.to(chat_id).emit('chat_updated', updatedChat);

        return res.status(200).send();
    }

    public listUserChats = async (req: Request, res: Response): Promise<void> => {
        const user_id = req.user_id

        const chatService = new ChatService()
        const chats = await chatService.listUserChats(user_id)

        res.json(chats)
    }

    public listContacts = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id

        const chatService = new ChatService()

        const users = await chatService.listContacts(my_id)

        response.json(users)
    }

    public markChatAsRead = async (req: Request, res: Response) => {
        const user_id = req.user_id;
        const { chat_id } = req.params;
        const chatService = new ChatService();
        await chatService.markChatAsRead(user_id, chat_id);
        return res.status(204).send();
    }
}