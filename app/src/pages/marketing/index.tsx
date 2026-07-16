import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Marketing } from "../../shared/components/newLayout/Marketing";

export default function MarketingPage() {
  return (
    <>
      <Head>
        <title>Marketing</title>
      </Head>
      <Marketing />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});

