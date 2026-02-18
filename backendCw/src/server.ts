// Importações do Express e da sua aplicação
import express, { Request, Response, NextFunction } from "express";
import 'express-async-errors';
import cors from 'cors';
import { ChatController } from "./controllers/chat/ChatController";
import { router } from "./routes";
import { chatRoutes } from "./routes/chat.routes";

require('dotenv').config();
import prismaClient from "./prisma"; // Assumindo que você exporta o prismaClient daqui

// Importações para o Servidor Híbrido e Socket.IO
import http from 'http';
import { Server, Socket } from 'socket.io'; // Importando o tipo Socket
import { verify } from 'jsonwebtoken';

// Importe seu serviço de mensagem que criamos
import { MessageService } from "./services/chat/MessageService";

// Interface para adicionar tipagem forte ao nosso socket autenticado
interface SocketWithAuth extends Socket {
    user_id?: string;
}

// --- CONFIGURAÇÃO DO EXPRESS ---
const app = express();

// --- CONFIGURAÇÃO DE CORS PARA AMBOS OS AMBIENTES (LOCAL E PRODUÇÃO) ---

// 1. Crie uma "lista branca" de origens permitidas
const allowedOrigins = [
    'https://frontend-cw.vercel.app', // Sua URL de produção
    'http://localhost:3000',         // Sua URL de desenvolvimento local
    'http://192.168.1.81:3000',         
];

const corsOptions = {
    // 2. A opção 'origin' agora verifica se a requisição veio de uma das URLs da lista
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        // Permite requisições sem 'origin' (como o Postman ou apps mobile)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'A política de CORS para este site não permite acesso da sua Origem.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

// Aplica as opções
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());

// --- CRIAÇÃO DO SERVIDOR HÍBRIDO ---
const server = http.createServer(app);

// --- CONFIGURAÇÃO DO SOCKET.IO ---
const io = new Server(server, {
    cors: {
        origin: "*", // Em produção, mude para o seu domínio
        methods: ["GET", "POST"]
    }
});

// --- LÓGICA DE RASTREAMENTO DE USUÁRIOS ONLINE ---
const onlineUsers = new Map<string, string>();

// --- MIDDLEWARE DE AUTENTICAÇÃO DO SOCKET.IO (A PEÇA QUE FALTAVA) ---
io.use((socket: SocketWithAuth, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error('Authentication error: Token not provided.'));
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error("FATAL: JWT_SECRET não está definido no arquivo .env");
        return next(new Error('Internal server configuration error.'));
    }

    try {
        const payload = verify(token, secret) as { sub: string };
        socket.user_id = payload.sub; // Anexa o ID do usuário ao socket
        next();
    } catch (err) {
        if (err instanceof Error) {
            return next(new Error('Authentication error: ' + err.message));
        }
        return next(new Error('Authentication error: An unknown error occurred.'));
    }
});

// --- LÓGICA DE CONEXÃO DO SOCKET.IO (UM ÚNICO BLOCO) ---
io.on('connection', (socket: SocketWithAuth) => {
    const user_id = socket.user_id;

    if (!user_id) {
        console.error("Conexão estabelecida, mas ID do usuário não encontrado no socket. Desconectando.");
        socket.disconnect();
        return;
    }

    console.log(`✅ Usuário ONLINE: ${user_id}`);
    onlineUsers.set(user_id, socket.id); // Adiciona ao mapa de usuários online


    socket.broadcast.emit('user_online', { user_id });

    socket.emit('update_online_list', Array.from(onlineUsers.keys()));

    // Faz o usuário entrar nas salas de chat correspondentes
    const subscribeToChats = async () => {
        try {
            const chats = await prismaClient.chat.findMany({
                where: { participants: { some: { user_id: user_id } } },
                select: { id: true }
            });

            chats.forEach(chat => {
                socket.join(chat.id);
                console.log(`Socket ${socket.id} (Usuário: ${user_id}) entrou na sala (room) ${chat.id}`);
            });
        } catch (error) {
            console.error(`Erro ao inscrever o socket ${socket.id} nas salas de chat:`, error);
        }
    };
    subscribeToChats();

    // Listener para quando o cliente envia uma mensagem

    socket.on('sendMessage', async (payload) => {
        const sender_id = socket.user_id;
        if (!sender_id) return;

        const { chat_id, content, fileUrl, type } = payload;

        console.log(`BACKEND: Recebido evento "sendMessage" do usuário ${sender_id} para o chat ${chat_id}`);

        try {
            // Usa o MessageService para criar a mensagem no banco
            const messageService = new MessageService();
            const newMessage = await messageService.createMessage({
                sender_id,
                chat_id,
                content: content || null, // Garante que seja null se não for enviado
                fileUrl: fileUrl || null,
                type: type || 'TEXT',
            });

            // Transmite a mensagem salva para todos os clientes na mesma sala
            io.to(chat_id).emit('newMessage', newMessage);
            console.log(`BACKEND: Mensagem (tipo: ${newMessage.type}) retransmitida para a sala ${chat_id}`);

            // INCREMENTA O CONTADOR PARA OS OUTROS MEMBROS
            await prismaClient.chatParticipant.updateMany({
                where: {
                    chat_id: chat_id,
                    user_id: { not: sender_id }
                },
                data: {
                    unreadCount: {
                        increment: 1
                    }
                }
            });

        } catch (error) {
            console.error(`Erro ao processar 'sendMessage' do socket ${socket.id}:`, error);
        }
    });

    socket.on('deleteMessage', async ({ messageId }) => {
        const userId = socket.user_id;
        if (!userId) return;

        try {
            const message = await prismaClient.message.findUnique({ where: { id: messageId } });

            // Validações de segurança
            if (!message || message.sender_id !== userId) {
                // Não faz nada se a mensagem não existe ou o usuário não é o dono
                return;
            }
            // Valida o tempo (5 minutos = 300000 milissegundos)
            if (new Date().getTime() - message.createdAt.getTime() > 300000) {
                // Não faz nada se já passaram 5 minutos
                return;
            }

            // "Deleta" a mensagem (na verdade, atualiza o tipo e o conteúdo)
            const deletedMessage = await prismaClient.message.update({
                where: { id: messageId },
                data: {
                    type: 'DELETED',
                    content: 'Mensagem apagada'
                }
            });

            // Notifica todos na sala que a mensagem foi "deletada"
            io.to(message.chat_id).emit('messageDeleted', { 
                chatId: message.chat_id, 
                messageId: message.id 
            });

        } catch (error) {
            console.error("Erro ao deletar mensagem:", error);
        }
    });

    // --- NOVO LISTENER: EDITAR MENSAGEM ---
    socket.on('editMessage', async ({ messageId, newContent }) => {
        const userId = socket.user_id;
        if (!userId || !newContent.trim()) return;

        try {
            const message = await prismaClient.message.findUnique({ where: { id: messageId } });

            if (!message || message.sender_id !== userId) return;
            if (new Date().getTime() - message.createdAt.getTime() > 300000) return;

            // Atualiza a mensagem com o novo conteúdo
            const updatedMessage = await prismaClient.message.update({
                where: { id: messageId },
                data: {
                    content: newContent,
                    isEdited: true
                },
                include: { sender: true } // Inclui o remetente para a notificação
            });

            // Notifica todos na sala que a mensagem foi atualizada
            io.to(message.chat_id).emit('messageUpdated', updatedMessage);

        } catch (error) {
            console.error("Erro ao editar mensagem:", error);
        }
    });

    // Listener para entrar em uma nova sala após a criação do chat
    socket.on('joinRoom', (chat_id: string) => {
        socket.join(chat_id);
        console.log(`Socket ${socket.id} (Usuário: ${user_id}) foi adicionado à nova sala ${chat_id}`);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Usuário OFFLINE: ${user_id}`);
        onlineUsers.delete(user_id);
        socket.broadcast.emit('user_offline', { user_id });
    });
});

app.use(router);
app.use('', chatRoutes(io, onlineUsers));

// --- MIDDLEWARE DE ERRO DO EXPRESS ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof Error) {
        return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
server.listen(3333, () => console.log('🚀 Server is running on port 3333'));