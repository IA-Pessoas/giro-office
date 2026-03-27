import { useState, useEffect } from "react";
import type { AppProps } from "next/app";
import { useRouter } from 'next/router';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import '../styles/global.css'

import { AuthProvider, useAuth } from "../context/AuthContext";
import { ChatProvider } from "@modules/chat";
import { ChatControllerUI } from '@shared/components/ChatControllerUI';
import { SocketProvider } from '../context/SocketContext'
import { AppShell } from "../shared/components/newLayout/AppShell";

function AppLayout({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();

  // Se está na página de login ou index, não mostra layout
  if (
    router.pathname === "/login" ||
    router.pathname === "/" ||
    router.pathname === "/solicitar-acesso"
  ) {
    return <>{children}</>;
  }

  // Se está carregando ou não há usuário, mostra apenas children
  if (loading || !user) {
    return <>{children}</>;
  }

  return (
    <AppShell>
      {children}
      <ChatControllerUI
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </AppShell>
  );
}

function ThemeBridge() {
  useEffect(() => {
    const storedWorkspaceTheme = localStorage.getItem("workspace-theme");
    const storedLegacyTheme = localStorage.getItem("chakra-ui-color-mode");

    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const initialTheme =
      storedWorkspaceTheme === "dark" || storedWorkspaceTheme === "light"
        ? storedWorkspaceTheme
        : storedLegacyTheme === "dark" || storedLegacyTheme === "light"
          ? storedLegacyTheme
          : prefersDark
            ? "dark"
            : "light";

    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(initialTheme);

    // Compatibility while we migrate old overrides: keep `data-theme` in sync too.
    root.setAttribute("data-theme", initialTheme);

    localStorage.setItem("workspace-theme", initialTheme);
  }, []);

  return null;
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter(); // 2. Use o hook do router

  // 3. Verifique se o parâmetro `view=iframe` está na URL
  const isIframeView = router.query.view === 'iframe';

  return (
    <>
      <ThemeBridge />
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
    </>
  );
}

export default MyApp;