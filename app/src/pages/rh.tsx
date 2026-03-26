import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaRH } from "../shared/components/newLayout/FigmaRH";

export default function RHPage() {
  return (
    <>
      <Head>
        <title>RH</title>
      </Head>
      <FigmaRH />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
