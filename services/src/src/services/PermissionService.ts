import prismaClient from "../prisma"
import { LogService } from './LogService';

class PermissionService {
    async createPermissionIntegracao(
        my_id: string,
        user_id: string,
        block_tasks: boolean,
        urgent_tasks_monitoring: boolean,
    ) {
        try {
            const exists = await prismaClient.permissionProject.findFirst({
                where: {
                    user_id
                }
            })
            if (exists)
                throw new Error("Cadastro já existe")


            const permission = await prismaClient.permissionProject.create({
                data:{
                    user_id,
                    block_tasks,
                    urgent_tasks_monitoring
                },
                select:{
                    user_id: true,
                    block_tasks: true,
                    urgent_tasks_monitoring: true
                }
            }) 

            const ls = new LogService()
            await ls.createLog({
                my_id,
                action: "Cadastro",
                referring: "permissions.project",
                referring_id: permission.user_id,
                changes: "{}"
            })

            return permission
        } catch (error) {
            console.log(error);
            throw new Error("Erro ao cadastrar");
        }
    }
    async UpdatePermissionIntegracao(
        my_id: string,
        user_id: string,
        block_tasks: boolean,
        urgent_tasks_monitoring: boolean,
    ) {
        try {
            const exists = await prismaClient.permissionProject.findFirst({
                where: {
                    user_id
                }
            })
            if (!exists)
                throw new Error("Permissão não localizada")


            const permission = await prismaClient.permissionProject.update({
                where:{
                    user_id: user_id
                },
                data:{
                    block_tasks,
                    urgent_tasks_monitoring
                },
                select:{
                    user_id: true,
                    block_tasks: true,
                    urgent_tasks_monitoring: true
                }
            })

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "permissions.project",
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
    async getPermissionIntegracao(user_id: string) {
        const permission = await prismaClient.permissionProject.findFirst({
            where:{
                user_id,
            },
            select:{
                user_id: true,
                block_tasks: true,
                urgent_tasks_monitoring: true
            }
        })
        if (!permission) {
            throw new Error("Permissão não existe");
        }
        return { permission }
    }
}

export { PermissionService }