import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import { destroyCookie, parseCookies } from "nookies";
import { getPermissionFromToken, isAdminPermission } from "./permissions.ts";

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
}

function isAuthTokenFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }

  const maybeError = err as {
    name?: string;
    message?: string;
    constructor?: { name?: string };
  };

  const errorName =
    maybeError.name === "Error"
      ? maybeError.constructor?.name ?? maybeError.name
      : maybeError.name || maybeError.constructor?.name;
  const errorMessage = maybeError.message ?? "";

  return (
    errorName === "AuthTokenError" ||
    errorMessage === "Unauthorized" ||
    errorMessage === "Erro de autorização" ||
    errorMessage.includes("401")
  );
}

export function canSSRAdmin<P>(
  fn: GetServerSideProps<P>,
  options?: CanSSRAdminOptions<P>,
) {
  return async (ctx: GetServerSidePropsContext): Promise<GetServerSidePropsResult<P>> => {
    const cookies = parseCookies(ctx);
    const token = cookies["cw.token"];

    if (!token) {
      return redirectTo("/login");
    }

    const permission = getPermissionFromToken(token);
    if (!isAdminPermission(permission)) {
      return options?.onForbidden?.(ctx) ?? redirectTo("/dashboard");
    }

    try {
      return await fn(ctx);
    } catch (err) {
      if (isAuthTokenFailure(err)) {
        destroyCookie(ctx, "cw.token", { path: "/" });
        return redirectTo("/login");
      }

      return redirectTo("/dashboard");
    }
  };
}
