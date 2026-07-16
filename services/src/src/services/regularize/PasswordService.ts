import prismaClient from "../../prisma";
import { EncryptionService } from "../EncryptionService";
import { LogService } from "../LogService";

interface CreateDTO {
    my_id: string
    client_id: string
    site_id: string
    login: string
    password: string
    notes: string
}

interface UpdateDTO extends CreateDTO {
    id: string
}

class PasswordService {
    private encryptionService = new EncryptionService();

    public async create({ my_id, client_id, site_id, login, password, notes }: CreateDTO) {
        const exists = await prismaClient.passwordRegularize.findFirst({
            where: { 
                client_id,
                site_id,
                login: this.encryptionService.encrypt(login),
                password: this.encryptionService.encrypt(password),
                notes
            }
        })
        if (exists)
            throw new Error("Já cadastrado")

        const encryptedLogin = this.encryptionService.encrypt(login);
        const encryptedPassword = this.encryptionService.encrypt(password);

        const create = await prismaClient.passwordRegularize.create({
            data: {
                client_id,
                site_id,
                login: encryptedLogin,
                password: encryptedPassword,
                notes,
            },
        });

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "regularize.passwordsRegularize",
            referring_id: create.id,
            changes: "{}"
        })

        return create;
    }

    public async update({ my_id, id, client_id, site_id, login, password, notes }: UpdateDTO) {
        const exists = await prismaClient.passwordRegularize.findFirst({
            where: { id }
        })
        if (!exists)
            throw new Error("Não cadastrado")
        
        const encryptedLogin = this.encryptionService.encrypt(login);
        const encryptedPassword = this.encryptionService.encrypt(password);

        const updated = await prismaClient.passwordRegularize.update({
            where: { id },
            data: {
                site_id,
                login: encryptedLogin,
                password: encryptedPassword,
                notes,
            },
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "regularize.passwordsRegularize",
            referring_id: id,
            oldData: exists,
            updatedData: updated,
        });
        
        return updated;
    }

    public async list(client_id: string) {
        const list = await prismaClient.passwordRegularize.findMany({
            where: { client_id },
            select: {
                id: true,
                site_id: true,
                notes: true,
                site: {
                    select: {
                        name: true,
                        link: true,
                        sphere: true,
                    },
                },
            },
            orderBy: {
                site_id: 'asc',
            },
        });
        return list;
    }

    public async detail(id: string) {
        const pass = await prismaClient.passwordRegularize.findUnique({
            where: { id },
        });

        if (!pass) {
            throw new Error("Registro de senha não encontrado.");
        }

        // Descriptografa a senha para exibição
        const decryptedLogin = this.encryptionService.decrypt(pass.login);
        const decryptedPassword = this.encryptionService.decrypt(pass.password);

        // Retorna o objeto com a senha em texto puro
        return {
            ...pass,
            login: decryptedLogin,
            password: decryptedPassword,
        };
    }
}

export { PasswordService };