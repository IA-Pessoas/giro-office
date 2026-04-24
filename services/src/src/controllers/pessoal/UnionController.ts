import { Request, Response } from "express";
import { UnionService } from "../../services/pessoal/UnionService";

class UnionController {
    public create = async (request: Request, response: Response) => {
        const { name, cnpj, base_date } = request.body;
        const my_id = request.user_id

        const service = new UnionService();
        const create = await service.create({ my_id, name, cnpj, base_date });

        return response.json(create);
    }
    public update = async (request: Request, response: Response) => {
        const { union_id, name, cnpj, base_date } = request.body;
        const my_id = request.user_id

        const service = new UnionService();

        const updatedBudget = await service.update({ my_id, union_id, name, cnpj, base_date });

        return response.json(updatedBudget);
    }
    public detail = async (request: Request, response: Response) => {
        let { union_id } = request.body;
        if (union_id === undefined)
            union_id = request.query.union_id;

        const service = new UnionService();
        const detail = await service.detail(union_id);

        return response.json(detail);
    }
    public list = async (request: Request, response: Response) => {
        const service = new UnionService();
        const list = await service.list();
        return response.json(list);
    }

}

export { UnionController };