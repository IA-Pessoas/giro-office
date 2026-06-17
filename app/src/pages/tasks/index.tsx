import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { TasksWorkspace } from "@modules/integracao";

export default function TasksPage() {
  return (
    <>
      <Head>
        <title>Tarefas</title>
      </Head>
      <TasksWorkspace />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
