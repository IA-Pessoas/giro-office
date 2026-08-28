export function getOwnDataProperty(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
