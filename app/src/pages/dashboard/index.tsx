import React from "react";
import Head from "next/head";
import "react-toastify/dist/ReactToastify.css";

import { canSSRAuth } from "@modules/auth";
import { FigmaDashboard } from "../../shared/components/newLayout/FigmaDashboard";

export default function Dashboard() {
    return (
        <>
            <Head>
                <title>Dashboard</title>
            </Head>
            <FigmaDashboard />
        </>
    )
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    return { props: {} };
})