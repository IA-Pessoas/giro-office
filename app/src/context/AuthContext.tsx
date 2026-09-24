import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Router from "next/router";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { MODULE_KEYS } from "@modules/auth/utils/moduleAccess";
import { SessionTransitionScreen } from "@shared/components/SessionTransitionScreen";
import { api } from "@shared/services/apiClient";
import { platformApi } from "@shared/services/api";
import { ME_QUERY_KEY } from "@shared/hooks";
import {
    createAuthInvalidationHandler,
    invalidateAuthSession,
    registerAuthInvalidationHandler,
} from "./authInvalidation";
import { clearPlatformQueryCache } from "./platformQueryCache";

interface UserProps {
    id: string;
    name: string;
    login: string;
    email?: string;
    permission: number;
    department_id?: string;
    organization_id?: string | null;
    type?: "owner" | "admin" | "user" | null;
    modules?: Record<string, number>;
    /** Permissão específica que autoriza decidir conclusões de tarefa no nível 2. */
    task_completion?: boolean;
    auth_kind?: "organization" | "platform";
    platform_role?: "super_admin";
    can_impersonate?: boolean;
}

interface SignInProps {
    login: string;
    password: string;
}

interface PlatformSignInProps {
    email: string;
    password: string;
}

interface AuthContextData {
    user: UserProps | null;
    isAuthenticated: boolean;
    signIn: (credentials: SignInProps) => Promise<void>;
    signInPlatform: (credentials: PlatformSignInProps) => Promise<void>;
    logoutUser: () => Promise<void>;
    logoutPlatform: () => Promise<void>;
    refreshSession: () => Promise<UserProps | null>;
    refreshPlatformSession: () => Promise<UserProps | null>;
    loading: boolean;
}

type AuthProviderProps = {
    children: ReactNode;
};

export const AuthContext = createContext({} as AuthContextData);
const SESSION_TRANSITION_MIN_DURATION_MS = 380;
const AUTH_DIAGNOSTIC_LOGS_ENABLED = process.env.NODE_ENV !== "production";
const REGULARIZE_QUERY_ROOT = ["regularize"] as const;

function clearRegularizeQueryCache(queryClient: ReturnType<typeof useQueryClient>) {
    queryClient.removeQueries({ queryKey: REGULARIZE_QUERY_ROOT });
}

function logAuthError(message: string, details?: unknown) {
    if (!AUTH_DIAGNOSTIC_LOGS_ENABLED) {
        return;
    }

    if (details === undefined) {
        console.error(message);
        return;
    }

    console.error(message, details);
}

function wait(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function isValidAuthUser(data: unknown): data is UserProps {
    return !!data &&
        typeof data === "object" &&
        typeof (data as UserProps).id === "string" &&
        typeof (data as UserProps).name === "string" &&
        typeof (data as UserProps).login === "string" &&
        typeof (data as UserProps).permission === "number";
}

function isValidPlatformUser(data: unknown): data is UserProps {
    return !!data &&
        typeof data === "object" &&
        typeof (data as UserProps).id === "string" &&
        typeof (data as UserProps).name === "string" &&
        typeof (data as UserProps).email === "string" &&
        (data as UserProps).auth_kind === "platform" &&
        (data as UserProps).platform_role === "super_admin" &&
        typeof (data as UserProps).can_impersonate === "boolean";
}

function buildCurrentUser(
    data: UserProps,
    fallbackModules?: Record<string, number> | null,
): UserProps {
    const sourceModules = data.modules ?? fallbackModules ?? {};
    const modules = MODULE_KEYS.reduce<Record<string, number>>((acc, moduleKey) => {
        const value = sourceModules[moduleKey];
        acc[moduleKey] = value === 0 || value === 1 || value === 2 || value === 3 ? value : 0;
        return acc;
    }, {});

    return {
        id: data.id,
        name: data.name,
        login: data.login,
        permission: data.permission,
        department_id: typeof data.department_id === "string" ? data.department_id : undefined,
        organization_id: typeof data.organization_id === "string" ? data.organization_id : null,
        type:
            data.type === "owner" || data.type === "admin" || data.type === "user"
                ? data.type
                : null,
        modules,
        auth_kind: "organization",
    };
}

function buildPlatformUser(data: UserProps): UserProps {
    return {
        id: data.id,
        name: data.name,
        login: data.email ?? "",
        email: data.email,
        permission: 0,
        organization_id: null,
        type: null,
        modules: {},
        auth_kind: "platform",
        platform_role: "super_admin",
        can_impersonate: data.can_impersonate,
    };
}

function isAccessDenied(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const status = (error as { response?: { status?: unknown } }).response?.status;
    return status === 401 || status === 403;
}

export function signOut(message = "Sessão expirada. Faça login novamente.") {
    try {
        invalidateAuthSession();
        toast.error(message, {
            toastId: "auth-session-expired",
        });
        void Router.push("/login");
    } catch (error) {
        logAuthError("Erro ao deslogar", error);
    }
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<UserProps | null>(null);
    const isAuthenticated = !!user;
    const [loading, setLoading] = useState(true);
    const authRequestVersionRef = useRef(0);
    const queryClient = useQueryClient();

    function beginAuthTransition() {
        authRequestVersionRef.current += 1;
        return authRequestVersionRef.current;
    }

    function isCurrentAuthTransition(version: number) {
        return authRequestVersionRef.current === version;
    }

    useEffect(() => {
        return registerAuthInvalidationHandler(
            createAuthInvalidationHandler({
                invalidateRequests: () => {
                    authRequestVersionRef.current += 1;
                },
                clearUser: () => setUser(null),
                stopLoading: () => setLoading(false),
                clearCache: () => {
                    queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
                    clearRegularizeQueryCache(queryClient);
                    void clearPlatformQueryCache(queryClient);
                },
            }),
        );
    }, [queryClient]);

    async function refreshSession(): Promise<UserProps | null> {
        if (user?.auth_kind === "platform") {
            return refreshPlatformSession();
        }

        const requestVersion = beginAuthTransition();

        try {
            const response = await api.post("/user/session/refresh");

            if (!isCurrentAuthTransition(requestVersion)) {
                return null;
            }

            const userData = response.data?.data;

            if (!isValidAuthUser(userData)) {
                setUser(null);
                queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
                clearRegularizeQueryCache(queryClient);
                return null;
            }

            const currentUser = buildCurrentUser(userData);
            setUser(currentUser);
            await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });

            return currentUser;
        } catch (error) {
            if (isCurrentAuthTransition(requestVersion)) {
                logAuthError("Erro ao atualizar sessão:", error);
            }

            throw error;
        }
    }

    async function refreshPlatformSession(): Promise<UserProps | null> {
        const requestVersion = beginAuthTransition();

        try {
            const response = await platformApi.post("/platform/session/refresh");

            if (!isCurrentAuthTransition(requestVersion)) {
                return null;
            }

            const userData = response.data?.data;

            if (!isValidPlatformUser(userData)) {
                setUser(null);
                queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
                clearRegularizeQueryCache(queryClient);
                await clearPlatformQueryCache(queryClient);
                return null;
            }

            const currentUser = buildPlatformUser(userData);
            setUser(currentUser);
            await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
            return currentUser;
        } catch (error) {
            if (isCurrentAuthTransition(requestVersion)) {
                if (isAccessDenied(error)) {
                    setUser(null);
                    queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
                    clearRegularizeQueryCache(queryClient);
                    await clearPlatformQueryCache(queryClient);
                }
                logAuthError("Erro ao atualizar sessão da plataforma:", error);
            }

            throw error;
        }
    }

    useEffect(() => {
        const requestVersion = beginAuthTransition();

        void (async () => {
            try {
                const response = await platformApi.get("/user/me");
                const userData = response.data?.data;

                if (isCurrentAuthTransition(requestVersion) && isValidAuthUser(userData)) {
                    setUser(buildCurrentUser(userData));
                }
            } catch (error) {
                if (!isAccessDenied(error)) {
                    logAuthError("Erro ao verificar sessão:", error);
                    return;
                }

                try {
                    const response = await platformApi.get("/platform/me");
                    const userData = response.data?.data;

                    if (isCurrentAuthTransition(requestVersion) && isValidPlatformUser(userData)) {
                        setUser(buildPlatformUser(userData));
                    }
                } catch (platformError) {
                    if (!isAccessDenied(platformError)) {
                        logAuthError("Erro ao verificar sessão da plataforma:", platformError);
                    }
                }
            } finally {
                if (isCurrentAuthTransition(requestVersion)) {
                    setLoading(false);
                }
            }
        })();
    }, []);

    async function signIn({ login, password }: SignInProps) {
        const requestVersion = beginAuthTransition();

        try {
            const response = await api.post("/user/session", {
                login,
                password,
            });

            const sessionData = response.data?.data;

            if (!isValidAuthUser(sessionData)) {
                setUser(null);
                toast.error("Resposta de autenticação inválida!");
                clearRegularizeQueryCache(queryClient);
                throw new Error("Invalid authentication response");
            }

            if (!isCurrentAuthTransition(requestVersion)) {
                return;
            }

            const currentUser = buildCurrentUser(sessionData);
            setUser(currentUser);
            queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
            clearRegularizeQueryCache(queryClient);

            toast.success("Login Feito!");
            await Router.push("/dashboard");
        } catch (error: any) {
            if (error.message === "Invalid authentication response") {
                throw error;
            }

            if (error.code === "ECONNREFUSED" || error.code === "ERR_NETWORK" || !error.response) {
                const url = process.env.NEXT_PUBLIC_API_URL || "nao definida";
                toast.error("Erro de conexao! Verifique se o servidor esta rodando.");
                logAuthError("Erro de conexao no login:", {
                    code: error.code,
                    message: error.message,
                    url,
                });
                throw error;
            }

            if (error.response?.status >= 500) {
                toast.error(`Erro no servidor (${error.response.status})! Tente novamente.`);
                logAuthError("Erro do servidor:", error.response?.data || error.message);
                throw error;
            }

            // Credencial invalida: a pagina de login ja mostra a mensagem no formulario.
            if (error.response?.status === 401 || error.response?.status === 400) {
                logAuthError("Erro de autenticacao:", error.response?.data);
                throw error;
            }

            toast.error(error.response?.data?.error || error.message || "Erro ao fazer login!");
            logAuthError("Erro ao entrar:", error);
            throw error;
        }
    }

    async function signInPlatform({ email, password }: PlatformSignInProps) {
        const requestVersion = beginAuthTransition();
        const response = await platformApi.post("/platform/session", { email, password });
        const userData = response.data?.data;

        if (!isValidPlatformUser(userData)) {
            setUser(null);
            throw new Error("Invalid platform authentication response");
        }

        if (!isCurrentAuthTransition(requestVersion)) {
            return;
        }

        setUser(buildPlatformUser(userData));
        queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
        clearRegularizeQueryCache(queryClient);
        await clearPlatformQueryCache(queryClient);
        await Router.push("/super-admin");
    }

    async function logoutUser() {
        if (user?.auth_kind === "platform") {
            await logoutPlatform();
            return;
        }

        beginAuthTransition();

        try {
            await api.delete("/user/session");
            toast.success("Sessão encerrada!");
        } catch (err) {
            toast.error("Erro ao sair!");
            logAuthError("Erro ao sair:", err);
        } finally {
            setUser(null);
            queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
            clearRegularizeQueryCache(queryClient);
            await clearPlatformQueryCache(queryClient);
            await wait(SESSION_TRANSITION_MIN_DURATION_MS);
            await Router.push("/login");
        }
    }

    async function logoutPlatform() {
        beginAuthTransition();

        try {
            await platformApi.delete("/platform/session");
            toast.success("Sessão encerrada!");
        } catch (err) {
            toast.error("Erro ao sair!");
            logAuthError("Erro ao sair da plataforma:", err);
        } finally {
            setUser(null);
            queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
            clearRegularizeQueryCache(queryClient);
            await clearPlatformQueryCache(queryClient);
            await wait(SESSION_TRANSITION_MIN_DURATION_MS);
            await Router.push("/super-admin/login");
        }
    }

    if (loading) {
        return (
            <SessionTransitionScreen
                title="Preparando o Office"
                description="Validando sua sessão e carregando os acessos necessários para abrir o ambiente com segurança."
            />
        );
    }

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated,
            signIn,
            signInPlatform,
            logoutUser,
            logoutPlatform,
            refreshSession,
            refreshPlatformSession,
            loading,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth deve ser usado dentro de um AuthProvider");
    }

    return context;
}
