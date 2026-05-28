import React from "react";
import Head from "next/head";

import { canSSRAdmin } from "@modules/auth";
import { AdminAccessDeniedState } from "@shared/components/AdminAccessDeniedState";
import { Departments } from "@shared/components/newLayout/Departments";

interface Props {
  forbidden?: boolean;
}

export default function DepartmentsPage({ forbidden = false }: Props) {
  return (
    <>
      <Head>
        <title>Departamentos</title>
      </Head>
      {forbidden ? (
        <AdminAccessDeniedState description="Você não possui permissão para acessar a área de departamentos." />
      ) : (
        <Departments />
      )}
    </>
  );
}

export const getServerSideProps = canSSRAdmin<Props>(
  async () => {
    return { props: {} };
  },
  {
    onForbidden: () => ({
      props: {
        forbidden: true,
      },
    }),
  },
);
