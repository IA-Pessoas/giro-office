import dotenv from 'dotenv';
import path from 'path';

const rootEnvPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: rootEnvPath });
import express, { Request, Response, NextFunction } from "express";
import 'express-async-errors';
import cors from 'cors';
import { ChatController } from "./controllers/chat/ChatController";
import { router } from "./routes";
import { chatRoutes } from "./routes/chat.routes";

import prismaClient from "./prisma";

import http from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

import { MessageService } from "./services/chat/MessageService";
import { error as logError, info as logInfo } from "@workspace/shared";

interface SocketWithAuth extends Socket {
    user_id?: string;
    organization_id?: string;
}

const app = express();

const allowedOrigins = [
    'https://frontend-cw.vercel.app',
    'http://localhost:3000',
    'http://192.168.1.81:3000',         
];

const corsOptions = {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
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

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const onlineUsers = new Map<string, string>();

io.use((socket: SocketWithAuth, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error('Authentication error: Token not provided.'));
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        logError("JWT_SECRET não está definido no arquivo .env", { type: "fatal" });
        return next(new Error('Internal server configuration error.'));
    }

    try {
        const payload = jwt.verify(token, secret) as { sub: string; organization_id?: string };
        socket.user_id = payload.sub;
        socket.organization_id = payload.organization_id;
        next();
    } catch (err) {
        if (err instanceof Error) {
            return next(new Error('Authentication error: ' + err.message));
        }
        return next(new Error('Authentication error: An unknown error occurred.'));
    }
});

io.on('connection', (socket: SocketWithAuth) => {
    const user_id = socket.user_id;

    if (!user_id) {
        logError("Conexão estabelecida, mas ID do usuário não encontrado no socket. Desconectando.", { socket_id: socket.id });
        socket.disconnect();
        return;
    }

    logInfo(`Usuário ONLINE: ${user_id}`, { user_id, socket_id: socket.id });
    onlineUsers.set(user_id, socket.id);

    socket.broadcast.emit('user_online', { user_id });

    socket.emit('update_online_list', Array.from(onlineUsers.keys()));

    const subscribeToChats = async () => {
        try {
            const chats = await prismaClient.chat.findMany({
                where: { participants: { some: { user_id: user_id } } },
                select: { id: true }
            });

            chats.forEach(chat => {
                socket.join(chat.id);
                logInfo(`Socket entrou na sala`, { socket_id: socket.id, user_id, chat_id: chat.id });
            });
        } catch (error) {
            logError(`Erro ao inscrever o socket nas salas de chat`, { socket_id: socket.id, error });
        }
    };
    subscribeToChats();

    socket.on('sendMessage', async (payload) => {
        const sender_id = socket.user_id;
        if (!sender_id) return;

        const { chat_id, content, fileUrl, type } = payload;

        logInfo("Recebido evento sendMessage", { sender_id, chat_id, type });

        try {
            const messageService = new MessageService();
            const newMessage = await messageService.createMessage({
                sender_id,
                chat_id,
                content: content || null,
                fileUrl: fileUrl || null,
                type: type || 'TEXT',
            });

            io.to(chat_id).emit('newMessage', newMessage);
            logInfo("Mensagem retransmitida para a sala", { chat_id, message_type: newMessage.type, message_id: newMessage.id });

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
            logError("Erro ao processar sendMessage", { socket_id: socket.id, error });
        }
    });

    socket.on('deleteMessage', async ({ messageId }) => {
        const userId = socket.user_id;
        if (!userId) return;

        try {
            const message = await prismaClient.message.findUnique({ where: { id: messageId } });

            if (!message || message.sender_id !== userId) {
                return;
            }
            if (new Date().getTime() - message.createdAt.getTime() > 300000) {
                return;
            }

            const deletedMessage = await prismaClient.message.update({
                where: { id: messageId },
                data: {
                    type: 'DELETED',
                    content: 'Mensagem apagada'
                }
            });

            io.to(message.chat_id).emit('messageDeleted', { 
                chatId: message.chat_id, 
                messageId: message.id 
            });

        } catch (error) {
            logError("Erro ao deletar mensagem", { error });
        }
    });

    socket.on('editMessage', async ({ messageId, newContent }) => {
        const userId = socket.user_id;
        if (!userId || !newContent.trim()) return;

        try {
            const message = await prismaClient.message.findUnique({ where: { id: messageId } });

            if (!message || message.sender_id !== userId) return;
            if (new Date().getTime() - message.createdAt.getTime() > 300000) return;

            const updatedMessage = await prismaClient.message.update({
                where: { id: messageId },
                data: {
                    content: newContent,
                    isEdited: true
                },
                include: { sender: true }
            });

            io.to(message.chat_id).emit('messageUpdated', updatedMessage);

        } catch (error) {
            logError("Erro ao editar mensagem", { error });
        }
    });

    socket.on('joinRoom', (chat_id: string) => {
        socket.join(chat_id);
        logInfo("Socket adicionado à nova sala", { socket_id: socket.id, user_id, chat_id });
    });

    socket.on('disconnect', () => {
        logInfo(`Usuário OFFLINE: ${user_id}`, { user_id, socket_id: socket.id });
        onlineUsers.delete(user_id);
        socket.broadcast.emit('user_offline', { user_id });
    });
});

app.use(router);
app.use('', chatRoutes(io, onlineUsers));

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof Error) {
        return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
});

const PORT = 3333;
server.listen(PORT, () => {
  logInfo("Server is running", { port: PORT });
});
server.on('error', (err) => {
  logError("Server error", { error: err });
});