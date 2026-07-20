import type { GetServerSidePropsContext } from "next";
import { parseCookies } from "nookies";

import { AUTH_COOKIE_NAME } from "./authCookie";
import { canAccessPlatformAdminToken } from "./sessionToken";

export function canSSRPlatformAdmin(context: GetServerSidePropsContext) {
  const cookies = parseCookies(context);
  const token = cookies[AUTH_COOKIE_NAME];

  if (!canAccessPlatformAdminToken(token)) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  return { props: {} };
}
