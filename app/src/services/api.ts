import axios, { AxiosError } from "axios";
import { parseCookies } from "nookies";

import { AuthTokenError } from "./errors/AuthTokenError";
import { signOut } from "../context/AuthContext";

export function setupAPIClient(ctx = undefined) {
    let cookies = parseCookies(ctx);

    const api = axios.create({
        baseURL: process.env.NEXT_PUBLIC_API_URL,
        headers:{
            Authorization: `Bearer ${cookies['@cw.token']}`
        }
    })

    api.interceptors.response.use(response => {
        return response;
    }, (error: AxiosError) => {
        if (error.response?.status === 401) {
            // Se o erro for 401, desloga o usuário
            if (typeof window !== 'undefined') {
                // Executar apenas no lado do navegador
                signOut();
            } else {
                // No lado do servidor, rejeita com um erro específico
                return Promise.reject(new Error('Unauthorized'));
            }
        }
        return Promise.reject(error);
    });
    
    return api;
}