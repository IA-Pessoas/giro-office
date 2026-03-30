import React from "react";
import Head from "next/head";
import "react-toastify/dist/ReactToastify.css";

import { canSSRAuth } from "@modules/auth";
import { Dashboard as DashboardContent } from "../../shared/components/newLayout/Dashboard";

export default function Dashboard() {
    return (
        <>
            <Head>
                <title>Dashboard</title>
            </Head>
            <DashboardContent />
        </>
    )
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
    return { props: {} };
})