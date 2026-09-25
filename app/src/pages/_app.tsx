import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import '../styles/global.css'

import { useAccessStoreSync } from "@modules/auth";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { FeatureFlagsProvider } from "../context/FeatureFlagsContext";
import { SessionTransitionScreen } from "@shared/components/SessionTransitionScreen";
import { SocketProvider } from '../context/SocketContext'
import { AppShell } from "../shared/components/newLayout/AppShell";

function AppLayout({ children, isIframeView = false }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useAccessStoreSync();
  const isPublicRoute =
    router.pathname === "/login" ||
    router.pathname === "/super-admin/login" ||
    router.pathname === "/" ||
    router.pathname === "/solicitar-acesso" ||
    router.pathname === "/redefinir-senha";

  useEffect(() => {
    if (isPublicRoute || loading || user) {
      return;
    }

    void router.push("/login");
  }, [isPublicRoute, loading, router, user]);

  // Se está na página de login ou index, não mostra layout
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Se está carregando ou não há usuário, mostra apenas children
  if (loading || !user) {
    return (
      <SessionTransitionScreen
        title="Trocando de ambiente"
        description="Estamos concluindo a transição da sua sessão para exibir os dados corretos da conta atual."
      />
    );
  }

  return (
    <AppShell isIframeView={isIframeView}>
      {children}
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
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
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
          <FeatureFlagsProvider>
            <SocketProvider>
              <AppLayout isIframeView={isIframeView}>
                <Component {...pageProps} />
              </AppLayout>
              {/* No topo: embaixo à direita os toasts cobriam o "Salvar" de formulários e modais (#1364). */}
              <ToastContainer
                position="top-center"
                autoClose={5000}
                pauseOnHover
                closeOnClick={false}
              />
            </SocketProvider>
          </FeatureFlagsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </>
  );
}

export default MyApp;
