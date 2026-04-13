import { Request, Response } from "express";
import { MunicipalTaxesService } from "../../services/regularize/MunicipalTaxesService";

class MunicipalTaxesController {
    public create = async (request: Request, response: Response) => {
        const {
            client_id,
            year,
            tff_is_applicable,
            tff_amount,
            tff_notes,
            tff_analysis_is_done,
            tff_analysis_notes,
            tff_sent_date,
            tff_due_date,
            tlp_is_applicable,
            tlp_amount,
            tlp_notes,
            tlp_is_sent,
            tlp_sent_date,
            tlp_due_date,
            tlp_not_email,
            tll_is_applicable,
            tll_amount,
            tll_notes,
            tll_is_sent,
            tll_sent_date,
            tll_due_date,
            tll_analysis_is_done,
            tll_analysis_notes,
        } = request.body;
        const my_id = request.user_id

        const service = new MunicipalTaxesService();
        const create = await service.create({ 
            my_id, 
            client_id,
            year,
            tff_is_applicable,
            tff_amount,
            tff_notes,
            tff_analysis_is_done,
            tff_analysis_notes,
            tff_sent_date,
            tff_due_date,
            tlp_is_applicable,
            tlp_amount,
            tlp_notes,
            tlp_is_sent,
            tlp_sent_date,
            tlp_due_date,
            tlp_not_email,
            tll_is_applicable,
            tll_amount,
            tll_notes,
            tll_is_sent,
            tll_sent_date,
            tll_due_date,
            tll_analysis_is_done,
            tll_analysis_notes,
        });

        return response.json(create);
    }
    public update = async (request: Request, response: Response) => {
        const {
            id,
            client_id,
            year,
            tff_is_applicable,
            tff_amount,
            tff_notes,
            tff_analysis_is_done,
            tff_analysis_notes,
            tff_sent_date,
            tff_due_date,
            tlp_is_applicable,
            tlp_amount,
            tlp_notes,
            tlp_is_sent,
            tlp_sent_date,
            tlp_due_date,
            tlp_not_email,
            tll_is_applicable,
            tll_amount,
            tll_notes,
            tll_is_sent,
            tll_sent_date,
            tll_due_date,
            tll_analysis_is_done,
            tll_analysis_notes,
        } = request.body;
        const my_id = request.user_id

        const service = new MunicipalTaxesService();
        const updated = await service.update({
            my_id, 
            id, 
            client_id,
            year,
            tff_is_applicable,
            tff_amount,
            tff_notes,
            tff_analysis_is_done,
            tff_analysis_notes,
            tff_sent_date,
            tff_due_date,
            tlp_is_applicable,
            tlp_amount,
            tlp_notes,
            tlp_is_sent,
            tlp_sent_date,
            tlp_due_date,
            tlp_not_email,
            tll_is_applicable,
            tll_amount,
            tll_notes,
            tll_is_sent,
            tll_sent_date,
            tll_due_date,
            tll_analysis_is_done,
            tll_analysis_notes,
        });

        return response.json(updated);
    }
    public detail = async (request: Request, response: Response) => {
        let { id } = request.body;
        if (id === undefined)
            id = request.query.id;

        const service = new MunicipalTaxesService();
        const detail = await service.detail(id);

        return response.json(detail);
    }
    public list = async (request: Request, response: Response) => {
        let { year } = request.body;

        const service = new MunicipalTaxesService();
        const list = await service.list(year);
        return response.json(list);
    }

}

export { MunicipalTaxesController };