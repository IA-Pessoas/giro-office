// Motivo para revisar um CPF/CNPJ já gravado, ou null quando está válido ou vazio.
// CNPJ alfanumérico: cada caractere vale seu código ASCII menos 48, como na regra da Receita.
function checkDigit(values: number[], firstWeight: number): number {
  let weight = firstWeight;
  const sum = values.reduce((total, value) => {
    const next = total + value * weight;
    weight = weight === 2 ? 9 : weight - 1;
    return next;
  }, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function hasValidCheckDigits(document: string): boolean {
  if (/^(.)\1*$/.test(document)) {
    return false;
  }
  const values = [...document].map((char) => char.charCodeAt(0) - 48);
  const base = values.slice(0, -2);
  const firstWeight = document.length === 11 ? 10 : 5;
  const first = checkDigit(base, firstWeight);
  const second = checkDigit([...base, first], firstWeight + 1);
  return values.at(-2) === first && values.at(-1) === second;
}

export function getDocumentIssue(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) {
    return null;
  }
  if (raw.includes("*")) {
    return "Documento mascarado";
  }
  const document = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const isCpf = /^\d{11}$/.test(document);
  const isCnpj = /^[A-Z0-9]{12}\d{2}$/.test(document);
  if (!isCpf && !isCnpj) {
    return "Tamanho inválido";
  }
  return hasValidCheckDigits(document) ? null : "Dígito verificador inválido";
}
