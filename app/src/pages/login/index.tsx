import { useState, useContext } from "react"
import Head from "next/head"
import styles from "./LoginPage.module.css"

import { AuthContext } from "../../context/AuthContext"
import { canSSRGuest } from "@modules/auth"

export default function Login() {
    const { signIn } = useContext(AuthContext)

    const [login, setLogin] = useState('')
    const [password, setPassword] = useState('')

    async function handleLogin() {
        if (login === '' || password === '' ) {
            return;
        }

        await signIn({
            login,
            password
        })
    }

    function handleKeyPress(event) {
        if (event.key === 'Enter') {
            handleLogin();
        }
    }

    return(
        <>
            <Head>
                <title>Login - cw</title>
            </Head>
            <div className={styles.page}>
                <div className={styles.card}>
                    <div className={styles.logoWrap}>
                        <p className={styles.logoText}>cw</p>
                    </div>

                    <input
                        className={styles.input}
                        placeholder="Digite seu Login"
                        type="text"
                        value={login}
                        onChange={ (e) => setLogin(e.target.value) }
                        onKeyDown={handleKeyPress}
                    />

                    <input
                        className={styles.input}
                        placeholder="Digite sua senha"
                        type="password"
                        value={password}
                        onChange={ (e) => setPassword(e.target.value) }
                        onKeyDown={handleKeyPress}
                    />

                    <button className={styles.button} onClick={handleLogin}>
                        Acessar
                    </button>

                </div>
            </div>
        </>
    )
}

// Verificação se esta logado
export const getServerSideProps = canSSRGuest(async(ctx) => {
    return {
        props: {

        }
    }
})