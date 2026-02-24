import { Request, Response } from "express";
import { ObrigationsPessoalService } from "../../services/pessoal/ObrigationsPessoalService";

class ObrigacoesPessoalController {
    public create = async (request: Request, response: Response) => {
        const { clientId, competence } = request.body;
        const my_id = request.user_id

        const service = new ObrigationsPessoalService();
        const control = await service.create({
            my_id,
            clientId: clientId as string,
            competence: competence as string,
        });

        return response.json(control);
    }
    public detail = async (request: Request, response: Response) => {
        const { clientId, competence } = request.query;

        const service = new ObrigationsPessoalService();
        const control = await service.detail(clientId as string, competence as string);

        return response.json(control);
    }

    public updateField = async (request: Request, response: Response) => {
        const { id } = request.query as { id: string }
        const my_id = request.user_id
        const data = request.body
        
        const service = new ObrigationsPessoalService();
        const updatedControl = await service.updateField({ my_id, id, data })

        return response.json(updatedControl)
    }

    public comp = async (request: Request, response: Response) => {
        const { competence } = request.body
        const my_id = request.user_id

        const service = new ObrigationsPessoalService();
        const res = await service.comp(my_id, competence as string)

        return response.json(res)
    }
}

export { ObrigacoesPessoalController };