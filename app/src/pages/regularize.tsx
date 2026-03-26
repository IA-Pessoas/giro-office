import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Regularize } from "../shared/components/newLayout/Regularize";

export default function RegularizePage() {
  return (
    <>
      <Head>
        <title>Regularize</title>
      </Head>
      <Regularize />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return {
    props: {},
  };
});
