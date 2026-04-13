import { Router } from "express"
import { Server } from "socket.io";
import { ChatController } from "../controllers/chat/ChatController"
import { MessageController } from "../controllers/chat/MessageController"
import { isAuthenticated } from "../middlewares/isAuthenticated"
import multer from "multer"

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

export const chatRoutes = (io: Server, onlineUsers: Map<string, string>) => {
    const router = Router();
    
    // Instancia os controllers passando o que eles precisam
    const chatController = new ChatController(io, onlineUsers);
    const messageController = new MessageController();

    router.use(isAuthenticated);

    // Rotas de Chat
    router.get('/chat', new ChatController(io, onlineUsers).listUserChats);
    router.post('/chat/direct', new ChatController(io, onlineUsers).createDirectChat);

    router.post('/chat/group', new ChatController(io, onlineUsers).createGroupChat);
    router.post('/chat/:chat_id/group', upload.single('file'), chatController.updateGroupDetails); // Usamos PATCH, que é o método HTTP semanticamente correto para atualizações parciais
    router.post('/chat/:chat_id/participants', chatController.addParticipants);
    router.delete('/chat/participants', chatController.removeParticipant);
    router.patch('/chat/:chat_id/participants/:targetUserId/role', chatController.updateParticipantRole);
    
    // Rotas de Mensagem
    router.get('/chat/:chat_id/messages', new MessageController().getMessagesForChat);
    router.post('/chat/:chat_id/read', new ChatController(io, onlineUsers).markChatAsRead);

    // Rota de Contatos e Busca
    router.get('/chat/contacts', new ChatController(io, onlineUsers).listContacts);
    router.get('/messages/search', new MessageController().searchMessages);
    
    router.post('/chat/media', isAuthenticated, upload.single('file'), new MessageController().uploadMedia.bind(messageController) as any)
    router.get('/chat/media/link', isAuthenticated, new MessageController().getMedia.bind(messageController))
    
    return router;
}