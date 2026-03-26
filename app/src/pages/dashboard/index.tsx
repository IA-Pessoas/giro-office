import React from "react";
import Head from "next/head";
import "react-toastify/dist/ReactToastify.css";

import { canSSRAuth } from "@modules/auth";
import { DashboardGrid, useDashboard } from "@modules/dashboard";
import { setupAPIClient } from "@shared/services/api";

export interface MeItem { id: string; name: string; permission: number; department_id: string; status: string; photo: string | null; }
interface Props { me: MeItem; }

export default function Dashboard({ me }: Props) {
    const { stats, isLoading, error } = useDashboard();

    return (
        <>
            <Head>
                <title>Dashboard</title>
            </Head>
            <main className="max-w-[1600px] mx-auto space-y-6 p-4 lg:p-8">
                <section className="flex items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                            Dashboard
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Bem-vindo, {me.name}.
                        </p>
                        {error ? (
                            <p className="mt-2 text-sm text-red-600">
                                Falha ao carregar dados do dashboard.
                            </p>
                        ) : null}
                    </div>
                    <div className="text-right hidden md:block">
                        <p className="text-sm text-gray-600 dark:text-gray-400">Última atualização</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {new Date().toLocaleString("pt-BR")}
                        </p>
                    </div>
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