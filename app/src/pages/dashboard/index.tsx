import React from 'react'
import Head from 'next/head'
import 'react-toastify/dist/ReactToastify.css';

import { canSSRAuth } from '@modules/auth'
import { setupAPIClient } from '@shared/services/api'

export interface MeItem { id: string; name: string; permission: number; department_id: string; status: string; photo: string | null; }
interface Props { me: MeItem; }

export default function Dashboard({ me }: Props) {
    return (
        <>
            <Head>
                <title>Dashboard</title>
            </Head>
            <main className="dashboard-shell u-stack u-gap-4">
                <section className="dashboard-card">
                    <h1 className="dashboard-card-title">Dashboard</h1>
                    <p className="dashboard-card-subtitle">Bem-vindo, {me.name}.</p>
                </section>
            </main>
        </>
    )
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    const apiClient = setupAPIClient(ctx);
    
    try {
        const meResponse = await apiClient.get('/me');

        return {
          props: {
            me: meResponse.data.user,
          }
        };
    } catch (error: any) {
        // Se for erro 401, lança AuthTokenError para ser capturado pelo canSSRAuth
        if (error?.response?.status === 401 || error?.message === 'Unauthorized') {
            const { AuthTokenError } = await import('@shared/services/errors/AuthTokenError');
            throw new AuthTokenError();
        }
        
        // Para outros erros, também lança para ser tratado pelo canSSRAuth
        throw error;
    }
})