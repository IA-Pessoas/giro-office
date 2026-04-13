import { Request, Response } from "express";
import { CertificateService } from "../../services/certificate/CertificateService";

class CertificateController {
    public details = async (request: Request, response: Response) => {
        let { certificate_id, type } = request.body;
        if (certificate_id === undefined)
            certificate_id = request.query.certificate_id;
        if (type === undefined)
            type = request.query.type;
        const cs = new CertificateService();
        const detail = await cs.detail(certificate_id, type);
        return response.json(detail);
    }
    public list = async (request: Request, response: Response) => {
        const { status, type, client_status, password_access } = request.body;
        const cs = new CertificateService();
        const list = await cs.list(status, type, client_status, password_access);
        return response.json(list);
    }
    public listNotification = async (request: Request, response: Response) => {
        const cs = new CertificateService();
        const list = await cs.listNotification();
        return response.json(list);
    }

    public createPJ = async (request: Request, response: Response) => {
        const { 
            client_castelo_status, 
            client_focus_status, 
            name, 
            cnpj,
            responsible, 
            model, 
            legal_nature, 
            password, 
            expiration_date, 
            notes, 
            was_paid, 
            payment_date, 
            payment_amount, 
            contact_info, 
            file_path, 
            has_certificate 
        } = request.body;
        const my_id = request.user_id

        const cs = new CertificateService();
        const create = await cs.createPJ({
            my_id,
            client_castelo_status, 
            client_focus_status, 
            name, 
            cnpj,
            responsible, 
            model, 
            legal_nature, 
            password, 
            expiration_date, 
            notes, 
            was_paid, 
            payment_date, 
            payment_amount, 
            contact_info, 
            file_path, 
            has_certificate 
        });

        return response.json(create);
    }
    public updatePJ = async (request: Request, response: Response) => {
        const { 
            certificate_id,
            client_castelo_status, 
            client_focus_status, 
            name, 
            cnpj,
            responsible, 
            model, 
            legal_nature, 
            password, 
            expiration_date, 
            notes, 
            was_paid, 
            payment_date, 
            payment_amount, 
            contact_info, 
            file_path, 
            has_certificate  
        } = request.body;
        const my_id = request.user_id

        const cs = new CertificateService();

        const updatedBudget = await cs.updatePJ({
            my_id,
            certificate_id,
            client_castelo_status, 
            client_focus_status, 
            name, 
            cnpj,
            responsible, 
            model, 
            legal_nature, 
            password, 
            expiration_date, 
            notes, 
            was_paid, 
            payment_date, 
            payment_amount, 
            contact_info, 
            file_path, 
            has_certificate 
        });

        return response.json(updatedBudget);
    }

    public createPF = async (request: Request, response: Response) => {
        const { 
            client_castelo_status,
            client_focus_status,
            name,
            cpf,
            model,
            password,
            expiration_date,
            notes,
            enterprise,
            cnpj,
            was_paid,
            payment_date,
            payment_amount,
            contact_info,
            file_path,
            has_certificate,
        } = request.body;
        const my_id = request.user_id

        const cs = new CertificateService();
        const create = await cs.createPF({
            my_id,
            client_castelo_status,
            client_focus_status,
            name,
            cpf,
            model,
            password,
            expiration_date,
            notes,
            enterprise,
            cnpj,
            was_paid,
            payment_date,
            payment_amount,
            contact_info,
            file_path,
            has_certificate,
        });

        return response.json(create);
    }
    public updatePF = async (request: Request, response: Response) => {
        const { 
            certificate_id,
            client_castelo_status,
            client_focus_status,
            name,
            cpf,
            model,
            password,
            expiration_date,
            notes,
            enterprise,
            cnpj,
            was_paid,
            payment_date,
            payment_amount,
            contact_info,
            file_path,
            has_certificate,
        } = request.body;
        const my_id = request.user_id

        const cs = new CertificateService();

        const updatedBudget = await cs.updatePF({
            my_id,
            certificate_id,
            client_castelo_status,
            client_focus_status,
            name,
            cpf,
            model,
            password,
            expiration_date,
            notes,
            enterprise,
            cnpj,
            was_paid,
            payment_date,
            payment_amount,
            contact_info,
            file_path,
            has_certificate,
        });

        return response.json(updatedBudget);
    }

}

export { CertificateController };