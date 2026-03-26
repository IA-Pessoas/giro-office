import React from "react";
import Head from "next/head";

import { canSSRAuth } from "@modules/auth";
import { FigmaOrganizations } from "../../shared/components/newLayout/FigmaOrganizations";

export default function OrganizationsPage() {
  return (
    <>
      <Head>
        <title>Organizações</title>
      </Head>
      <FigmaOrganizations />
    </>
  );
}

export const getServerSideProps = canSSRAuth(async () => {
  return { props: {} };
});
