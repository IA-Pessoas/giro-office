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
  type?: "owner" | "admin" | "user" | null;
  modules?: Record<string, unknown>;
}

type SessionAccessPayload = {
  permission: number | null;
  type: SessionTokenPayload["type"];
  modules: Record<string, number | null> | null;
};

const ADMIN_PERMISSION = 2;

function isAdminPermission(permission?: number | null): boolean {
  return typeof permission === "number" && permission >= ADMIN_PERMISSION;
}

function normalizeModuleValue(value: unknown): number | null {
  return value === 0 || value === 1 || value === 2 ? value : null;
}

function normalizeModules(
  modules?: Record<string, unknown> | null,
): Record<string, number | null> | null {
  if (!modules || typeof modules !== "object") {
    return null;
  }

  return Object.entries(modules).reduce<Record<string, number | null>>((acc, [moduleKey, value]) => {
    acc[moduleKey] = normalizeModuleValue(value);
    return acc;
  }, {});
}

function getSessionAccessPayload(token?: string | null): SessionAccessPayload {
  if (!token) {
    return {
      permission: null,
      type: null,
      modules: null,
    };
  }

  try {
    const payload = jwtDecode<SessionTokenPayload>(token);

    return {
      permission: typeof payload.permission === "number" ? payload.permission : null,
      type:
        payload.type === "owner" || payload.type === "admin" || payload.type === "user"
          ? payload.type
          : null,
      modules: normalizeModules(payload.modules),
    };
  } catch {
    return {
      permission: null,
      type: null,
      modules: null,
    };
  }
}

function canAccessAdministrationFromTokenPayload({
  permission,
  type,
  modules,
}: SessionAccessPayload): boolean {
  if (type === "owner") {
    return true;
  }

  if (type === null && isAdminPermission(permission)) {
    return true;
  }

  return modules?.rh === ADMIN_PERMISSION;
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

    if (!canAccessAdministrationFromTokenPayload(getSessionAccessPayload(token))) {
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
