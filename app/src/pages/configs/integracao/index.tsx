import React from 'react';
import Head from 'next/head';
import { FaTasks } from 'react-icons/fa';
import Link from 'next/link';
import { canSSRAuth } from '@modules/auth';
import styles from './IntegracaoConfigPage.module.css';

export default function IntegracaoConfig() {
    return (
        <>
            <Head><title>Configurações - Integração</title></Head>
            <div className={styles.page}>
                <h1 className={styles.title}>Configurações da Integração</h1>
                
                <div className={styles.grid}>
                    <Link href="/configs/integracao/tasks">
                        <div className={styles.card}>
                            <FaTasks className={styles.icon} />
                            <h2 className={styles.cardTitle}>Modelos de Tarefas</h2>
                            <p className={styles.cardText}>Gerencie os modelos padrão de tarefas recorrentes.</p>
                        </div>
                    </Link>
                    {/* Adicione mais cards de configuração aqui no futuro */}
                </div>
            </div>
        </>
    );
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    // Aqui você pode adicionar verificação de permissão no lado do servidor se quiser segurança extra
    return { props: {} };
});