import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import { parseCookies } from "nookies";

import { setupAPIClient } from "@shared/services/api";

import { canAccessAdministration } from "./permissions";

function redirectTo(destination: string) {
  return {
    redirect: {
      destination,
      permanent: false,
    },
  } as const;
}

interface CanSSRAdminOptions<P> {
  onForbidden?: (ctx: GetServerSidePropsContext) => GetServerSidePropsResult<P>;
  loadUser?: (ctx: GetServerSidePropsContext) => Promise<SessionUser>;
}

type SessionUser = Parameters<typeof canAccessAdministration>[0];

async function loadCurrentUser(ctx: GetServerSidePropsContext): Promise<SessionUser> {
  const response = await setupAPIClient(ctx).get("/user/me");
  return response.data?.data;
}

function isAuthenticationFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AuthTokenError" || error.message.includes("401");
}

export function canSSRAdmin<P>(
  fn: GetServerSideProps<P>,
  options: CanSSRAdminOptions<P> = {},
) {
  return async (ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<P>> => {
    if (!parseCookies(ctx)["cw.session"]) {
      return redirectTo("/login");
    }

    let user: SessionUser;
    try {
      user = await (options.loadUser ?? loadCurrentUser)(ctx);
    } catch {
      return redirectTo("/login");
    }

    if (!canAccessAdministration(user)) {
      return options.onForbidden?.(ctx) ?? redirectTo("/dashboard");
    }

    try {
      return await fn(ctx);
    } catch (error) {
      return redirectTo(isAuthenticationFailure(error) ? "/login" : "/dashboard");
    }
  };
}
