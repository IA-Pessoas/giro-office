import { Request, Response } from "express"
import { PAService } from "../../services/integracao/PAService"

class PAController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const { client_id } = request.body
        const my_id = request.user_id
      
        const ps = new PAService()

        const create = await ps.create({ 
            my_id,
            client_id,
        })

        response.json(create)
    }
    public detail = async (request: Request, response: Response): Promise<void> => {
        const { client_id } = request.query;

        if (!client_id || typeof client_id !== 'string') {
            response.status(400).json({ error: 'client_id is required.' });
            return
        }
        const ps = new PAService()
        const detail = await ps.detail(client_id)

        response.json(detail)
    }
    public update = async (request: Request, response: Response): Promise<void> => {
        const { 
            client_id,
            activities,
            tax_billing,
            management_billing,
            works_bidding,
            dissatisfaction,
            registered_collabortors,
            unregistered_collabortors,
            esocial,
            how_many_banks,
            whitch_banks,
            responsible_departments,
            works_system,
            system_name,
            system_usage_time,
            system_value,
            system_contact,
            system_operations,
            cloud_storage,
            which_cloud_storage,
            rental_agreement,
            assessment_regime,
            permit,
            services,
        } = request.body
        const my_id = request.user_id

        const ps = new PAService()
        const update = await ps.update({
            my_id,
            client_id,
            activities,
            tax_billing,
            management_billing,
            works_bidding,
            dissatisfaction,
            registered_collabortors,
            unregistered_collabortors,
            esocial,
            how_many_banks,
            whitch_banks,
            responsible_departments,
            works_system,
            system_name,
            system_usage_time,
            system_value,
            system_contact,
            system_operations,
            cloud_storage,
            which_cloud_storage,
            rental_agreement,
            assessment_regime,
            permit,
            services,
        })

        response.json(update)
    }
}

export { PAController }