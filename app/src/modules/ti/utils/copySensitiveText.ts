export type ClipboardWriter = {
  writeText: (value: string) => Promise<void>;
};

export async function copySensitiveText(
  value: string,
  clipboard: ClipboardWriter | undefined,
): Promise<boolean> {
  if (!clipboard) {
    return false;
  }

  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
