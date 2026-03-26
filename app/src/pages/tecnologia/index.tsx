import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaTecnologia } from "../../shared/components/newLayout/FigmaTecnologia";

export default function TecnologiaPage() {
  return (
    <>
      <Head>
        <title>Tecnologia</title>
      </Head>
      <FigmaTecnologia />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

