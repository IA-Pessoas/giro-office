import { Request, Response } from "express"
import { AgendaService } from "../../services/Agenda/AgendaService"

class AgendaController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const {
            agenda,
            date,
            client_id,
            location,
            participant_id,
            participant_id_2,
            participant_id_3,
            task_id,
            status,
            obs,
            department_control_id
        } = request.body
        const my_id = request.user_id
      
        const agendaService = new AgendaService()

        const create = await agendaService.create({ 
            my_id,
            agenda,
            date,
            client_id,
            location,
            participant_id,
            participant_id_2,
            participant_id_3,
            task_id,
            status,
            obs,
            department_control_id
        })

        response.json(create)
    }

    public details = async (request: Request, response: Response): Promise<void> => {
        let { agenda_id } = request.body
        if (agenda_id === undefined)
            agenda_id = request.query.agenda_id

        const agendaService = new AgendaService()

        const detail = await agendaService.detail(agenda_id)

        response.json(detail)
    }
    public list = async (request: Request, response: Response): Promise<void> => {
        const { date } = request.body;

        if (!date) {
            response.status(400).json({ error: "Date parameter is required." });
            return;
        }

        const agendaService = new AgendaService();
        const list = await agendaService.list(new Date(String(date)));

        response.json(list);
    }
    public update = async (request: Request, response: Response): Promise<void> => {
        const {
            agenda_id,
            agenda,
            date,
            client_id,
            location,
            participant_id,
            participant_id_2,
            participant_id_3,
            task_id,
            status,
            obs,
        } = request.body
        const my_id = request.user_id

        const agendaService = new AgendaService()
        const update = await agendaService.update({
            my_id,
            agenda_id,
            agenda,
            date,
            client_id,
            location,
            participant_id,
            participant_id_2,
            participant_id_3,
            task_id,
            status,
            obs,
        })

        response.json(update)
    }  
    public updateStatus = async (request: Request, response: Response): Promise<void> => {
        const { agenda_id, status  } = request.body
        const my_id = request.user_id

        const agendaService = new AgendaService()
        const update = await agendaService.updateStatus(my_id, agenda_id, status)

        response.json(update)
    }  

}

export { AgendaController }