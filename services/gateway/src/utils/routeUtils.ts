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

export function isTaskServiceRoute(path: string): boolean {
  return (
    path === "/integracao-tasksModel" ||
    path === "/integracao-taskModel" ||
    path === "/integracao-tasksModel-dependent" ||
    path === "/integracao-taskModel-dependent"
  );
}
