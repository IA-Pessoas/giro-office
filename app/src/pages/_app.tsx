import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import '../styles/global.css'

import { AuthProvider, useAuth } from "../context/AuthContext";
import { ChatProvider } from "@modules/chat";
import { ChatControllerUI } from '@shared/components/ChatControllerUI';
import { SessionTransitionScreen } from "@shared/components/SessionTransitionScreen";
import { SocketProvider } from '../context/SocketContext'
import { AppShell } from "../shared/components/newLayout/AppShell";

function AppLayout({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();
  const isPublicRoute =
    router.pathname === "/login" ||
    router.pathname === "/" ||
    router.pathname === "/solicitar-acesso";

  // Se está na página de login ou index, não mostra layout
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Se está carregando ou não há usuário, mostra apenas children
  if (loading || !user) {
    return (
      <SessionTransitionScreen
        title="Trocando de ambiente"
        description="Estamos concluindo a transicao da sua sessao para exibir os dados corretos da conta atual."
      />
    );
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
    localStorage.setItem("chakra-ui-color-mode", initialTheme);
  }, []);

  return null;
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  const isIframeView = router.query.view === "iframe";

  return (
    <>
      <ThemeBridge />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SocketProvider>
            <ChatProvider>
              {isIframeView ? (
                <Component {...pageProps} />
              ) : (
                <AppLayout>
                  <Component {...pageProps} />
                </AppLayout>
              )}
              <ToastContainer
                position="bottom-right"
                autoClose={5000}
                pauseOnHover
                closeOnClick={false}
              />
            </ChatProvider>
          </SocketProvider>
        </AuthProvider>
      </QueryClientProvider>
    </>
  );
}

export default MyApp;
