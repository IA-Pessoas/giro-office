import React from "react";
import Head from "next/head";
import { parseCookies } from "nookies";

import { canSSRAuth } from "@modules/auth";
import { getPermissionFromToken, isAdminPermission } from "@modules/auth/utils/permissions";
import { Departments } from "../../shared/components/newLayout/Departments";

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

export const getServerSideProps = canSSRAuth(async (ctx) => {
  const cookies = parseCookies(ctx);
  const permission = getPermissionFromToken(cookies["cw.token"]);

  if (!isAdminPermission(permission)) {
    return {
      redirect: {
        destination: "/dashboard",
        permanent: false,
      },
    };
  }

  return { props: {} };
});
