import { Request, Response } from "express"
import { ProjectService } from "../../services/integracao/ProjectService"

class ProjectController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const { 
            name,
            client_id,
            start_date,
            objective,
            sponsor_id,
        } = request.body
        const my_id = request.user_id
      
        const ts = new ProjectService()

        const create = await ts.create({ 
            my_id,
            name,
            client_id,
            start_date,
            objective,
            sponsor_id,
        })

        response.json(create)
    }
    public detail = async (request: Request, response: Response): Promise<void> => {
        const { project_id } = request.query;

        if (!project_id || typeof project_id !== 'string') {
            response.status(400).json({ error: 'Project ID is required.' });
            return
        }
        const ts = new ProjectService()
        const detail = await ts.detail(project_id)

        response.json(detail)
    }
    public deletar = async (request: Request, response: Response): Promise<void> => {
        const my_id = request.user_id
        let { project_id } = request.body
        project_id = (project_id === undefined) ? request.query.project_id : project_id

        const ts = new ProjectService()
        const del = await ts.delete({ project_id, my_id })

        response.json(del)
    }
    public update = async (request: Request, response: Response): Promise<void> => {
        const { 
            project_id,
            name,
            start_date,
            end_date,
            objective,
            sponsor_id,
        } = request.body
        const my_id = request.user_id

        const ts = new ProjectService()
        const update = await ts.update({
            my_id,
            project_id,
            name,
            start_date,
            end_date,
            objective,
            sponsor_id,
        })

        response.json(update)
    }
    public list = async (request: Request, response: Response): Promise<void> => {
        let { ref, id } = request.body
        if (ref === undefined) {
            ref = request.query.ref
            id = request.query.id
        }

        const ts = new ProjectService()
        const list = await ts.list(ref, id)

        response.json(list)
    }

    public listDepTasks = async (request: Request, response: Response): Promise<void> => {
        let { status } = request.body
        if (status === undefined)
            status = request.query.status

        const ts = new ProjectService()
        const deps = await ts.listDepTasks()

        response.json(deps)
    }
}

export { ProjectController }