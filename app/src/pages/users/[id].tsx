import React from "react";
import "react-toastify/dist/ReactToastify.css";

import { canSSRAuth } from "@modules/auth";
import { departmentService, type DepItem } from "@modules/departments";
import { UserProfile, type UserItem } from "@modules/users";
import { setupAPIClient } from "@shared/services/api";

interface MeItem {
  id: string;
  name: string;
  permission: number;
}

interface Props {
  me: MeItem;
  user: UserItem;
  deps: DepItem[];
}

export default function User({ me, user, deps }: Props) {
  return <UserProfile userId={user.id} me={me} departments={deps} />;
}

export const getServerSideProps = canSSRAuth(async (ctx) => {
  const { id } = ctx.params as { id: string };

  try {
    const apiClient = setupAPIClient(ctx);
    const [meResponse, userResponse, deps] = await Promise.all([
      apiClient.get("/user/me"),
      apiClient.get("/users-detail", { params: { user_id: id } }),
      departmentService.list(undefined, ctx),
    ]);

    const user = userResponse.data.user;
    const me = meResponse.data.user;

    if (!user || (me.permission === 0 && me.id !== id)) {
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
});
