import { Request, Response } from "express";
import { LddService } from "../../services/pessoal/LddService";

class LddController {
    public create = async (request: Request, response: Response) => {
        const { 
            client_id,
            type,
            period,
            due_date,
            balance_amount,
            registration_status,
            status,
        } = request.body;
        const my_id = request.user_id

        const service = new LddService();
        const create = await service.create({
            my_id,
            client_id,
            type,
            period,
            due_date,
            balance_amount,
            registration_status,
            status,
        });

        return response.json(create);
    }

    public update = async (request: Request, response: Response) => {
        const { 
            ldd_id,
            type,
            period,
            due_date,
            balance_amount,
            registration_status,
            status,
        } = request.body;
        const my_id = request.user_id

        const service = new LddService();

        const updated = await service.update({
            my_id,
            ldd_id,
            type,
            period,
            due_date,
            balance_amount,
            registration_status,
            status,
        });

        return response.json(updated);
    }

    public list = async (request: Request, response: Response) => {
        const { client_id } = request.body;

        const service = new LddService();
        const list = await service.list(client_id);

        return response.json(list);
    }

    public delete = async (request: Request, response: Response) => {
        const { ldd_id } = request.body; 
        const my_id = request.user_id

        const service = new LddService();
        const deleted = await service.delete({ my_id, ldd_id });

        return response.json(deleted);
    }
}

export { LddController };