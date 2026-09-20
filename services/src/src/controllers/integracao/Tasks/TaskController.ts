import { Request, Response } from "express"
import { TaskService } from "../../../services/integracao/Tasks/TaskService"

class TaskController {
    // Model
    public createModel = async (request: Request, response: Response): Promise<void> => {
        const { 
            name,
            department_id,
            responsible_id,
            responsible2_id,
            responsible3_id,
            observations,
            billing,
            prevision,
            type,
        } = request.body
        const my_id = request.user_id
      
        const ts = new TaskService()

        const create = await ts.createModel({ 
            my_id,
            name,
            department_id,
            responsible_id,
            responsible2_id,
            responsible3_id,
            observations,
            billing,
            prevision,
            type,
        })

         response.json(create)
    }
    public detailModel = async (request: Request, response: Response): Promise<void> => {
        let { task_id } = request.body
        if (task_id === undefined)
            task_id = request.query.task_id

        const ts = new TaskService()
        const detail = await ts.detailModel(task_id)

        response.json(detail)
    }
    public deletarModel = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        let { task_id } = request.body
        if (task_id === undefined)
            task_id = request.query.task_id

        const ts = new TaskService()
        const del = await ts.deleteModel({ task_id, my_id })

        response.json(del)
    }
    public updateModel = async (request: Request, response: Response): Promise<void> => {
        const { 
            task_id,
            name,
            department_id,
            responsible_id,
            responsible2_id,
            responsible3_id,
            observations,
            billing,
            prevision,
            type,
        } = request.body
        const my_id = request.user_id

        const ts = new TaskService()
        const update = await ts.updateModel({
            my_id,
            task_id,
            name,
            department_id,
            responsible_id,
            responsible2_id,
            responsible3_id,
            observations,
            billing,
            prevision,
            type,
        })

        response.json(update)
    }
    public listModel = async (request: Request, response: Response): Promise<void> => {
        let { type, billing } = request.body
        if (type === undefined) {
            type = request.query.type
            billing = request.query.billing
        }

        const ts = new TaskService()
        const list = await ts.listModel(type, billing)

        response.json(list)
    }
    public addDependent = async (request: Request, response: Response): Promise<void> => {
        const { 
            task_id,
            dependent_id,
            wait,
            observation,
        } = request.body
        const my_id = request.user_id
      
        const ts = new TaskService()

        const create = await ts.addDependent({ 
            my_id,
            task_id,
            dependent_id,
            wait,
            observation,
        })

        response.json(create)
    }
    public listDependent = async (request: Request, response: Response): Promise<void> => {
        let { task_id } = request.body
        if (task_id === undefined)
            task_id = request.query.task_id

        const ts = new TaskService()
        const list = await ts.listDependent(task_id)

        response.json(list)
    }
    public deleteDependent = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        let { task_id } = request.body
        if (task_id === undefined)
            task_id = request.query.task_id

        const ts = new TaskService()
        const del = await ts.deleteDependent({ task_id, my_id })

        response.json(del)
    }

    // Task
    public create = async (request: Request, response: Response): Promise<void> => {
        const { 
            model_id,
            project_id,
            client_id,
            prospecting_status,
            observations,
            urgency,
        } = request.body
        const my_id = request.user_id
      
        const ts = new TaskService()

        const create = await ts.create({ 
            my_id,
            model_id,
            project_id,
            client_id,
            prospecting_status,
            observations,
            urgency,
        })

        response.json(create)
    }
    public detail = async (request: Request, response: Response): Promise<void> => {
        let { task_id } = request.body
        if (task_id === undefined)
            task_id = request.query.task_id

        const ts = new TaskService()
        const detail = await ts.detail(task_id)

        response.json(detail)
    }
    public deletar = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        let { task_id } = request.body
        if (task_id === undefined)
            task_id = request.query.task_id

        const ts = new TaskService()
        const del = await ts.delete({ task_id, my_id })

        response.json(del)
    }
    public update = async (request: Request, response: Response): Promise<void> => {
        const { 
            task_id,
            name,
            status,
            department_id,
            observations,
            billing,
            urgency,
            responsible_id,
            responsible2_id,
            responsible3_id,
            prevision_date,
        } = request.body
        const my_id = request.user_id

        const ts = new TaskService()
        const update = await ts.update({
            my_id,
            task_id,
            name,
            status,
            department_id,
            observations,
            billing,
            urgency,
            responsible_id,
            responsible2_id,
            responsible3_id,
            prevision_date,
        })

        response.json(update)
    }
    public lista = async (request: Request, response: Response): Promise<void> => {
        let { type, ref, ref_id, status } = request.body
        if (type === undefined) {
            type = request.query.type
            ref = request.query.ref
            ref_id = request.query.ref_id
            status = request.query.status
        }

        const ts = new TaskService()
        const list = await ts.list(type, ref, ref_id, status)

        response.json(list)
    }
    public list = async (request: Request, response: Response): Promise<void> => {
        const { status = 'Todos', ref = '', ref_id = '', search = '', page = '1', limit = '20' } = request.query;

        const ts = new TaskService();

        const list = await ts.list(
            String(status),
            String(ref),
            String(ref_id),
            String(search),
            Number(page),
            Number(limit)
        );

        response.json(list);
    }
    public conclusion = async (request: Request, response: Response): Promise<void> => {
        const { 
            task_id,
            status,
            prevision_date,
            end_date,
            responsible_id,
            responsible2_id,
            responsible3_id,
            observations,
            justification,
        } = request.body
        const my_id = request.user_id

        const ts = new TaskService()
        const update = await ts.conclusion({
            my_id,
            task_id,
            status,
            prevision_date,
            end_date,
            responsible_id,
            responsible2_id,
            responsible3_id,
            observations,
            justification,
        })

        response.json(update)
    }
    public completeRequest = async (request: Request, response: Response): Promise<void> => {
        const { task_id } = request.body
        const my_id = request.user_id

        const ts = new TaskService()
        const update = await ts.completeRequest(my_id, task_id)

        response.json(update)
    }

    public updateChargeFinanciero = async (request: Request, response: Response): Promise<void> => {
        const { task_id } = request.body
        const my_id = request.user_id

        const ts = new TaskService()
        const update = await ts.updateChargeFinanciero({
            my_id,
            task_id,
        })

        response.json(update)
    }
}

export { TaskController }
