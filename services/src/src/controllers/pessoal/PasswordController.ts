import { Request, Response } from "express";
import { PasswordService } from "../../services/pessoal/PasswordService";

class PasswordController {

    public create = async (request: Request, response: Response) => {
        const data = request.body;
        const my_id = request.user_id;

        const service = new PasswordService();
        const result = await service.create(my_id,data);

        return response.status(201).json(result);
    }

    public update = async (request: Request, response: Response) => {
        const my_id = request.user_id
        const data = request.body;

        if (!data.id) throw new Error("O ID é obrigatório para atualizar.");

        const service = new PasswordService();
        const result = await service.update(my_id, data);

        return response.json(result);
    }

    public list = async (request: Request, response: Response) => {
        const { clientId } = request.query;
        if (!clientId) throw new Error("O 'clientId' é obrigatório.");

        const service = new PasswordService();
        const result = await service.list(clientId as string);

        return response.json(result);
    }

    public detail = async (request: Request, response: Response) => {
        const { id } = request.query;

        if (!id) throw new Error("O 'id' é obrigatório para ver os detalhes.");

        const service = new PasswordService();
        const result = await service.detail(id as string);

        return response.json(result);
    }

    public delete = async (request: Request, response: Response) => {
        const { id } = request.body; 
        const my_id = request.user_id

        if (!id) throw new Error("O 'id' é obrigatório para deletar.");

        const service = new PasswordService();
        const result = await service.delete(my_id, id);

        return response.json(result);
    }
}

export { PasswordController };