import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { Departments } from "../../shared/components/newLayout/Departments";

export default function OrganizationsPage() {
  return (
    <>
      <Head>
        <title>Departamentos</title>
      </Head>
      <Departments />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
