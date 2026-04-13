import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Padrão de criptografia
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const DELIMITER = ':';

// 1. Verificamos a chave ANTES de criar o Buffer.
const rawKey = process.env.MTK_ENCRYPTION_KEY;
if (!rawKey) {
    throw new Error("Chave de criptografia 'MTK_ENCRYPTION_KEY' não definida no .env.");
}
// 2. Agora o 'rawKey' é uma 'string' garantida, e o Buffer.from fica feliz.
const KEY = Buffer.from(rawKey, 'base64'); 
// --------------------------

class EncryptionService {

    constructor() {
        if (KEY.length !== 32) {
            throw new Error("Chave de criptografia 'MTK_ENCRYPTION_KEY' inválida. Verifique seu .env. Deve ter 32 bytes (convertida de base64).");
        }
    }

    /**
     * Criptografa um texto.
     */
    public encrypt(text: string): string {
        const iv = randomBytes(IV_LENGTH);
        const cipher = createCipheriv(ALGORITHM, KEY, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag().toString('hex');

        return `${iv.toString('hex')}${DELIMITER}${authTag}${DELIMITER}${encrypted}`;
    }

    /**
     * Descriptografa um hash.
     */
    public decrypt(hash: string): string {
        try {
            const parts = hash.split(DELIMITER);
            if (parts.length !== 3) {
                throw new Error("Hash de descriptografia inválido.");
            }

            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            // const encryptedText = Buffer.from(parts[2], 'hex'); // <- Não precisamos mais desta linha

            const decipher = createDecipheriv(ALGORITHM, KEY, iv);
            decipher.setAuthTag(authTag);

            // Passamos 'parts[2]' (a string hex) diretamente.
            // O 'update' agora usa a sobrecarga (data: string, inputEncoding: 'hex', outputEncoding: 'utf8')
            // Isso resolve os dois erros de uma vez.
            let decrypted = decipher.update(parts[2], 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            // ---------------------------------

            return decrypted;
        } catch (error) {
            console.error("Erro ao descriptografar:", error);
            throw new Error("Falha ao descriptografar. O hash pode estar corrompido ou a chave incorreta.");
        }
    }
}

export { EncryptionService };