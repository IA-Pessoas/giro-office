import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Organizations } from "../../shared/components/newLayout/Organizations";

export default function OrganizationsPage() {
  return (
    <>
      <Head>
        <title>Organizações</title>
      </Head>
      <Organizations />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
