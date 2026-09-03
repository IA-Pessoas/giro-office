import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from "next";

import { setupAPIClient } from "@shared/services/api";

type PlatformIdentity = {
  id: string;
  name: string;
  email: string;
  auth_kind: "platform";
  platform_role: "super_admin";
};

function isPlatformAdmin(data: unknown): data is PlatformIdentity {
  return !!data &&
    typeof data === "object" &&
    typeof (data as PlatformIdentity).id === "string" &&
    typeof (data as PlatformIdentity).name === "string" &&
    typeof (data as PlatformIdentity).email === "string" &&
    (data as PlatformIdentity).auth_kind === "platform" &&
    (data as PlatformIdentity).platform_role === "super_admin";
}

function redirectToLogin() {
  return {
    redirect: {
      destination: "/super-admin/login",
      permanent: false,
    },
  } as const;
}

export function canSSRPlatformAdmin<P>(fn: GetServerSideProps<P>) {
  return async (ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<P>> => {
    try {
      const response = await setupAPIClient(ctx).get("/platform/me");

      if (!isPlatformAdmin(response.data?.data)) {
        return redirectToLogin();
      }

      return await fn(ctx);
    } catch {
      return redirectToLogin();
    }
  };
}
