/**
 * Remove todos os caracteres não numéricos de uma string.
 * @param doc A string do documento (CPF ou CNPJ).
 * @returns Apenas os números do documento.
 */
export const cleanDocument = (doc: string | null | undefined): string => {
    // Se o documento for nulo, undefined ou vazio, retorna uma string vazia.
    if (!doc) {
        return '';
    }
    // Usa uma expressão regular para substituir tudo que NÃO é dígito (\D) por nada.
    return doc.replace(/\D/g, '');
};