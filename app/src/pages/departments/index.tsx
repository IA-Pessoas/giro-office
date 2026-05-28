import React from "react";
import Head from "next/head";

import { canSSRAdmin } from "@modules/auth";
import { Departments } from "@shared/components/newLayout/Departments";

export default function DepartmentsPage() {
  return (
    <>
      <Head>
        <title>Departamentos</title>
      </Head>
      <Departments />
    </>
  );
}

export const getServerSideProps = canSSRAdmin(async () => {
  return { props: {} };
});
