import { useState, useEffect } from "react";
import type { AppProps } from "next/app";
import { useRouter } from 'next/router';
import { ChakraProvider, Box, Flex } from '@chakra-ui/react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import '../styles/global.css'
import theme from '../styles/theme'

import { AuthProvider, useAuth } from "../context/AuthContext";
import { ChatProvider, useChat } from "../context/ChatContext";
import { ChatControllerUI } from '../components/layout/ChatControllerUI'; // O controlador do Overlay
import { SocketProvider } from '../context/SocketContext'
import Navbar from "@shared/components/sidebar";

function AppLayout({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();

  // Se está na página de login ou index, não mostra layout
  if (router.pathname === '/login' || router.pathname === '/') {
    return <>{children}</>;
  }

  // Se está carregando ou não há usuário, mostra apenas children
  if (loading || !user) {
    return <>{children}</>;
  }

  return (
    <Flex>
      <Navbar modulo='castelo' cargo={user.permission} onChatOpen={() => setIsChatOpen(true)} />
      
      <Box 
        className='main' 
        flex="1"
        // Deixa o espaço para a Navbar na esquerda em telas de desktop
        pl={{ base: 0, md: '0px' }}
      >
        {children} {/* Aqui é onde o conteúdo da sua página será renderizado */}
      </Box>

      {/* 4. O Overlay do chat também é controlado pelo estado do Layout */}
      <ChatControllerUI
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </Flex>
  );
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter(); // 2. Use o hook do router

  // 3. Verifique se o parâmetro `view=iframe` está na URL
  const isIframeView = router.query.view === 'iframe';

  return (
    <ChakraProvider theme={theme}>
      <AuthProvider>
        <SocketProvider>
          <ChatProvider>
            {/* 4. Lógica condicional: Se for a visão de iframe, renderiza só o componente.
                Senão, renderiza o Layout completo com o componente dentro. */}
            {isIframeView ? (
              <Component {...pageProps} />
            ) : (
              <AppLayout>
                <Component {...pageProps} />
              </AppLayout>
            )}
            <ToastContainer position="bottom-right" autoClose={2000} />
          </ChatProvider>
        </SocketProvider>
      </AuthProvider>
    </ChakraProvider>
  );
}

export default MyApp;