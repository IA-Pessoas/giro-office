type MulterFile = Express.Multer.File;
import bcrypt from "bcryptjs"
import jwt from 'jsonwebtoken'

import prismaClient from "../prisma"
import { bucket } from '../config/firebase';
import { LogService } from './LogService';
import { error as logError } from "@workspace/shared";
interface CreateRequest {
    my_id: string
    name: string
    login: string
    password: string
    permission: number
    department_id: string
}
interface LoginRequest {
    login: string
    password: string
}
interface UpdateRequest {
    my_id: string
    user_id: string
    name: string
    password: string
    permission: number
    status: string
    department_id: string
    photo: string
}
interface UpdatePermissionRequest {
    user_id: string
    atendimento?: number
    certificado?: number
    comercial?: number
    contabil?: number
    financeiro?: number
    fiscal?: number
    integracao?: number
    marketing?: number
    parcelamento?: number
    pec?: number
    pessoal?: number
    regularize?: number
    rh?: number
    triagem?: number
    wiki?: number
}
interface PermissionSpecificRequest {
    my_id: string
    user_id: string
    task_completion: boolean
}

class UserService {
    private async findUser(field: string, value: string) {
        try {
            if (field === 'login') {
                const user = await prismaClient.user.findFirst({
                    where:{
                        login: value
                    }
                })
                return user

            } else if (field === 'id') {
                const user = await prismaClient.user.findFirst({
                    where:{
                        id: value
                    }
                })
                return user
            }
        } catch (error) {
            logError('Erro ao buscar usuário no banco de dados', { field, value, error });
            const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
            throw new Error(`Erro de conexão com o banco de dados: ${errorMessage}`);
        }
    }
    private async findPermission(value: string) {
        const permission = await prismaClient.permission.findFirst({
            where:{
                id: value
            }
        });
        return permission
    }
    private async findPermissionSpecific(value: string) {
        const permission = await prismaClient.permissionSpecific.findFirst({
            where:{
                user_id: value
            }
        });
        return permission
    }
    async getName(user_id: string) {
        const user = await prismaClient.user.findFirst({
            where:{
                id: user_id
            }
        })

        return user ? user.name : null
    }

    async create({ my_id, name, login, password, permission, department_id }: CreateRequest) {

        if (!login) {
            throw new Error('Login Incorreto!');
        }

        const userExists = await prismaClient.user.findFirst({
            where:{
                login: login
            }
        })
        if (userExists) {
            throw new Error("Login já cadastrado")
        }

        const passwordHash = await hash(password, 8)

        const user = await prismaClient.user.create({
            data:{
                name: name,
                login: login,
                password: passwordHash,
                permission: permission,
                status: 'Ativo', 
                department_id: department_id,
            },
            select:{
                id: true,
                name: true,
                login: true,
                permission: true,
                department_id: true,
            }
        }) 

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "users",
            referring_id: user.id,
            changes: "{}"
        })

        this.createPermission(user.id)

        return { user }
    }
    async login({ login, password }: LoginRequest) {
        try {
            const user = await this.findUser('login', login);
            if (!user) {
                throw new Error("Login/Senha Incorreto!")
            }

            const passwordMatch = await bcrypt.compare(password, user.password)
            if (!passwordMatch) {
                throw new Error("Login/Senha Incorreto!")
            }

            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                throw new Error("JWT_SECRET não está definido nas variáveis de ambiente.");
            }
            const token = jwt.sign(
                {
                    name: user.name,
                    login: user.login,
                    permission: user.permission,
                    organization_id: user.organization_id
                },
                jwtSecret,
                {
                    subject: user.id,
                    expiresIn: '365d'
                }
            )

            return { 
                id: user.id,
                name: user.name,
                login: user.login,
                permission: user.permission,
                organization_id: user.organization_id,
            },
            jwtSecret,
            {
                subject: user.id,
                expiresIn: '365d',
                department_id: user.department_id,
                token: token,   
            }
        } catch (error) {
            logError('Erro no login', { login, error });
            throw error;
        }
    }
    
    async detail(user_id: string) {
        if (!user_id) {
            throw new Error('user_id é obrigatório');
        }

        try {
            const user = await prismaClient.user.findFirst({
                where:{
                    id: user_id
                },
                select:{
                    id: true,
                    name: true,
                    login: true,
                    password: true,
                    permission: true,
                    department_id: true,
                    status: true,
                    photo_url: true,
                }
            })

            if (!user) {
                throw new Error('Usuário não encontrado');
            }

            return { user }
        } catch (error) {
            throw error;
        }
    }
    async update({ my_id, user_id, name, password, permission, status, department_id, photo }: UpdateRequest) {
        try{
            const userExists = await this.findUser('id', user_id);
            if (!userExists) {
                throw new Error("Usuário não existe");
            }

            password = (password !== '') ? await hash(password, 8) : userExists.password;
            const permissionNumber = Number(permission);

            const userUpdated = await prismaClient.user.update({
                where:{
                    id: user_id
                },
                data:{
                    name,
                    password,
                    permission: permissionNumber,
                    status,
                    department_id,
                    photo,
                },
                select:{
                    name: true,
                    permission: true,
                    status: true,
                    department_id: true,
                    photo: true,
                }
            })

            const oldData = userExists
            const updatedData = userUpdated
            const ls = new LogService()
            const changes: Record<string, any> = {}

            for (const key of Object.keys(updatedData)) {
                if (key === 'photo' || key === 'password') continue

                if (updatedData[key as keyof typeof updatedData] !== oldData[key as keyof typeof oldData]) {
                    changes[key] = {
                        from: oldData[key as keyof typeof oldData],
                        to: updatedData[key as keyof typeof updatedData],
                    }
                }
            }

            if (Object.keys(changes).length > 0) {
                await ls.createLog({
                    my_id,
                    action: "Atualização",
                    referring: "users",
                    referring_id: user_id,
                    changes
                })
            }

            return userUpdated;
        } catch (error) {
            console.log(error);
            throw new Error("Erro ao atualizar");
        }
    }
    async uploadUserPhoto(file: MulterFile, user_id: string) {
        return new Promise<{ filePath: string }>((resolve, reject) => {
            try {
                const fileExtension = file.originalname.split('.').pop();
                const filePath = `users/${user_id}/${user_id}.${fileExtension}`;
                const blob = bucket.file(filePath);

                const blobStream = blob.createWriteStream({
                    metadata: {
                        contentType: file.mimetype,
                        cacheControl: 'public, max-age=31536000',
                    },
                });

                blobStream.on("error", (err) => {
                    reject(new Error("Erro no upload para o Firebase: " + err.message));
                });

                blobStream.on("finish", async () => {
                    blob.makePublic()
                        .then(() => {
                            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
                            resolve({filePath: publicUrl })
                        })
                        .catch((err) => {
                            reject(new Error("Não foi possível tornar o arquivo público: " + err.message));
                        });
                });


                blobStream.end(file.buffer);
            } catch (err) {
                if (err instanceof Error) {
                    reject(new Error("Erro interno: " + err.message));
                } else {
                    reject(new Error("Erro interno desconhecido"));
                }
            }
        });
    }    
    async deleteUserPhoto(filePath: string): Promise<void> {
        try {
            const file = bucket.file(filePath);
            await file.delete();
        } catch (err) {
            if (err instanceof Error) {
                console.error("Erro ao deletar a foto:", err.message);
            } else {
                console.error("Erro ao deletar a foto:", err);
            }
        }
    }
    async list(status: string) {
        if (status !== 'Todos') {
            const users = await prismaClient.user.findMany({
                where:{
                    status: status
                },
                select:{
                    id: true,
                    name: true,
                    permission: true,
                    department_id: true,
                    department: {
                        select: {
                            name: true,
                            color: true
                        }
                    }
                }, 
                orderBy: {
                    name: 'asc'
                }
            })
    
            return users;
        } else {
            const users = await prismaClient.user.findMany({
                select:{
                    id: true,
                    name: true,
                    permission: true,
                    status: true,
                    department_id: true,
                },
                orderBy: {
                    name: 'asc'
                }
            })
    
            return users;
        }
    }

    async createPermission(user_id: string) {
        const exists = await prismaClient.permission.findFirst({
            where:{
                user_id: user_id
            }
        })
        if (exists) {
            throw new Error("Permissões já cadastrada")
        }

        const permission = await prismaClient.permission.create({
            data:{
                user_id: user_id,
                atendimento: null,
                certificado: null,
                comercial: null,
                contabil: null,
                financeiro: null,
                fiscal: null,
                integracao: null,
                marketing: null,
                parcelamento: null,
                pec: null,
                pessoal: null,
                regularize: null,
                rh: null,
                triagem: null,
                wiki: null,
            },
            select:{
                id: true,
                user_id: true,
            }
        }) 

        return { permission }
    }
    async updatePermission({ 
        user_id, 
        atendimento,
        certificado,
        comercial,
        contabil,
        financeiro,
        fiscal,
        integracao,
        marketing,
        parcelamento,
        pec,
        pessoal,
        regularize,
        rh,
        triagem,
        wiki,
    }: UpdatePermissionRequest) {
        try{
            const exists = this.findPermission(user_id);
            if (!exists) {
                throw new Error("Permissão não existe");
            }

            const updated = await prismaClient.permission.update({
                where:{
                    id: user_id
                },
                data:{
                    user_id,
                    atendimento,
                    certificado,
                    comercial,
                    contabil,
                    financeiro,
                    fiscal,
                    integracao,
                    marketing,
                    parcelamento,
                    pec,
                    pessoal,
                    regularize,
                    rh,
                    triagem,
                    wiki,
                },
                select:{
                    user_id: true,
                    atendimento: true,
                    certificado: true,
                    comercial: true,
                    contabil: true,
                    financeiro: true,
                    fiscal: true,
                    integracao: true,
                    marketing: true,
                    parcelamento: true,
                    pec: true,
                    pessoal: true,
                    regularize: true,
                    rh: true,
                    triagem: true,
                    wiki: true,
                }
            })

            return updated;
        } catch (error) {
            console.log(error);
            throw new Error("Erro ao atualizar");
        }
    }
    async getPermission(user_id: string, modulo: string) {
        const permission = await prismaClient.permission.findFirst({
            where:{
                user_id,
            },
            select:{
                id: true,
                user_id: true,
                atendimento: true,
                certificado: true,
                comercial: true,
                contabil: true,
                financeiro: true,
                fiscal: true,
                integracao: true,
                marketing: true,
                parcelamento: true,
                pec: true,
                pessoal: true,
                regularize: true,
                rh: true,
                triagem: true,
                wiki: true,
            }
        })

        if (!permission) {
            throw new Error("Permissão não existe");
        }

        if (modulo === 'atendimento') {
            if (permission.atendimento === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'certificado') {
            if (permission.certificado === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'comercial') {
            if (permission.comercial === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'contabil') {
            if (permission.contabil === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'financeiro') {
            if (permission.financeiro === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'fiscal') {
            if (permission.fiscal === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'integracao') {
            if (permission.integracao === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'marketing') {
            if (permission.marketing === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'parcelamento') {
            if (permission.parcelamento === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'pec') {
            if (permission.pec === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'pessoal') {
            if (permission.pessoal === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'regularize') {
            if (permission.regularize === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'rh') {
            if (permission.rh === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'triagem') {
            if (permission.triagem === null) {
                throw new Error("Permissão não existe");
            }
        }
        if (modulo === 'wiki') {
            if (permission.wiki === null) {
                throw new Error("Permissão não existe");
            }
        }        

        return { permission }
    }

    async firstCreate() {
        const userExists = await prismaClient.user.findFirst()
        if (userExists) {
            throw new Error("Login já cadastrado")
        }

        const dep = await prismaClient.department.create({
            data:{
                name: 'Tecnologia', 
                color: '#000000',
                status: 'Ativo', 
                solution: false, 
            },
            select:{
                id: true,
            }
        }) 

        const passwordHash = await hash('Admin', 8)

        const user = await prismaClient.user.create({
            data:{
                name: 'Admin',
                login: 'Admin',
                password: passwordHash,
                permission: 2,
                status: 'Ativo', 
                department_id: dep.id,
            },
            select:{
                id: true,
                name: true,
                login: true,
                permission: true,
                department_id: true,
            }
        }) 

        return { user }
    }

    async createPermissionSpecific({ 
        my_id,
        user_id,
        task_completion,
    }: PermissionSpecificRequest) {
        try {
            const exists = this.findPermissionSpecific(user_id);
            if (!exists) {
                throw new Error("Usuário não existe")
            }

            const permission = await prismaClient.permissionSpecific.create({
                data:{
                    user_id,
                    task_completion,
                },
                select:{
                    user_id: true,
                    task_completion: true,
                }
            }) 

            const ls = new LogService()
            await ls.createLog({
                my_id,
                action: "Cadastro",
                referring: "permissions.specific",
                referring_id: permission.user_id,
                changes: "{}"
            })

            return permission
        } catch (error) {
            console.log(error);
            throw new Error("Erro ao cadastrar");
        }
    }
    async UpdatePermissionSpecific({ 
        my_id,
        user_id,
        task_completion,
    }: PermissionSpecificRequest) {
        try {
            const exists = this.findPermissionSpecific(user_id);
            if (!exists) {
                throw new Error("Usuário não existe")
            }

            const permission = await prismaClient.permissionSpecific.update({
                where:{
                    user_id: user_id
                },
                data:{
                    task_completion,
                },
                select:{
                    user_id: true,
                    task_completion: true
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "permissions.specific",
                referring_id: user_id,
                oldData: exists,
                updatedData: permission,
            });
            
            return permission
        } catch (error) {
            console.log(error);
            throw new Error("Erro ao atualizar");
        }
    }
    async getPermissionSpecific(user_id: string) {
        const permission = await prismaClient.permissionSpecific.findFirst({
            where:{
                user_id,
            },
            select:{
                user_id: true,
                task_completion: true,
            }
        })
        if (!permission) {
            throw new Error("Permissão não existe");
        }
        return { permission }
    }
}

export { UserService }