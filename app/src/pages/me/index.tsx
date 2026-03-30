import { useState, useEffect } from "react";
import Head from "next/head";
import "react-toastify/dist/ReactToastify.css";
import styles from "./MePage.module.css";

import { useAuth } from "../../context/AuthContext";
import { useMePassword, useUpdateCurrentUser, useUserProfile } from "@shared/hooks";

export default function Me() {
  const { user, logoutUser } = useAuth();
  const profileQuery = useUserProfile(user?.id);
  const { password, setPassword } = useMePassword(user?.id);
  const updateUserMutation = useUpdateCurrentUser();

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

  function handleUpdate() {
    if (name === "") {
      return;
    }

    const permission = user?.permission ?? profileQuery.data?.permission ?? 2;

    updateUserMutation.mutate({
      name,
      password,
      permission,
      status: "Ativo",
    });
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
            {updateUserMutation.isError ? (
              <p className={styles.label}>Não foi possível salvar. Tente novamente.</p>
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

            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleUpdate}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? "Salvando…" : "Salvar"}
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
