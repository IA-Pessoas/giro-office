import type { ChangeEvent } from "react";

export function forwardFormattedInputChange(
  event: ChangeEvent<HTMLInputElement>,
  format: (value: string) => string,
  onChange: (event: ChangeEvent<HTMLInputElement>) => void,
): void {
  const value = format(event.target.value);

  event.target.value = value;
  event.currentTarget.value = value;
  onChange(event);
}
