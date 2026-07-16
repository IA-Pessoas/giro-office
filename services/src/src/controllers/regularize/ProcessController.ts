import { Request, Response } from "express";
import { ProcessService } from "../../services/regularize/ProcessService";

class ProcessController {
    public create = async (request: Request, response: Response) => {
        const {
            client_pj_id,
            client_pf_id,
            cpf_cnpj,
            process_type,
            description,
            entry_date,
            completion_date,
            expected_date,
            status,
            observation,
            responsible1_id,
            responsible2_id,
            responsible3_id,
            locking_type,
            urgency,
            task_id,
        } = request.body;
        const my_id = request.user_id

        const service = new ProcessService();
        const create = await service.create({
            my_id,
            client_pj_id,
            client_pf_id,
            cpf_cnpj,
            process_type,
            description,
            entry_date,
            completion_date,
            expected_date,
            status,
            observation,
            responsible1_id,
            responsible2_id,
            responsible3_id,
            locking_type,
            urgency,
            task_id,
        });

        return response.json(create);
    }
    public update = async (request: Request, response: Response) => {
        const {
            id,
            client_pj_id,
            client_pf_id,
            cpf_cnpj,
            process_type,
            description,
            entry_date,
            completion_date,
            expected_date,
            status,
            observation,
            responsible1_id,
            responsible2_id,
            responsible3_id,
            locking_type,
            urgency,
            task_id,
        } = request.body;
        const my_id = request.user_id

        const service = new ProcessService();
        const updated = await service.update({
            my_id, 
            id,
            client_pj_id,
            client_pf_id,
            cpf_cnpj,
            process_type,
            description,
            entry_date,
            completion_date,
            expected_date,
            status,
            observation,
            responsible1_id,
            responsible2_id,
            responsible3_id,
            locking_type,
            urgency,
            task_id,
        });

        return response.json(updated);
    }
    public detail = async (request: Request, response: Response) => {
        let { id } = request.body;
        if (id === undefined)
            id = request.query.id;

        const service = new ProcessService();
        const detail = await service.detail(id);

        return response.json(detail);
    }
    public list = async (request: Request, response: Response) => {
        let { status } = request.body;

        const service = new ProcessService();
        const list = await service.list(status);
        return response.json(list);
    }

}

export { ProcessController };