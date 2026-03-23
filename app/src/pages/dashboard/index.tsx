import React from 'react'
import Head from 'next/head'
import 'react-toastify/dist/ReactToastify.css';

import { canSSRAuth } from '@modules/auth'
import { DashboardGrid, useDashboard } from '@modules/dashboard';
import { setupAPIClient } from '@shared/services/api'

export interface MeItem { id: string; name: string; permission: number; department_id: string; status: string; photo: string | null; }
interface Props { me: MeItem; }

export default function Dashboard({ me }: Props) {
    const { stats, isLoading, error } = useDashboard();

    return (
        <>
            <Head>
                <title>Dashboard</title>
            </Head>
            <main className="dashboard-shell u-stack u-gap-4 px-4 py-4 md:px-6">
                <section className="dashboard-card">
                    <h1 className="dashboard-card-title">Dashboard</h1>
                    <p className="dashboard-card-subtitle">Bem-vindo, {me.name}.</p>
                    {error ? <p className="mt-2 text-sm text-red-600">Falha ao carregar dados do dashboard.</p> : null}
                </section>
                <DashboardGrid stats={stats} isLoading={isLoading} />
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