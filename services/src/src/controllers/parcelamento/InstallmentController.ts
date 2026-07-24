import { Request, Response } from "express";
import { InstallmentService } from "../../services/parcelamento/InstallmentService";

class InstallmentController {
    public create = async (request: Request, response: Response) => {
        const { 
            client_id,
            type,
            legal_nature,
            jurisdiction,
            is_automatic_debit,
            first_installment_amount,
            current_month_installment_amount,
            agreed_installments_count,
            enrollment_date,
        } = request.body;
        const my_id = request.user_id

        const is = new InstallmentService();
        const create = await is.create({
            my_id,
            client_id,
            type,
            legal_nature,
            jurisdiction,
            is_automatic_debit,
            first_installment_amount,
            current_month_installment_amount,
            agreed_installments_count,
            enrollment_date,
        });

        return response.json(create);
    }
    public update = async (request: Request, response: Response) => {
        const { 
            installment_id,
            type,
            legal_nature,
            jurisdiction,
            is_automatic_debit,
            consolidated_total_amount,
            first_installment_amount,
            current_month_installment_amount,
            agreed_installments_count,
            enrollment_date,
            document_url,
            situation_shutdown,
            status
        } = request.body;
        const my_id = request.user_id

        const is = new InstallmentService();

        const updated = await is.update({
            my_id,
            installment_id,
            type,
            legal_nature,
            jurisdiction,
            is_automatic_debit,
            consolidated_total_amount,
            first_installment_amount,
            current_month_installment_amount,
            agreed_installments_count,
            enrollment_date,
            document_url,
            situation_shutdown,
            status
        });

        return response.json(updated);
    }
    public detail = async (request: Request, response: Response) => {
        let { installment_id } = request.body;
        if (installment_id === undefined)
            installment_id = request.query.certificate_id;
        
        const is = new InstallmentService();
        const detail = await is.detail(installment_id);
        return response.json(detail);
    }
    public list = async (request: Request, response: Response) => {
        const { client_id } = request.body;
        const is = new InstallmentService();
        const list = await is.list(client_id);
        return response.json(list);
    }

    public createInstallmentCompetence = async (request: Request, response: Response) => {
        const { 
            competence,
            installment_id,
            how_many_paid,
            how_many_overdue,
            download,
            download_notes,
            upload_file,
            is_sent,
            submission_type,
            notes,
            installment_amount,
        } = request.body;
        const my_id = request.user_id

        const is = new InstallmentService();
        const create = await is.createInstallmentCompetence({
            my_id,
            competence,
            installment_id,
            how_many_paid,
            how_many_overdue,
            download,
            download_notes,
            upload_file,
            is_sent,
            submission_type,
            notes,
            installment_amount,
        });

        return response.json(create);
    }
    public updateInstallmentCompetence = async (request: Request, response: Response) => {
        const { 
            competence_installment_id,
            how_many_paid,
            how_many_overdue,
            download,
            download_notes,
            upload_file,
            is_sent,
            submission_type,
            notes,
            installment_amount,
        } = request.body;
        const my_id = request.user_id

        const is = new InstallmentService();

        const updated = await is.updateInstallmentCompetence({
            my_id,
            competence_installment_id,
            how_many_paid,
            how_many_overdue,
            download,
            download_notes,
            upload_file,
            is_sent,
            submission_type,
            notes,
            installment_amount,
        });

        return response.json(updated);
    }

}

export { InstallmentController };