export const TI_EXTENSION_NUMBER_LENGTH = 4;

const TI_EXTENSION_NUMBER_PATTERN = /^[0-9]{4}$/;

export function sanitizeTiExtensionNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, TI_EXTENSION_NUMBER_LENGTH);
}

export function isValidTiExtensionNumber(value: string): boolean {
  return TI_EXTENSION_NUMBER_PATTERN.test(value);
}
