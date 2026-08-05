import { Request, Response } from "express"
import { PermissionService } from "../services/PermissionService"

class PermissionController {
    public createPermissionIntegracao = async (request: Request, response: Response): Promise<void> => {
        const { user_id, block_tasks, urgent_tasks_monitoring } = request.body
        const my_id = request.user_id
        
        const ps = new PermissionService()
        
        const permission = await ps.createPermissionIntegracao(my_id, user_id, block_tasks, urgent_tasks_monitoring)
        
        response.json(permission)
    }
    public updatePermissionIntegracao = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        const { user_id, block_tasks, urgent_tasks_monitoring } = request.body

        const ps = new PermissionService()

        const permission = await ps.UpdatePermissionIntegracao(my_id, user_id, block_tasks, urgent_tasks_monitoring) 

        response.json(permission)
    }
    public getPermissionIntegracao = async (request: Request, response: Response): Promise<void> => {
        const { user_id } = request.body

        const ps = new PermissionService()

        const permission = await ps.getPermissionIntegracao(user_id) 

        response.json(permission)
    }
}

export { PermissionController }