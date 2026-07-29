import { getAuthTokenValue } from "@modules/auth/utils/authHeaders";
import { parseCookies } from "nookies";
import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

import { getSocketClientConfig } from "./socketConfig";
import { useAuth } from "./AuthContext";

interface SocketContextType {
  socket: Socket | null;
}

const socketClientConfig = getSocketClientConfig();

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const closeCurrentSocket = () => {
      setSocket((currentSocket) => {
        currentSocket?.close();

        return null;
      });
    };

    if (!socketClientConfig.enabled) {
      closeCurrentSocket();
      return;
    }

    if (isAuthenticated) {
      const { "cw.token": token } = parseCookies();
      const authToken = getAuthTokenValue(token);

      if (!authToken) {
        closeCurrentSocket();
        return;
      }

      const newSocket = io(socketClientConfig.url, { auth: { token: authToken } });
      setSocket(newSocket);

      return () => {
        newSocket.close();
        setSocket((currentSocket) => (currentSocket === newSocket ? null : currentSocket));
      };
    }

    closeCurrentSocket();
  }, [isAuthenticated]);

  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket deve ser usado dentro de um SocketProvider");
  }
  return context;
};
