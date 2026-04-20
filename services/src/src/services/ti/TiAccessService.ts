import prismaClient from "../../prisma";
import { EncryptionService } from "../EncryptionService"; // Reutilizando seu serviço!
import { LogService } from "../LogService";

interface UpdatePasswordDTO {
    my_id: string;
    id: string;
    local?: string;
    user_id?: string;
    password?: string;
    notes?: string;
}

interface UpdateExtensionDTO {
    my_id: string;
    id: string;
    user_id?: string;
    number?: string;
}

class TiAccessService {
    private enc = new EncryptionService();

    // --- SENHAS (PasswordTecnologia) ---
    async createPassword(data: { my_id: string, local: string, user_id: string, password: string, notes?: string }) {
        const encrypted = this.enc.encrypt(data.password);
        
        const pass = await prismaClient.passwordTecnologia.create({
            data: {
                local: data.local,
                user_id: data.user_id,
                password: encrypted,
                notes: data.notes
            }
        });
        
        const ls = new LogService();
        await ls.createLog({ my_id: data.my_id, action: "Cadastrar Senha TI", referring: "ti.passwords", referring_id: pass.id, changes: "{}", dep: "ti" });
        return pass;
    }
    async updatePassword(data: UpdatePasswordDTO) {
        const exists = await prismaClient.passwordTecnologia.findUnique({ where: { id: data.id } });
        if (!exists) throw new Error("Senha não encontrada");

        let encryptedPassword = undefined;
        // Se enviou uma nova senha, criptografa ela. Se não, mantém a antiga.
        if (data.password) {
            encryptedPassword = this.enc.encrypt(data.password);
        }

        const updated = await prismaClient.passwordTecnologia.update({
            where: { id: data.id },
            data: {
                local: data.local,
                user_id: data.user_id,
                password: encryptedPassword, // Se for undefined, o Prisma ignora
                notes: data.notes
            }
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id: data.my_id,
            action: "Atualizar Senha TI",
            referring: "ti.passwords",
            referring_id: data.id,
            oldData: exists,
            updatedData: updated,
            dep: "ti"
        });

        return updated;
    }
    async deletePassword(my_id: string, id: string) {
        const exists = await prismaClient.passwordTecnologia.findUnique({ where: { id } });
        if (!exists) throw new Error("Senha não encontrada");

        await prismaClient.passwordTecnologia.delete({ where: { id } });

        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Excluir Senha TI",
            referring: "ti.passwords",
            referring_id: id,
            changes: "Senha excluída",
            dep: "ti"
        });

        return { message: "Senha excluída com sucesso" };
    }

    async listPasswords(user_id?: string) {
        if (user_id) {
            return await prismaClient.passwordTecnologia.findMany({
                where: { user_id },
                select: { id: true, local: true, notes: true, updatedAt: true },
            });
        } else {
            return await prismaClient.passwordTecnologia.findMany({
                select: { id: true, local: true, user: true, notes: true, updatedAt: true },
            });
        }
    }

    async detailPassword(id: string) {
        const pass = await prismaClient.passwordTecnologia.findUnique({ where: { id } });
        if (!pass) throw new Error("Senha não encontrada");

        // Descriptografa ao detalhar
        return {
            ...pass,
            password: this.enc.decrypt(pass.password)
        };
    }

    // --- RAMAIS (ExtensionsTecnologia) ---
    async createExtension(data: { my_id: string, user_id: string, number: string }) {
        return await prismaClient.extensionsTecnologia.create({
            data: { user_id: data.user_id, number: data.number }
        });
    }

    async listExtensions() {
        return await prismaClient.extensionsTecnologia.findMany({
            include: { user: { select: { name: true } } }
        });
    }

    async updateExtension(data: UpdateExtensionDTO) {
        const exists = await prismaClient.extensionsTecnologia.findUnique({ where: { id: data.id } });
        if (!exists) throw new Error("Ramal não encontrado");

        const updated = await prismaClient.extensionsTecnologia.update({
            where: { id: data.id },
            data: {
                user_id: data.user_id,
                number: data.number
            }
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id: data.my_id,
            action: "Atualizar Ramal",
            referring: "ti.extensions",
            referring_id: data.id,
            oldData: exists,
            updatedData: updated,
            dep: "ti"
        });

        return updated;
    }

    async deleteExtension(my_id: string, id: string) {
        const exists = await prismaClient.extensionsTecnologia.findUnique({ where: { id } });
        if (!exists) throw new Error("Ramal não encontrado");

        await prismaClient.extensionsTecnologia.delete({ where: { id } });

        const ls = new LogService();
        await ls.createLog({
            my_id,
            action: "Excluir Ramal",
            referring: "ti.extensions",
            referring_id: id,
            changes: `Ramal ${exists.number} excluído`,
            dep: "ti"
        });

        return { message: "Ramal excluído com sucesso" };
    }
}
export { TiAccessService };