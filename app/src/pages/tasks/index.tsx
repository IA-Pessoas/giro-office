import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaTasks } from "../../shared/components/newLayout/FigmaTasks";

export default function TasksPage() {
  return (
    <>
      <Head>
        <title>Tarefas</title>
      </Head>
      <FigmaTasks />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});

