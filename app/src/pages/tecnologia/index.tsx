import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Tecnologia } from "../../shared/components/newLayout/Tecnologia";

export default function TecnologiaPage() {
  return (
    <>
      <Head>
        <title>Tecnologia</title>
      </Head>
      <Tecnologia />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});

