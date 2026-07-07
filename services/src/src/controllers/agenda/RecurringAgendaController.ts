import { Request, Response } from "express"
import { RecurringAgendaService } from "../../services/Agenda/RecurringAgendaService"

class RecurringAgendaController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const {
            agenda,
            day,
            recurrence,
            client_id,
            location,
            participant_id,
            participant_id_2,
            participant_id_3,
            obs,
            department_control_id,
        } = request.body
        const my_id = request.user_id
      
        const ras = new RecurringAgendaService()

        const create = await ras.create({ 
            my_id,
            agenda,
            day,
            recurrence,
            client_id,
            location,
            participant_id,
            participant_id_2,
            participant_id_3,
            obs,
            department_control_id,
        })

        response.json(create)
    }

    public details = async (request: Request, response: Response): Promise<void> => {
        let { agenda_id } = request.body
        if (agenda_id === undefined)
            agenda_id = request.query.agenda_id

        const ras = new RecurringAgendaService()

        const detail = await ras.detail(agenda_id)

        response.json(detail)
    }
    public list = async (request: Request, response: Response): Promise<void> => {
        const { dep_id } = request.body;

        const ras = new RecurringAgendaService();
        const list = await ras.list(dep_id);

        response.json(list);
    }
    public update = async (request: Request, response: Response): Promise<void> => {
        const {
            agenda_id,
            agenda,
            day,
            recurrence,
            client_id,
            location,
            participant_id,
            participant_id_2,
            participant_id_3,
            obs,
        } = request.body
        const my_id = request.user_id

        const ras = new RecurringAgendaService()
        const update = await ras.update({
            my_id,
            agenda_id,
            agenda,
            day,
            recurrence,
            client_id,
            location,
            participant_id,
            participant_id_2,
            participant_id_3,
            obs,
        })

        response.json(update)
    }
}

export { RecurringAgendaController }