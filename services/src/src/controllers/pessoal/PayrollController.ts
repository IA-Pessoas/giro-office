import { Request, Response } from "express";
import { PayrollService } from "../../services/pessoal/PayrollService";

class PayrollController {
    public create = async (request: Request, response: Response) => {
        const { 
            client_id,
            responsible_id,
            advance,
            advance_type,
            advance_amount,
            info,
            previous,
            onvio,
            group,
            vt,
            vt_value,
            vt_type,
            va,
            assistance_fee,
            union_id,
            bem_mais,
            bsf,
            reinf,
            employees,
            contact
        } = request.body;
        const my_id = request.user_id

        const service = new PayrollService();
        const create = await service.create({ 
            my_id, 
            client_id,
            responsible_id,
            advance,
            advance_type,
            advance_amount,
            info,
            previous,
            onvio,
            group,
            vt,
            vt_value,
            vt_type,
            va,
            assistance_fee,
            union_id,
            bem_mais,
            bsf,
            reinf,
            employees,
            contact
        });

        return response.json(create);
    }
    public update = async (request: Request, response: Response) => {
        const { 
            client_id,
            responsible_id,
            advance,
            advance_type,
            advance_amount,
            info,
            previous,
            onvio,
            group,
            vt,
            vt_value,
            vt_type,
            va,
            assistance_fee,
            union_id,
            bem_mais,
            bsf,
            reinf,
            employees,
            contact
        } = request.body;
        const my_id = request.user_id

        const service = new PayrollService();

        const updated = await service.update({ 
            my_id,
            client_id,
            responsible_id,
            advance,
            advance_type,
            advance_amount,
            info,
            previous,
            onvio,
            group,
            vt,
            vt_value,
            vt_type,
            va,
            assistance_fee,
            union_id,
            bem_mais,
            bsf,
            reinf,
            employees,
            contact
        });

        return response.json(updated);
    }
    public detail = async (request: Request, response: Response) => {
        let { client_id } = request.body;
        if (client_id === undefined)
            client_id = request.query.client_id;

        const service = new PayrollService();
        const detail = await service.detail(client_id);

        return response.json(detail);
    }
}

export { PayrollController };