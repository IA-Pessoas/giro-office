import { EncryptionService as SharedEncryptionService } from "@workspace/shared";

function getRequiredEncryptionKey(): string {
    const rawKey = process.env.MTK_ENCRYPTION_KEY;

    if (!rawKey) {
        throw new Error("Chave de criptografia 'MTK_ENCRYPTION_KEY' não definida no .env.");
    }

    return rawKey;
}

class EncryptionService extends SharedEncryptionService {
    constructor() {
        super(getRequiredEncryptionKey());
    }
}

export { EncryptionService };
