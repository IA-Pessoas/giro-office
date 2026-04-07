import { createContext, ReactNode, useState, useEffect, useContext } from "react"
import { destroyCookie, setCookie, parseCookies } from "nookies";
import Router from "next/router";
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';

import { api } from '@shared/services/apiClient'

interface AuthContextData {
    user: UserProps;
    isAuthenticated: boolean;
    signIn: (credentials: SignInProps) => Promise<void>
    logoutUser: () => Promise<void>;
    loading: boolean;
}
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

type AuthProviderProps = {
    children: ReactNode;
}
interface AuthContextData {
    user: UserProps | null; // Agora pode ser nulo
    isAuthenticated: boolean;
    signIn: (credentials: SignInProps) => Promise<void>;
    logoutUser: () => Promise<void>;
    loading: boolean; // Novo estado para a tela de carregamento
}

export const AuthContext = createContext({} as AuthContextData)

export function signOut() {
    try {
        destroyCookie(null, '@cw.token', { path: '/' })
        Router.push('/login');
    } catch (error) {
        console.log('Erro ao deslogar');
    }
}

export function AuthProvider({ children }: AuthProviderProps){
    const [user, setUser] = useState<UserProps>()
    const isAuthenticated = !!user;
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const { '@cw.token': token } = parseCookies();

        if (token) {
            api.get('/user/me').then(response => {
                const userData = response.data.user;
                if (userData && userData.id) {
                    setUser(userData);
                } else {
                    // Não chama signOut aqui para evitar redirecionamento durante SSR
                    destroyCookie(null, '@cw.token', { path: '/' });
                    setUser(null);
                }
            }).catch((error) => {
                // Não chama signOut aqui para evitar redirecionamento durante SSR
                console.error('Erro ao verificar token:', error);
                destroyCookie(null, '@cw.token', { path: '/' });
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
            const response = await api.post('/user/session', {
                login,
                password
            })

            const { id, name, permission, token } = response.data;
        
            setCookie(undefined, '@cw.token', token, {
                maxAge: 60 * 60 * 24 * 30, // Expirar em um mes
                path: '/' // Todos caminhos terao acesso ao cookie 
            })

            setUser({
                id,
                name,
                login,
                permission
            })
            
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`

            toast.success("Login Feito!")

            // Usar window.location para forçar recarregamento completo e evitar problemas de navegação
            if (typeof window !== 'undefined') {
                window.location.href = '/dashboard';
            } else {
                Router.push('/dashboard');
            }

        } catch (error: any) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || !error.response) {
                const url = process.env.NEXT_PUBLIC_API_URL || 'não definida';
                toast.error(`Erro de conexão! URL: ${url}. Verifique se o servidor está rodando.`)
                console.error('Erro de conexão:', {
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
                const errorMessage = error.response?.data?.error || error.response?.data?.message || "Usuário e/ou senha incorretos!"
                toast.error(errorMessage)
                console.error('Erro de autenticação:', error.response?.data)
                return
            }

            toast.error(error.response?.data?.error || error.message || "Erro ao fazer login!")
            console.error('Erro ao entrar:', error)
        }
    }

    async function logoutUser(){
        try{
            destroyCookie(null, '@cw.token', { path: '/' })
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
            // Opcional: Crie um componente de Spinner para uma melhor UX
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
        // Este erro é útil para o futuro: se você tentar usar o useAuth
        // fora de um componente que está dentro do AuthProvider, ele dará um aviso claro.
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }

    return context;
}
