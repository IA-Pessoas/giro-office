import prismaClient from "../../prisma";
import { EncryptionService } from "../EncryptionService";
import { LogService } from "../LogService";

// DTO para Criação
interface CreateMtkDTO {
    my_id: string;
    local: string;
    user: string;
    password: string;
    notes?: string;
}

// DTO para Atualização
interface UpdateMtkDTO extends CreateMtkDTO {
    id: string;
}

class PasswordService {
    private encryptionService = new EncryptionService();

    public async create({ my_id, local, user, password, notes }: CreateMtkDTO) {
        const exists = await prismaClient.passwordMkt.findFirst({
            where: { local, user, }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const encryptedPassword = this.encryptionService.encrypt(password);

        const create = await prismaClient.passwordMkt.create({
            data: {
                local,
                user,
                password: encryptedPassword,
                notes,
            },
        });

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "mkt.passwords",
            referring_id: create.id,
            changes: "{}"
        })

        return create;
    }

    public async update({ my_id, id, local, user, password, notes }: UpdateMtkDTO) {
        const exists = await prismaClient.passwordMkt.findFirst({
            where: { id }
        })
        if (!exists)
            throw new Error("Não cadastrado")
        
        const encryptedPassword = this.encryptionService.encrypt(password);

        const updated = await prismaClient.passwordMkt.update({
            where: { id },
            data: {
                local,
                user,
                password: encryptedPassword,
                notes,
            },
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "mkt.passwords",
            referring_id: id,
            oldData: exists,
            updatedData: updated,
        });
        
        return updated;
    }

    public async list() {
        const list = await prismaClient.passwordMkt.findMany({
            select: {
                id: true,
                local: true,
                user: true,
                notes: true,
                updatedAt: true,
            },
            orderBy: {
                local: 'asc',
            },
        });
        return list;
    }

    public async detail(id: string) {
        const mtkPass = await prismaClient.passwordMkt.findUnique({
            where: { id },
        });

        if (!mtkPass) {
            throw new Error("Registro de senha não encontrado.");
        }

        // Descriptografa a senha para exibição
        const decryptedPassword = this.encryptionService.decrypt(mtkPass.password);

        // Retorna o objeto com a senha em texto puro
        return {
            ...mtkPass,
            password: decryptedPassword,
        };
    }
}

export { PasswordService };