import Head from "next/head";
import React from "react";
import "react-toastify/dist/ReactToastify.css";

import { canSSRAdmin } from "@modules/auth";
import { departmentService } from "@modules/departments";
import { UserProfile, type UserDetailsPageProps } from "@modules/users";
import { AdminAccessDeniedState } from "@shared/components/AdminAccessDeniedState";
import { setupAPIClient } from "@shared/services/api";

export default function User({
  me,
  user,
  deps = [],
  forbidden = false,
}: UserDetailsPageProps) {
  if (forbidden) {
    return (
      <AdminAccessDeniedState description="Você não possui permissão para acessar os detalhes deste usuário." />
    );
  }

  if (!me || !user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>{`Usuário ${user.name ?? ""} | Office`.replace("  ", " ")}</title>
      </Head>
      <UserProfile userId={user.id} me={me} departments={deps} />
    </>
  );
}

export const getServerSideProps = canSSRAdmin<UserDetailsPageProps>(
  async (ctx) => {
    const { id } = ctx.params as { id: string };

    try {
      const apiClient = setupAPIClient(ctx);
      const [meResponse, userResponse, deps] = await Promise.all([
        apiClient.get("/user/me"),
        apiClient.get(`/user/${encodeURIComponent(id)}`),
        departmentService.list(undefined, ctx),
      ]);

      // Envelope atual: { success, data }. /users-detail era do legacy-api.
      const user = userResponse.data?.data;
      const me = meResponse.data?.data;

      if (!user) {
        return { redirect: { destination: "/dashboard", permanent: false } };
      }

      return {
        props: {
          me,
          user,
          deps,
        },
      };
    } catch (error) {
      console.log(error);
      return { redirect: { destination: "/dashboard", permanent: false } };
    }
  },
  {
    onForbidden: () => ({
      props: {
        forbidden: true,
      },
    }),
  },
);
