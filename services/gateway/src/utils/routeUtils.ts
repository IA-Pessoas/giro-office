export function isUserServiceRoute(path: string): boolean {
  return (
    path === "/session" ||
    path === "/start-config" ||
    path === "/me" ||
    path === "/users" ||
    path.startsWith("/users/") ||
    path.startsWith("/permission/")
  );
}
