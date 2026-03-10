import axios, { AxiosError } from "axios";
import { parseCookies } from "nookies";

import { AuthTokenError } from "./errors/AuthTokenError";
import { signOut } from "../context/AuthContext";

export function setupAPIClient(ctx = undefined) {
    let cookies = parseCookies(ctx);
    const token = cookies['@cw.token'];

    const api = axios.create({
        baseURL: process.env.NEXT_PUBLIC_API_URL,
        headers:{
            Authorization: token ? `Bearer ${token}` : undefined
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
                // No lado do servidor, rejeita com AuthTokenError para ser capturado pelo canSSRAuth
                return Promise.reject(new AuthTokenError());
            }
        }
        return Promise.reject(error);
    });
    
    return api;
}