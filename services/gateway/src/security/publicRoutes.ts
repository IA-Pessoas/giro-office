interface PublicRoute {
  method?: string;
  pathRegex: RegExp;
}

const publicRoutes: PublicRoute[] = [
  { pathRegex: /^\/health$/ },
  { pathRegex: /^\/ready$/ },
  { method: "POST", pathRegex: /^\/session$/ },
  { method: "POST", pathRegex: /^\/start-config$/ },
  { pathRegex: /^\/socket\.io(?:\/.*)?$/ }
];

export function isPublicRoute(method: string, path: string): boolean {
  return publicRoutes.some((route) => {
    const methodMatches = !route.method || route.method === method.toUpperCase();
    return methodMatches && route.pathRegex.test(path);
  });
}
