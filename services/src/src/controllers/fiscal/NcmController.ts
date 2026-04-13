import { Request, Response } from "express";
import { NcmService } from "../../services/fiscal/NcmService";

class NcmController {
    public createNCM = async (request: Request, response: Response) => {
        const { 
            tax_regime,
            ncm_code,
            federal_taxation_type,
            description,
            ncm_notes,
            cst_pis_outgoing,
            cst_cofins_outgoing,
            product_group,
            validity_start_date,
            information_source,
            reference_legislation,
            validity_end_date, 
        } = request.body;
        const my_id = request.user_id

        const ns = new NcmService();
        const create = await ns.createNCM({
            my_id,
            tax_regime,
            ncm_code,
            federal_taxation_type,
            description,
            ncm_notes,
            cst_pis_outgoing,
            cst_cofins_outgoing,
            product_group,
            validity_start_date,
            information_source,
            reference_legislation,
            validity_end_date,
        });

        return response.json(create);
    }
    public updateNCM = async (request: Request, response: Response) => {
        const { 
            ncm_id,
            tax_regime,
            ncm_code,
            federal_taxation_type,
            description,
            ncm_notes,
            cst_pis_outgoing,
            cst_cofins_outgoing,
            product_group,
            validity_start_date,
            information_source,
            reference_legislation,
            validity_end_date, 
        } = request.body;
        const my_id = request.user_id

        const ns = new NcmService();

        const updated = await ns.updateNCM({
            my_id,
            ncm_id,
            tax_regime,
            ncm_code,
            federal_taxation_type,
            description,
            ncm_notes,
            cst_pis_outgoing,
            cst_cofins_outgoing,
            product_group,
            validity_start_date,
            information_source,
            reference_legislation,
            validity_end_date, 
        });

        return response.json(updated);
    }
    public detailNCM = async (request: Request, response: Response) => {
        let { ncm_id } = request.body;
        if (ncm_id === undefined)
            ncm_id = request.query.ncm_id;
        
        const ns = new NcmService();
        const detail = await ns.detailNCM(ncm_id);

        return response.json(detail);
    }
    public listNCM = async (request: Request, response: Response) => {
        const { ncmCodes } = request.body;

        const ns = new NcmService();
        const list = await ns.listNCM(ncmCodes);

        return response.json(list);
    }

    public createICMS = async (request: Request, response: Response) => {
        const { 
            state,
            item_number,
            cest_code,
            description,
            interstate_agreement,
            applied_original_mva,
            adjusted_mva,
            original_mva,
        } = request.body;
        const my_id = request.user_id

        const ns = new NcmService();
        const create = await ns.createICMS({
            my_id,
            state,
            item_number,
            cest_code,
            description,
            interstate_agreement,
            applied_original_mva,
            adjusted_mva,
            original_mva,
        });

        return response.json(create);
    }
    public updateICMS = async (request: Request, response: Response) => {
        const { 
            icms_id,
            state,
            item_number,
            cest_code,
            description,
            interstate_agreement,
            applied_original_mva,
            adjusted_mva,
            original_mva, 
        } = request.body;
        const my_id = request.user_id

        const ns = new NcmService();

        const updated = await ns.updateICMS({
            my_id, 
            icms_id,
            state,
            item_number,
            cest_code,
            description,
            interstate_agreement,
            applied_original_mva,
            adjusted_mva,
            original_mva, 
        });

        return response.json(updated);
    }
    public detailICMS = async (request: Request, response: Response) => {
        let { icms_id } = request.body;
        if (icms_id === undefined)
            icms_id = request.query.icms_id;
        
        const ns = new NcmService();
        const detail = await ns.detailICMS(icms_id);

        return response.json(detail);
    }
    public listICMS = async (request: Request, response: Response) => {
        const { icmsCodes } = request.body;

        const ns = new NcmService();
        const list = await ns.listICMS(icmsCodes);

        return response.json(list);
    }

    public createIPI = async (request: Request, response: Response) => {
        const { 
            ncm,
            ex,
            description,
            aliquot,
        } = request.body;
        const my_id = request.user_id

        const ns = new NcmService();
        const create = await ns.createIPI({
            my_id,
            ncm,
            ex,
            description,
            aliquot,
        });

        return response.json(create);
    }
    public updateIPI = async (request: Request, response: Response) => {
        const { 
            ipi_id,
            ncm,
            ex,
            description,
            aliquot,
        } = request.body;
        const my_id = request.user_id

        const ns = new NcmService();

        const updated = await ns.updateIPI({
            my_id,
            ipi_id,
            ncm,
            ex,
            description,
            aliquot,
        });

        return response.json(updated);
    }
    public detailIPI = async (request: Request, response: Response) => {
        let { ipi_id } = request.body;
        if (ipi_id === undefined)
            ipi_id = request.query.ipi_id;
        
        const ns = new NcmService();
        const detail = await ns.detailIPI(ipi_id);

        return response.json(detail);
    }
    public listIPI = async (request: Request, response: Response) => {
        const { ipiCodes } = request.body;

        const ns = new NcmService();
        const list = await ns.listIPI(ipiCodes);

        return response.json(list);
    }

    public seachNCM = async (request: Request, response: Response) => {
        const { ncmCode } = request.body;

        const ns = new NcmService();
        const list = await ns.seachNCM(ncmCode);

        return response.json(list);
    }
}

export { NcmController };