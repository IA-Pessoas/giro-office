import React from "react";
import Head from "next/head";

import { canSSRAdmin } from "@modules/auth";
import { AdminAccessDeniedState } from "@shared/components/AdminAccessDeniedState";
import { Administracao } from "../../shared/components/newLayout/Administracao";

interface Props {
  forbidden?: boolean;
}

export default function AdministracaoPage({ forbidden = false }: Props) {
  return (
    <>
      <Head>
        <title>Administração</title>
      </Head>
      {forbidden ? (
        <AdminAccessDeniedState description="Você não possui permissão para acessar a área de administração." />
      ) : (
        <Administracao />
      )}
    </>
  );
}

export const getServerSideProps = canSSRAdmin<Props>(
  async () => {
    return {
      props: {},
    };
  },
  {
    onForbidden: () => ({
      props: {
        forbidden: true,
      },
    }),
  },
);
