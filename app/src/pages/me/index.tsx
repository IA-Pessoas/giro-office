import { useState, useContext, useEffect } from "react";
import Head from "next/head";
import { toast } from "react-toastify"
import 'react-toastify/dist/ReactToastify.css';
import styles from "./MePage.module.css";

import { canSSRAuth } from "@modules/auth";
import { IoIosArrowForward } from 'react-icons/io'
import { AuthContext } from "../../context/AuthContext";
import { setupAPIClient } from "@shared/services/api";

interface UserProps {
    id: string;
    name: string;
    login: string;
}

interface Props {
    user: UserProps;
}

export default function Me() {
    const { logoutUser } = useContext(AuthContext);
    const apiClient = setupAPIClient();

    const [name, setName] = useState('');
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');

    async function handleLogout() {
        await logoutUser();
    }

    async function user() {
        const user = await apiClient.get('/me')

        setName(user.data.user.name)
        setLogin(user.data.user.login)
        setPassword(user.data.user.password)
    }

    async function handleUpdate() {

        if (name === '')
            return;

        try {
            const apiClient = setupAPIClient();
            await apiClient.put('/users', {
                name: name,
                password: password,
                permission: 2,
                status: 'Ativo'
            })

            toast.success("Atualizado com sucesso!")

        } catch (error) {
            toast.error("Erro ao atualizar!")
            console.log(error)
        }
    }

    useEffect(() => {
        user();
    }, [])

    return (
        <>
            <Head>
                <title>Meu Perfil - Office</title>
            </Head>
            <div className={styles.page}>
                <div className={styles.breadcrumb}>Meu Perfil</div>
                <div className={styles.card}>
                    <div className={styles.form}>
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
                            onChange={ (e) => setPassword(e.target.value)}
                        />

                        <button className={styles.saveBtn} onClick={handleUpdate}>
                            Salvar
                        </button>

                        <button className={styles.logoutBtn} onClick={handleLogout}>
                            Sair
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}