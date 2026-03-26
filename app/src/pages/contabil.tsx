import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Contabil } from "../shared/components/newLayout/Contabil";

export default function ContabilPage() {
  return (
    <>
      <Head>
        <title>Contábil</title>
      </Head>
      <Contabil />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
