import Head from "next/head"
import styles from "./LandingPage.module.css"

import { canSSRGuest } from "@modules/auth"

export default function Home() {
    return(
        <>
            <Head>
                <title>cw</title>
            </Head>
            <div className={styles.page}>
                <p className={styles.title}>Home</p>
            </div>
        </>
    )
}

// Verificação se esta logado
export const getServerSideProps = canSSRGuest(async(ctx) => {
    try {
        return {
            props: {}
        }
    } catch (error) {
        console.log(error);
        return { props: {} };
    }
})