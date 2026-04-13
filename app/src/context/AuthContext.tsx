import { createContext, ReactNode, useState, useEffect, useContext } from "react"
import { destroyCookie, setCookie, parseCookies } from "nookies";
import Router from "next/router";
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';

import { api } from '@shared/services/apiClient'

interface UserProps {
    id: string;
    name: string;
    login: string;
    permission: number;
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
}

export const AuthContext = createContext({} as AuthContextData)

function clearAuthCookie() {
    destroyCookie(null, '@cw.token', { path: '/' })
    delete api.defaults.headers.common['Authorization']
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

export function signOut() {
    try {
        clearAuthCookie()
        Router.push('/login');
    } catch (error) {
        console.log('Erro ao deslogar');
    }
}

export function AuthProvider({ children }: AuthProviderProps){
    const [user, setUser] = useState<UserProps | null>(null)
    const isAuthenticated = !!user;
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const { '@cw.token': token } = parseCookies();

        if (token) {
            api.get('/me').then(response => {
                const userData = response.data?.data;

                if (isValidAuthUser(userData)) {
                    setUser(userData);
                    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
                } else {
                    clearAuthCookie();
                    setUser(null);
                }
            }).catch((error) => {
                console.error('Erro ao verificar token:', error);
                clearAuthCookie();
                setUser(null);
            }).finally(() => {
                setLoading(false);
            });
        } else {
            setLoading(false);
        }
    }, [])

    async function signIn({ login, password }: SignInProps) {
        try {
            const response = await api.post('/session', {
                login,
                password
            })

            const sessionData = response.data?.data;

            if (!isValidAuthSessionData(sessionData)) {
                clearAuthCookie();
                setUser(null);
                toast.error("Resposta de autenticaÃ§Ã£o invÃ¡lida!")
                return
            }
        
            setCookie(undefined, '@cw.token', sessionData.token, {
                maxAge: 60 * 60 * 24 * 30,
                path: '/'
            })

            setUser({
                id: sessionData.id,
                name: sessionData.name,
                login: sessionData.login,
                permission: sessionData.permission
            })
            
            api.defaults.headers.common['Authorization'] = `Bearer ${sessionData.token}`

            toast.success("Login Feito!")

            if (typeof window !== 'undefined') {
                window.location.href = '/dashboard';
            } else {
                Router.push('/dashboard');
            }

        } catch (error: any) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || !error.response) {
                const url = process.env.NEXT_PUBLIC_API_URL || 'nÃ£o definida';
                toast.error(`Erro de conexÃ£o! URL: ${url}. Verifique se o servidor estÃ¡ rodando.`)
                console.error('Erro de conexÃ£o:', {
                    code: error.code,
                    message: error.message,
                    url: url,
                    fullError: error
                })
                return
            }

            if (error.response?.status >= 500) {
                toast.error(`Erro no servidor (${error.response.status})! Tente novamente.`)
                console.error('Erro do servidor:', error.response?.data || error.message)
                return
            }

            if (error.response?.status === 401 || error.response?.status === 400) {
                const errorMessage = error.response?.data?.error || error.response?.data?.message || "UsuÃ¡rio e/ou senha incorretos!"
                toast.error(errorMessage)
                console.error('Erro de autenticaÃ§Ã£o:', error.response?.data)
                return
            }

            toast.error(error.response?.data?.error || error.message || "Erro ao fazer login!")
            console.error('Erro ao entrar:', error)
        }
    }

    async function logoutUser(){
        try{
            clearAuthCookie()
            toast.success("Sessão encerrada!")
            Router.push('/login')
            setUser(null);
        }catch(err){
            toast.error("Erro ao sair!")
            console.log("ERRO AO SAIR", err)
        }
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <h1>Carregando...</h1>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, signIn, logoutUser, loading }}>
            { children }
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }

    return context;
}
