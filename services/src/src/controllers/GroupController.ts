import { Request, Response } from "express"
import { GroupService } from "../services/GroupService"

class GroupController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const { name } = request.body
        const my_id = request.user_id

        const gs = new GroupService()

        const dep = await gs.create({ my_id, name })

        response.json(dep)
    }

    public details = async (request: Request, response: Response): Promise<void> => {
        let { group_id } = request.body
        if (group_id === undefined)
            group_id = request.query.group_id

        const gs = new GroupService()

        const detail = await gs.detail(group_id)

        response.json(detail)
    }

    public update = async (request: Request, response: Response): Promise<void> => {
        const { group_id, name, status } = request.body
        const my_id = request.user_id

        const gs = new GroupService()
        const update = await gs.update({
            my_id,
            group_id,
            name,
            status,
        })

        response.json(update)
    }

    public list = async (request: Request, response: Response): Promise<void> => {
        let { status } = request.body
        if (status === undefined)
            status = request.query.status

        const gs = new GroupService()
        const deps = await gs.list(status)

        response.json(deps)
    }

    public addClient = async (request: Request, response: Response): Promise<void> => {
        const { group_id, client_id } = request.body
        const my_id = request.user_id

        const gs = new GroupService()

        const create = await gs.addClient({ my_id, group_id, client_id })

        response.json(create)
    }
    public removeClient = async (request: Request, response: Response): Promise<void> => {
        const { group_id } = request.body
        const my_id = request.user_id

        const gs = new GroupService()

        const remove = await gs.removeClient({ my_id, group_id })

        response.json(remove)
    }
}

export { GroupController }