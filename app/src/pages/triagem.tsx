import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaTriagem } from "../shared/components/newLayout/FigmaTriagem";

export default function TriagemPage() {
  return (
    <>
      <Head>
        <title>Triagem</title>
      </Head>
      <FigmaTriagem />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
