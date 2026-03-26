import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Tasks } from "../../shared/components/newLayout/Tasks";

export default function TasksPage() {
  return (
    <>
      <Head>
        <title>Tarefas</title>
      </Head>
      <Tasks />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});

