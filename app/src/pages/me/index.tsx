import { useState, useEffect } from "react";
import Head from "next/head";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import styles from "./MePage.module.css";

import { useAuth } from "../../context/AuthContext";
import { useMePassword, useUserProfile } from "@shared/hooks";
import { setupAPIClient } from "@shared/services/api";

export default function Me() {
  const { user, logoutUser } = useAuth();
  const profileQuery = useUserProfile(user?.id);
  const { password, setPassword } = useMePassword(user?.id);

  const [name, setName] = useState("");
  const [login, setLogin] = useState("");

  useEffect(() => {
    if (profileQuery.data) {
      setName(profileQuery.data.name);
      setLogin(profileQuery.data.login);
    }
  }, [profileQuery.data]);

  async function handleLogout() {
    await logoutUser();
  }

  async function handleUpdate() {
    if (name === "") {
      return;
    }

    try {
      const apiClient = setupAPIClient();
      await apiClient.put("/users", {
        name: name,
        password: password,
        permission: 2,
        status: "Ativo",
      });

      toast.success("Atualizado com sucesso!");
    } catch (error) {
      toast.error("Erro ao atualizar!");
      console.log(error);
    }
  }

  return (
    <>
      <Head>
        <title>Meu Perfil - Office</title>
      </Head>
      <div className={styles.page}>
        <div className={styles.breadcrumb}>Meu Perfil</div>
        <div className={styles.card}>
          <div className={styles.form}>
            {profileQuery.isLoading ? (
              <p className={styles.label}>Carregando perfil…</p>
            ) : profileQuery.isError ? (
              <p className={styles.label}>Não foi possível carregar o perfil.</p>
            ) : null}
            <label className={styles.label}>Login</label>
            <input className={styles.input} placeholder="Seu Login" type="text" disabled value={login} />
            <label className={styles.label}>Nome</label>
            <input
              className={styles.input}
              placeholder="Digite seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className={styles.label}>Senha</label>
            <input
              className={styles.input}
              placeholder="Digite uma nova senha se desejar"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button type="button" className={styles.saveBtn} onClick={handleUpdate}>
              Salvar
            </button>

            <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
              Sair
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
