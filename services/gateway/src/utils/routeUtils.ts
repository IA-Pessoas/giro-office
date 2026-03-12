export function isUserServiceRoute(path: string): boolean {
  return (
    path === "/session" ||
    path === "/start-config" ||
    path === "/users" ||
    path.startsWith("/users/")
  );
}
