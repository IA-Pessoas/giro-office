import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { destroyCookie, parseCookies, setCookie } from "nookies";
import Router from "next/router";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import {
    AUTH_COOKIE_DESTROY_OPTIONS,
    AUTH_COOKIE_NAME,
    getAuthCookieOptions,
} from "@modules/auth/utils/authCookie";
import { getModulePermissionsFromToken } from "@modules/auth/utils/sessionToken";
import { MODULE_KEYS } from "@modules/auth/utils/moduleAccess";
import { SessionTransitionScreen } from "@shared/components/SessionTransitionScreen";
import { api } from "@shared/services/apiClient";
import { ME_QUERY_KEY } from "@shared/hooks";
import { invalidateAuthSession, registerAuthInvalidationHandler } from "./authInvalidation";

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
}

interface SignInProps {
    login: string;
    password: string;
}

interface AuthSessionData extends UserProps {
    token: string;
}

interface AuthContextData {
    user: UserProps | null;
    isAuthenticated: boolean;
    signIn: (credentials: SignInProps) => Promise<void>;
    logoutUser: () => Promise<void>;
    refreshSession: () => Promise<UserProps | null>;
    loading: boolean;
}

type AuthProviderProps = {
    children: ReactNode;
};

export const AuthContext = createContext({} as AuthContextData);
const SESSION_TRANSITION_MIN_DURATION_MS = 380;
const AUTH_DIAGNOSTIC_LOGS_ENABLED = process.env.NODE_ENV !== "production";

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

function clearAuthCookie() {
    destroyCookie(null, AUTH_COOKIE_NAME, AUTH_COOKIE_DESTROY_OPTIONS);
    delete api.defaults.headers.common.Authorization;
}

function wait(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function isValidAuthSessionData(data: unknown): data is AuthSessionData {
    return !!data &&
        typeof data === "object" &&
        typeof (data as AuthSessionData).id === "string" &&
        typeof (data as AuthSessionData).name === "string" &&
        typeof (data as AuthSessionData).login === "string" &&
        typeof (data as AuthSessionData).permission === "number" &&
        typeof (data as AuthSessionData).token === "string" &&
        (data as AuthSessionData).token.length > 0;
}

function isValidAuthUser(data: unknown): data is UserProps {
    return !!data &&
        typeof data === "object" &&
        typeof (data as UserProps).id === "string" &&
        typeof (data as UserProps).name === "string" &&
        typeof (data as UserProps).login === "string" &&
        typeof (data as UserProps).permission === "number";
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
    };
}

export function signOut() {
    try {
        const { [AUTH_COOKIE_NAME]: token } = parseCookies();

        clearAuthCookie();
        invalidateAuthSession();

        if (token) {
            toast.error("Sessão expirada. Faça login novamente.", {
                toastId: "auth-session-expired",
            });
            void Router.push("/login");
        }
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

    function isCurrentAuthTransition(version: number, expectedToken?: string | null) {
        if (authRequestVersionRef.current !== version) {
            return false;
        }

        if (typeof expectedToken === "string") {
            const { "cw.token": currentToken } = parseCookies();
            return currentToken === expectedToken;
        }

        return true;
    }

    useEffect(() => {
        return registerAuthInvalidationHandler(() => {
            authRequestVersionRef.current += 1;
            setUser(null);
            setLoading(false);
            queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
        });
    }, [queryClient]);

    async function refreshSession(): Promise<UserProps | null> {
        const requestVersion = beginAuthTransition();
        const { "cw.token": token } = parseCookies();

        if (!token) {
            clearAuthCookie();
            setUser(null);
            queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
            return null;
        }

        const fallbackModules = getModulePermissionsFromToken(token);

        try {
            const response = await api.get("/user/me");

            if (!isCurrentAuthTransition(requestVersion, token)) {
                return null;
            }

            const userData = response.data?.data;

            if (!isValidAuthUser(userData)) {
                clearAuthCookie();
                setUser(null);
                queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
                return null;
            }

            const currentUser = buildCurrentUser(userData, fallbackModules);
            setUser(currentUser);
            api.defaults.headers.common.Authorization = `Bearer ${token}`;
            await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });

            return currentUser;
        } catch (error) {
            if (isCurrentAuthTransition(requestVersion, token)) {
                logAuthError("Erro ao atualizar sessão:", error);
            }

            throw error;
        }
    }

    useEffect(() => {
        const { "cw.token": token } = parseCookies();
        const fallbackModules = getModulePermissionsFromToken(token);
        const requestVersion = beginAuthTransition();

        if (token) {
            api.get("/user/me").then((response) => {
                if (!isCurrentAuthTransition(requestVersion, token)) {
                    return;
                }

                const userData = response.data?.data;

                if (isValidAuthUser(userData)) {
                    const currentUser = buildCurrentUser(userData, fallbackModules);
                    setUser(currentUser);
                    api.defaults.headers.common.Authorization = `Bearer ${token}`;
                } else {
                    clearAuthCookie();
                    setUser(null);
                    queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
                }
            }).catch((error) => {
                if (!isCurrentAuthTransition(requestVersion)) {
                    return;
                }

                logAuthError("Erro ao verificar token:", error);
                clearAuthCookie();
                setUser(null);
                queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
            }).finally(() => {
                if (isCurrentAuthTransition(requestVersion)) {
                    setLoading(false);
                }
            });
        } else {
            setLoading(false);
        }
    }, []);

    async function signIn({ login, password }: SignInProps) {
        const requestVersion = beginAuthTransition();

        try {
            const response = await api.post("/user/session", {
                login,
                password,
            });

            const sessionData = response.data?.data;

            if (!isValidAuthSessionData(sessionData)) {
                clearAuthCookie();
                setUser(null);
                toast.error("Resposta de autenticação inválida!");
                throw new Error("Invalid authentication response");
            }

            setCookie(undefined, AUTH_COOKIE_NAME, sessionData.token, getAuthCookieOptions());

            if (!isCurrentAuthTransition(requestVersion)) {
                return;
            }

            const currentUser = buildCurrentUser(sessionData);
            setUser(currentUser);
            queryClient.removeQueries({ queryKey: ME_QUERY_KEY });

            api.defaults.headers.common.Authorization = `Bearer ${sessionData.token}`;

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

            if (error.response?.status === 401 || error.response?.status === 400) {
                const errorMessage =
                    error.response?.data?.error ||
                    error.response?.data?.message ||
                    "Usuário e/ou senha incorretos!";
                toast.error(errorMessage);
                logAuthError("Erro de autenticacao:", error.response?.data);
                throw error;
            }

            toast.error(error.response?.data?.error || error.message || "Erro ao fazer login!");
            logAuthError("Erro ao entrar:", error);
            throw error;
        }
    }

    async function logoutUser() {
        try {
            beginAuthTransition();
            clearAuthCookie();
            setUser(null);
            queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
            toast.success("Sessão encerrada!");
            await wait(SESSION_TRANSITION_MIN_DURATION_MS);
            await Router.push("/login");
        } catch (err) {
            toast.error("Erro ao sair!");
            logAuthError("Erro ao sair:", err);
        }
    }

    if (loading) {
        return (
            <SessionTransitionScreen
                title="Preparando o Office"
                description="Validando sua sessao e carregando os acessos necessarios para abrir o ambiente com seguranca."
            />
        );
    }

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, signIn, logoutUser, refreshSession, loading }}>
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
