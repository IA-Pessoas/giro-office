/** Regras da chave de acesso NF-e/NFC-e compartilhadas pelas conferências. */

export const stripZeros = (value: string) => value.replace(/^0+(?=\d)/u, "");

/** Chave NF-e: 44 dígitos com dígito verificador módulo 11. */
export function isValidAccessKey(key: string): boolean {
  if (!/^\d{44}$/u.test(key)) return false;
  let weight = 2;
  let sum = 0;
  for (let i = 42; i >= 0; i -= 1) {
    sum += Number(key[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return Number(key[43]) === (rest < 2 ? 0 : 11 - rest);
}

/** Emitente (14 posições, CPF com zeros), modelo, série e número embutidos na chave. */
export function accessKeyParts(key: string) {
  return {
    issuer: key.slice(6, 20),
    model: key.slice(20, 22),
    series: stripZeros(key.slice(22, 25)),
    number: stripZeros(key.slice(25, 34)),
  };
}

export function identityFromAccessKey(key: string): string {
  const parts = accessKeyParts(key);
  return `${parts.issuer}|${parts.model}|${parts.series}|${parts.number}`;
}
