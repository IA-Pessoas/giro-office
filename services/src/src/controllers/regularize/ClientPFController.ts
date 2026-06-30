import { Request, Response } from "express";
import { ClientPFService } from "../../services/regularize/ClientPFService";

class ClientPFController {
    public create = async (request: Request, response: Response) => {
        const { 
            code,
            name,
            sex,
            address,
            city,
            zip_code,
            state,
            profession,
            father,
            mother,
            marital_status,
            date_of_birth,
            cpf,
            rg,
            rg_expedition,
            rg_validity,
            military_certificate,
            ctps,
            cnh,
            cnh_expedition,
            cnh_validity,
            spouse,
            notes,
            status,
        } = request.body;
        const my_id = request.user_id

        const service = new ClientPFService();
        const create = await service.create({ 
            my_id, 
            code,
            name,
            sex,
            address,
            city,
            zip_code,
            state,
            profession,
            father,
            mother,
            marital_status,
            date_of_birth,
            cpf,
            rg,
            rg_expedition,
            rg_validity,
            military_certificate,
            ctps,
            cnh,
            cnh_expedition,
            cnh_validity,
            spouse,
            notes,
            status,
        });

        return response.json(create);
    }
    public update = async (request: Request, response: Response) => {
        const { 
            id,
            code,
            name,
            sex,
            address,
            city,
            zip_code,
            state,
            profession,
            father,
            mother,
            marital_status,
            date_of_birth,
            cpf,
            rg,
            rg_expedition,
            rg_validity,
            military_certificate,
            ctps,
            cnh,
            cnh_expedition,
            cnh_validity,
            spouse,
            notes,
            status, 
        } = request.body;
        const my_id = request.user_id

        const service = new ClientPFService();
        const updated = await service.update({ 
            my_id, 
            id, 
            code,
            name,
            sex,
            address,
            city,
            zip_code,
            state,
            profession,
            father,
            mother,
            marital_status,
            date_of_birth,
            cpf,
            rg,
            rg_expedition,
            rg_validity,
            military_certificate,
            ctps,
            cnh,
            cnh_expedition,
            cnh_validity,
            spouse,
            notes,
            status,
        });

        return response.json(updated);
    }
    public detail = async (request: Request, response: Response) => {
        let { id } = request.body;
        if (id === undefined)
            id = request.query.id;

        const service = new ClientPFService();
        const detail = await service.detail(id);

        return response.json(detail);
    }
    public list = async (request: Request, response: Response) => {
        let { status } = request.body;

        const service = new ClientPFService();
        const list = await service.list(status);
        return response.json(list);
    }

}

export { ClientPFController };