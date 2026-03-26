import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { RH } from "../shared/components/newLayout/RH";

export default function RHPage() {
  return (
    <>
      <Head>
        <title>RH</title>
      </Head>
      <RH />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
