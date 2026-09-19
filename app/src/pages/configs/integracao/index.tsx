import React from "react";
import Head from "next/head";
import { FaListOl, FaTasks } from "react-icons/fa";
import Link from "next/link";
import { canSSRAuth } from "@modules/auth";
import styles from "./IntegracaoConfigPage.module.css";

export default function IntegracaoConfig() {
  return (
    <>
      <Head>
        <title>Configurações - Integração</title>
      </Head>
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
          <Link href="/configs/integracao/plans">
            <div className={styles.card}>
              <FaListOl className={styles.icon} />
              <h2 className={styles.cardTitle}>Planos de Trabalho</h2>
              <p className={styles.cardText}>Monte a sequência de modelos a contratar em cada projeto.</p>
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
