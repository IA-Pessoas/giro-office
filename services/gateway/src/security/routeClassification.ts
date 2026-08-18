function hasEncodedSeparator(path: string): boolean {
  return /%(?:25)*(?:2f|5c)/i.test(path);
}

function hasUnsafeDotSegment(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";

  return /(?:^|\/)\.{1,2}(?=\/|$)/.test(pathname) || /%(?:25)*2e/i.test(pathname);
}

export function normalizeGatewayPath(path: string): string | null {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    hasUnsafeDotSegment(path)
  ) {
    return null;
  }

  let pathname: string;

  try {
    pathname = new URL(path, "http://gateway.local").pathname;
  } catch {
    return null;
  }

  if (hasEncodedSeparator(pathname)) {
    return null;
  }

  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function matchesGatewayRouteTemplate(template: string, path: string): boolean {
  const normalizedPath = normalizeGatewayPath(path);

  if (
    !template.startsWith("/") ||
    template.startsWith("//") ||
    template.includes("\\") ||
    !normalizedPath
  ) {
    return false;
  }

  const normalizedTemplate = template.length > 1 ? template.replace(/\/+$/, "") : template;
  const templateSegments = normalizedTemplate.split("/").filter(Boolean);
  const pathSegments = normalizedPath.split("/").filter(Boolean);

  return (
    templateSegments.length === pathSegments.length &&
    templateSegments.every(
      (segment, index) =>
        /^\{[^{}]+\}$/.test(segment) ||
        segment.toLowerCase() === pathSegments[index]?.toLowerCase(),
    )
  );
}
