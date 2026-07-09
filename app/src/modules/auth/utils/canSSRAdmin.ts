import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import { jwtDecode } from "jwt-decode";
import { destroyCookie, parseCookies } from "nookies";

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

interface SessionTokenPayload {
  permission?: number;
  modules?: Record<string, unknown>;
}

const ADMIN_PERMISSION = 2;

function hasAdminAccess(subject: {
  permission?: number | null;
  modules?: Record<string, number | null> | null;
} | null): boolean {
  return (
    (typeof subject?.permission === "number" && subject.permission >= ADMIN_PERMISSION) ||
    subject?.modules?.rh === ADMIN_PERMISSION
  );
}

function normalizeModuleValue(value: unknown): number | null {
  return value === 0 || value === 1 || value === 2 ? value : null;
}

function getAccessSubjectFromToken(
  token?: string | null,
): { permission: number | null; modules: Record<string, number | null> | null } | null {
  if (!token) {
    return null;
  }

  try {
    const payload = jwtDecode<SessionTokenPayload>(token);
    const modules =
      payload.modules && typeof payload.modules === "object"
        ? Object.entries(payload.modules).reduce<Record<string, number | null>>(
            (acc, [moduleKey, value]) => {
              acc[moduleKey] = normalizeModuleValue(value);
              return acc;
            },
            {},
          )
        : null;

    return {
      permission: typeof payload.permission === "number" ? payload.permission : null,
      modules,
    };
  } catch {
    return null;
  }
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

    const accessSubject = getAccessSubjectFromToken(token);
    if (!hasAdminAccess(accessSubject)) {
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
