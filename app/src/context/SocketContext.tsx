import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { parseCookies } from 'nookies';
import { getAuthTokenValue } from '@modules/auth/utils/authHeaders';
import { canUseOrganizationChat } from '../modules/chat/utils/chatAvailability';

interface SocketContextType {
    socket: Socket | null;
}

const SocketContext = createContext<SocketContextType | null>(null);

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3334';

export const SocketProvider = ({ children }: { children: ReactNode }) => {
    const { user, isAuthenticated } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const canUseChatSocket = isAuthenticated && canUseOrganizationChat(user);

    
    useEffect(() => {
        if (!canUseChatSocket) {
            setSocket((currentSocket) => {
                currentSocket?.close();
                return null;
            });
            return;
        }

        const { 'cw.token': token } = parseCookies();
        const authToken = getAuthTokenValue(token);

        if (!authToken) {
            setSocket((currentSocket) => {
                currentSocket?.close();
                return null;
            });
            return;
        }

        const newSocket = io(SOCKET_URL, { auth: { token: authToken } });
        setSocket(newSocket);

        return () => { newSocket.close(); };
    }, [canUseChatSocket]);
    
    return (
        <SocketContext.Provider value={{ socket }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket deve ser usado dentro de um SocketProvider');
    }
    return context;
};
