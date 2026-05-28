import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import { destroyCookie, parseCookies } from "nookies";

import { AuthTokenError } from "../../../shared/services/errors/AuthTokenError.ts";

import { getPermissionFromToken, isAdminPermission } from "./permissions.ts";

function redirectTo<P>(destination: string): GetServerSidePropsResult<P> {
  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
}

export function canSSRAdmin<P>(fn: GetServerSideProps<P>) {
  return async (ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<P>> => {
    const cookies = parseCookies(ctx);
    const token = cookies["cw.token"];

    if (!token) {
      return redirectTo("/login");
    }

    const permission = getPermissionFromToken(token);
    if (!isAdminPermission(permission)) {
      return redirectTo("/dashboard");
    }

    try {
      return await fn(ctx);
    } catch (err) {
      if (
        err instanceof AuthTokenError ||
        (err instanceof Error && (err.message === "Unauthorized" || err.message.includes("401")))
      ) {
        destroyCookie(ctx, "cw.token", { path: "/" });
        return redirectTo("/login");
      }

      return redirectTo("/dashboard");
    }
  };
}
