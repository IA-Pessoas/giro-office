import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Triagem } from "../shared/components/newLayout/Triagem";

export default function TriagemPage() {
  return (
    <>
      <Head>
        <title>Triagem</title>
      </Head>
      <Triagem />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
