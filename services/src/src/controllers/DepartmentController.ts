import { Request, Response } from "express"
import { DepartmentService } from "../services/DepartmentService"

class DepartmentController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const { name, color, solution } = request.body
        const my_id = request.user_id
      
        const depService = new DepartmentService()

        const dep = await depService.create({ my_id, name, color, solution })

        response.json(dep)
    }

    public details = async (request: Request, response: Response): Promise<void> => {
        let { dep_id } = request.body
        if (dep_id === undefined)
            dep_id = request.query.dep_id

        const depService = new DepartmentService()

        const detail = await depService.detail(dep_id)

        response.json(detail)
    }

    public update = async (request: Request, response: Response): Promise<void> => {
        const { dep_id, name, color, status, solution } = request.body
        const my_id = request.user_id

        const depService = new DepartmentService()
        const update = await depService.update({
            my_id,
            dep_id,
            name,
            color,
            status,
            solution,
        })

        response.json(update)
    }

    public list = async (request: Request, response: Response): Promise<void> => {
        let { status } = request.body
        if (status === undefined)
            status = request.query.status

        const depService = new DepartmentService()
        const deps = await depService.list(status)

        response.json(deps)
    }
}

export { DepartmentController }