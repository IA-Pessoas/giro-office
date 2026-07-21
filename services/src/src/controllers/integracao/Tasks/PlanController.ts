import { request, Request, Response } from "express"
import { PlanService } from "../../../services/integracao/Tasks/PlanService"

class PlanController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const { name, color } = request.body
        const my_id = request.user_id

        const planService = new PlanService()
        const create = await planService.create({ name, color, my_id })

        response.json(create)
    }
    public update = async (request: Request, response: Response): Promise<void> => {
        const { id, name, color } = request.body
        const my_id = request.user_id

        const planService = new PlanService()
        const update = await planService.update({ id, name, color, my_id })

        response.json(update)
    }
    public detail = async (request: Request, response: Response): Promise<void> => {
        let { plan_id } = request.body
        if (plan_id === undefined)
            plan_id = request.query.plan_id

        const planService = new PlanService()
        const detail = await planService.detail(plan_id)

        response.json(detail)
    }
    public list = async (request: Request, response: Response): Promise<void> => {
        const planService = new PlanService()
        const list = await planService.list()

        response.json(list)
    }
    public delete = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        let { id } = request.body
        if (id === undefined)
            id = request.query.id

        const planService = new PlanService()
        const deleted = await planService.delete(id, my_id)

        response.json(deleted)
    }

    public addTask = async (request: Request, response: Response): Promise<void> => {
        const { plan_id, task_id } = request.body
        const my_id = request.user_id

        const planService = new PlanService()
        const add = await planService.addTask({ plan_id, task_id, my_id })

        response.json(add)
    }
    public listTasks = async (request: Request, response: Response): Promise<void> => {
        const { plan_id } = request.body
        
        const planService = new PlanService()
        const list = await planService.listTasks(plan_id)

        response.json(list)
    }
    public reorderTask = async (request: Request, response: Response): Promise<void> => {
        const { plan_id, plan_task_id, direction } = request.body
        const my_id = request.user_id
        
        const planService = new PlanService()
        const list = await planService.reorderTask({ plan_id, plan_task_id, direction, my_id })

        response.json(list)
    }
    public deleteTask = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        let { plan_id, plan_task_id } = request.body

        const planService = new PlanService()
        const deleted = await planService.deleteTask({plan_id, plan_task_id, my_id})

        response.json(deleted)
    }

    public hirePlan = async (request: Request, response: Response): Promise<void> => {
        const { project_id, plan_id } = request.body
        const my_id = request.user_id

        const planService = new PlanService()
        const list = await planService.hirePlan({ project_id, plan_id, my_id })

        response.json(list)
    }

}

export { PlanController }