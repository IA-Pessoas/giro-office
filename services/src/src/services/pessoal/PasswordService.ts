
import { PrismaClient } from "@prisma/client";
import { LogService } from '../LogService'
import { EncryptionService } from "../EncryptionService";

const prismaClient = new PrismaClient();

interface CreatePasswordDTO {
    client_id: string;
    service_name: string; // "Bem Mais", "BSF", etc.
    login_main?: string;
    senha_main?: string;
    login_secondary?: string;
    senha_secondary?: string;
    responsavel_id?: string;
    notes?: string;
}

interface UpdatePasswordDTO extends CreatePasswordDTO {
    id: string;
}

class PasswordService {
    private encryptionService = new EncryptionService();

    // Criptografa um campo, mas só se ele não for nulo/undefined
    private encryptField(data?: string): string | null {
        return data ? this.encryptionService.encrypt(data) : null;
    }
    // Descriptografa um campo, mas só se ele não for nulo
    private decryptField(data?: string | null): string | null {
        return data ? this.encryptionService.decrypt(data) : null;
    }

    public async create(my_id: string, data: CreatePasswordDTO) {
        const exists = await prismaClient.passwordPessoal.findFirst({
            where: {
                client_id: data.client_id,
                service_name: data.service_name,
                login_main: this.encryptField(data.login_main),
                senha_main: this.encryptField(data.senha_main),
                login_secondary: this.encryptField(data.login_secondary),
                senha_secondary: this.encryptField(data.senha_secondary),
                notes: this.encryptField(data.notes),
            },
        });
        if (exists) {
            throw new Error("Registro de senha já existe.");
        }

        const create = await prismaClient.passwordPessoal.create({
            data: {
                client_id: data.client_id,
                service_name: data.service_name,
                responsavel_id: data.responsavel_id,
                login_main: this.encryptField(data.login_main),
                senha_main: this.encryptField(data.senha_main),
                login_secondary: this.encryptField(data.login_secondary),
                senha_secondary: this.encryptField(data.senha_secondary),
                notes: this.encryptField(data.notes),
            },
        });

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "pessoal.passwords",
            referring_id: create.id,
            changes: "{}"
        })

        return create;
    }

    public async update(my_id: string, data: UpdatePasswordDTO) {
        const exists = await prismaClient.passwordPessoal.findFirst({
            where: {
                id: data.id
            }
        })
        if (!exists) {
            throw new Error("Não existe")
        }

        const updated = await prismaClient.passwordPessoal.update({
            where: { id: data.id },
            data: {
                client_id: data.client_id,
                service_name: data.service_name,
                responsavel_id: data.responsavel_id,
                login_main: this.encryptField(data.login_main),
                senha_main: this.encryptField(data.senha_main),
                login_secondary: this.encryptField(data.login_secondary),
                senha_secondary: this.encryptField(data.senha_secondary),
                notes: this.encryptField(data.notes),
            },
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "pessoal.passwords",
            referring_id: data.id,
            oldData: exists,
            updatedData: updated,
        });

        return updated;
    }

    public async list(client_id: string) {
        const list = await prismaClient.passwordPessoal.findMany({
            where: { client_id },
            select: {
                id: true,
                service_name: true,
                responsavel_id: true
            },
            orderBy: {
                service_name: 'asc',
            },
        });
        return list;
    }

    public async detail(id: string) {
        const pass = await prismaClient.passwordPessoal.findUnique({
            where: { id },
            include: {
                responsavel: { select: { id: true, name: true } }
            }
        });

        if (!pass) {
            throw new Error("Registro de senha não encontrado.");
        }

        // Retorna o objeto com tudo descriptografado
        return {
            ...pass,
            login_main: this.decryptField(pass.login_main),
            senha_main: this.decryptField(pass.senha_main),
            login_secondary: this.decryptField(pass.login_secondary),
            senha_secondary: this.decryptField(pass.senha_secondary),
            notes: this.decryptField(pass.notes),
        };
    }

    public async delete(my_id: string, id: string) {
        const exists = await prismaClient.passwordPessoal.findFirst({
            where: {
                id: id
            }
        })
        if (!exists) {
            throw new Error("Não existe")
        }

        await prismaClient.passwordPessoal.delete({
            where: { id },
        });

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Exclusão", 
            referring: "pessoal.ldd",
            referring_id: exists.id,
            changes: exists
        })
        
        return { message: "Senha deletada com sucesso." };
    }
}

export { PasswordService };