import { Request, Response } from "express"
import { ClientService } from "../services/ClientService"

class ClientController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const {
            type,
            dominio_code,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            cnae,
            responsible,
            cpf_responsible,
            agent,
            cpf_agent,
            number,
            email,
            address,
            cep,
            neighborhood,
            state,
            city,
            customer_since,
            municipal_registration,
            state_registration,
            commercial_board_registration,
            status,
            competence_entry,
            competence_output,
            opening_date,
            instagram,
            indication,
            participants_meet,
            meet_type,
            type_registration,
            regime,
            size,
            segment,
            contabil,
            fiscal,
            pessoal,
            infoproduto,
            consultoria,
            start_strike,
            end_strike,
            deletion_date,
            contract,
            prospecting_status,
            date_status,
            description_prospecting,
            register_date_prospecting,
            service_unique
        } = request.body
        const my_id = request.user_id

        const clientService = new ClientService()

        const create = await clientService.create({ 
            my_id,
            type,
            dominio_code,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            cnae,
            responsible,
            cpf_responsible,
            agent,
            cpf_agent,
            number,
            email,
            address,
            cep,
            neighborhood,
            state,
            city,
            customer_since,
            municipal_registration,
            state_registration,
            commercial_board_registration,
            status,
            competence_entry,
            competence_output,
            opening_date,
            instagram,
            indication,
            participants_meet,
            meet_type,
            type_registration,
            regime,
            size,
            segment,
            contabil,
            fiscal,
            pessoal,
            infoproduto,
            consultoria,
            start_strike,
            end_strike,
            deletion_date,
            contract,
            prospecting_status,
            date_status,
            description_prospecting,
            register_date_prospecting,
            service_unique
        })

        response.json(create)
    }
    public details = async (request: Request, response: Response): Promise<void> => {
        let { client_id } = request.body
        if (client_id === undefined)
            client_id = request.query.client_id

        const clientService = new ClientService()

        const detail = await clientService.detail(client_id)

        response.json(detail)
    }
    public update = async (request: Request, response: Response): Promise<void> => {
        const {
            client_id,
            type,
            dominio_code,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            cnae,
            responsible,
            cpf_responsible,
            agent,
            cpf_agent,
            number,
            email,
            address,
            cep,
            neighborhood,
            state,
            city,
            customer_since,
            municipal_registration,
            state_registration,
            commercial_board_registration,
            status,
            competence_entry,
            competence_output,
            opening_date,
            instagram,
            indication,
            participants_meet,
            meet_type,
            type_registration,
            regime,
            size,
            segment,
            contabil,
            fiscal,
            pessoal,
            infoproduto,
            consultoria,
            start_strike,
            end_strike,
            deletion_date,
            contract,
            prospecting_status,
            date_status,
            description_prospecting,
            register_date_prospecting,
            service_unique
        } = request.body
        const my_id = request.user_id

        const clientService = new ClientService()
        const update = await clientService.update({
            my_id,
            client_id,
            type,
            dominio_code,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            cnae,
            responsible,
            cpf_responsible,
            agent,
            cpf_agent,
            number,
            email,
            address,
            cep,
            neighborhood,
            state,
            city,
            customer_since,
            municipal_registration,
            state_registration,
            commercial_board_registration,
            status,
            competence_entry,
            competence_output,
            opening_date,
            instagram,
            indication,
            participants_meet,
            meet_type,
            type_registration,
            regime,
            size,
            segment,
            contabil,
            fiscal,
            pessoal,
            infoproduto,
            consultoria,
            start_strike,
            end_strike,
            deletion_date,
            contract,
            prospecting_status,
            date_status,
            description_prospecting,
            register_date_prospecting,
            service_unique
        })

        response.json(update)
    }
    public list = async (request: Request, response: Response): Promise<void> => {
        const { status = 'Todos', ref = '', search = '', page = '1', limit = '20' } = request.query;

        const clientService = new ClientService();

        const list = await clientService.list(
            String(status),
            String(ref),
            String(search),
            Number(page),
            Number(limit)
        );

        response.json(list);
    }
    public delete = async (request: Request, response: Response): Promise<void> => {
        let { client_id } = request.body
        const user_id = request.user_id
        
        if (client_id === undefined)
            client_id = request.query.status

        const clientService = new ClientService()
        const del = await clientService.delete({client_id, user_id})

        response.json(del)
    }

    // Integração
    public createIntegracao = async (request: Request, response: Response): Promise<void> => {
        const {
            type,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            opening_date,
            responsible,
            cpf_responsible,
            number,
            email,
            agent,
            cpf_agent,
            instagram,
            indication,
            type_registration,
            service_unique
        } = request.body
        const my_id = request.user_id

        const clientService = new ClientService()

        const create = await clientService.createIntegracao({
            my_id,
            type,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            opening_date,
            responsible,
            cpf_responsible,
            number,
            email,
            agent,
            cpf_agent,
            instagram,
            indication,
            type_registration,
            service_unique
        })

        response.json(create)
    }
    public updateIntegracao = async (request: Request, response: Response): Promise<void> => {
        const {
            client_id,
            type,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            responsible,
            cpf_responsible,
            agent,
            cpf_agent,
            number,
            email,
            address,
            cep,
            neighborhood,
            state,
            city,
            instagram,
            indication,
            type_registration,
            service_unique
        } = request.body
        const my_id = request.user_id

        const clientService = new ClientService()
        const update = await clientService.updateIntegracao({
            my_id,
            client_id,
            type,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            responsible,
            cpf_responsible,
            agent,
            cpf_agent,
            number,
            email,
            address,
            cep,
            neighborhood,
            state,
            city,
            instagram,
            indication,
            type_registration,
            service_unique
        })

        response.json(update)
    }
    public createHistory = async (request: Request, response: Response): Promise<void> => {
        const { client_id, date, history, pending_id } = request.body
        const fileReq = request.file;
        const my_id = request.user_id
        let file: string = "";

        const clientService = new ClientService()

        if (fileReq) {
            const uploadResult = await clientService.uploadHistoryFile(fileReq, client_id);
            file = uploadResult.filePath;
        }

        const create = await clientService.createHistory(my_id, client_id, date, history, file, pending_id)

        response.json(create)
    }
    public detailsHistory = async (request: Request, response: Response): Promise<void> => {
        let { history_id } = request.body
        if (history_id === undefined)
            history_id = request.query.history_id

        const clientService = new ClientService()

        const detail = await clientService.detailHistory(history_id)

        response.json(detail)
    }
    public updateHistory = async (request: Request, response: Response): Promise<void> => {
        const { history_id, date, history } = request.body
        const my_id = request.user_id

        const clientService = new ClientService()
        const update = await clientService.updateHistory(my_id, history_id, date, history)

        response.json(update)
    }
    public listHistory = async (request: Request, response: Response): Promise<void> => {
        const { client_id } = request.query;

        const clientService = new ClientService();

        const list = await clientService.listHistory(client_id as string);

        response.json(list);
    }
    public createHistoryPending = async (request: Request, response: Response): Promise<void> => {
        const { client_id, reason, user_id } = request.body

        const clientService = new ClientService()
        const create = await clientService.createHistoryPending(client_id, reason, user_id)

        response.json(create)
    }
    public listHistoryPending = async (request: Request, response: Response): Promise<void> => {
        const { user_id } = request.query;

        const clientService = new ClientService();

        const list = await clientService.listHistoryPending(user_id as string);

        response.json(list);
    }
    public deleteHistoryPending = async (request: Request, response: Response): Promise<void> => {
        let { id } = request.body
        const my_id = request.user_id

        if (id === undefined)
            id = request.query.status

        const clientService = new ClientService()
        const del = await clientService.deleteHistoryPending(id, my_id)

        response.json(del)
    }

    public termination = async (request: Request, response: Response): Promise<void> => {
        const {
            client_id,
            reason,
            description,
            competence_output
        } = request.body
        const my_id = request.user_id

        const clientService = new ClientService()
        const distrato = await clientService.termination({ my_id, client_id, reason, description, competence_output })

        response.json(distrato)
    }
    
    // Financeiro
    public updateFinanceiro = async (request: Request, response: Response): Promise<void> => {
        const {
            client_id,
            contract,
        } = request.body
        const my_id = request.user_id

        const clientService = new ClientService()
        const update = await clientService.updateFinanceiro({
            my_id,
            client_id,
            contract,
        })

        response.json(update)
    }

    // Regularize
    public updateRegularize = async (request: Request, response: Response): Promise<void> => {
        const {
            client_id,
            dominio_code,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            cnae,
            cnae_secondary,
            responsible,
            cpf_responsible,
            number,
            email,
            address,
            cep,
            neighborhood,
            state,
            city,
            customer_since,
            municipal_registration,
            state_registration,
            commercial_board_registration,
            opening_date,
            regime,
            size,
            segment,
            contabil,
            fiscal,
            pessoal,
            infoproduto,
            consultoria,
            start_strike,
            end_strike,
            deletion_date,
        } = request.body
        const my_id = request.user_id

        const clientService = new ClientService()
        const update = await clientService.updateRegularize({
            my_id,
            client_id,
            dominio_code,
            name,
            company_name,
            fantasy_name,
            cpf_cnpj,
            cnae,
            cnae_secondary,
            responsible,
            cpf_responsible,
            number,
            email,
            address,
            cep,
            neighborhood,
            state,
            city,
            customer_since,
            municipal_registration,
            state_registration,
            commercial_board_registration,
            opening_date,
            regime,
            size,
            segment,
            contabil,
            fiscal,
            pessoal,
            infoproduto,
            consultoria,
            start_strike,
            end_strike,
            deletion_date,
        })

        response.json(update)
    }
}

export { ClientController }
