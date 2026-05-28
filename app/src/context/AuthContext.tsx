import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { destroyCookie, parseCookies, setCookie } from "nookies";
import Router from "next/router";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { getModulePermissionsFromToken } from "@modules/auth/utils/sessionToken";
import { api } from "@shared/services/apiClient";

interface UserProps {
    id: string;
    name: string;
    login: string;
    email?: string;
    permission: number;
    department_id?: string;
    organization_id?: string | null;
    type?: "owner" | "admin" | "user" | null;
    modules?: Record<string, number | null> | null;
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
    loading: boolean;
}

type AuthProviderProps = {
    children: ReactNode;
};

export const AuthContext = createContext({} as AuthContextData);

function clearAuthCookie() {
    destroyCookie(null, "cw.token", { path: "/" });
    delete api.defaults.headers.common.Authorization;
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
    fallbackModules?: Record<string, number | null> | null,
): UserProps {
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
        modules: data.modules ?? fallbackModules ?? null,
    };
}

export function signOut() {
    try {
        clearAuthCookie();
        Router.push("/login");
    } catch (error) {
        console.log("Erro ao deslogar");
    }
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<UserProps | null>(null);
    const isAuthenticated = !!user;
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const { "cw.token": token } = parseCookies();
        const fallbackModules = getModulePermissionsFromToken(token);

        if (token) {
            api.get("/user/me").then((response) => {
                const userData = response.data?.data;

                if (isValidAuthUser(userData)) {
                    setUser(buildCurrentUser(userData, fallbackModules));
                    api.defaults.headers.common.Authorization = `Bearer ${token}`;
                } else {
                    clearAuthCookie();
                    setUser(null);
                }
            }).catch((error) => {
                console.error("Erro ao verificar token:", error);
                clearAuthCookie();
                setUser(null);
            }).finally(() => {
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
    }, []);

    async function signIn({ login, password }: SignInProps) {
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

            setCookie(undefined, "cw.token", sessionData.token, {
                maxAge: 60 * 60 * 24 * 7,
                path: "/",
            });

            setUser(buildCurrentUser(sessionData));

            api.defaults.headers.common.Authorization = `Bearer ${sessionData.token}`;

            toast.success("Login Feito!");
            await Router.push("/dashboard");
        } catch (error: any) {
            if (error.message === "Invalid authentication response") {
                throw error;
            }

            if (error.code === "ECONNREFUSED" || error.code === "ERR_NETWORK" || !error.response) {
                const url = process.env.NEXT_PUBLIC_API_URL || "não definida";
                toast.error(`Erro de conexão! URL: ${url}. Verifique se o servidor está rodando.`);
                console.error("Erro de conexão:", {
                    code: error.code,
                    message: error.message,
                    url,
                    fullError: error,
                });
                throw error;
            }

            if (error.response?.status >= 500) {
                toast.error(`Erro no servidor (${error.response.status})! Tente novamente.`);
                console.error("Erro do servidor:", error.response?.data || error.message);
                throw error;
            }

            if (error.response?.status === 401 || error.response?.status === 400) {
                const errorMessage =
                    error.response?.data?.error ||
                    error.response?.data?.message ||
                    "Usuário e/ou senha incorretos!";
                toast.error(errorMessage);
                console.error("Erro de autenticação:", error.response?.data);
                throw error;
            }

            toast.error(error.response?.data?.error || error.message || "Erro ao fazer login!");
            console.error("Erro ao entrar:", error);
            throw error;
        }
    }

    async function logoutUser() {
        try {
            clearAuthCookie();
            toast.success("Sessão encerrada!");
            Router.push("/login");
            setUser(null);
        } catch (err) {
            toast.error("Erro ao sair!");
            console.log("ERRO AO SAIR", err);
        }
    }

    if (loading) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                <h1>Carregando...</h1>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, signIn, logoutUser, loading }}>
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
