import { Request, Response } from "express";
import { NoteService } from "../services/NoteService";

class NoteController {
    public create = async (request: Request, response: Response): Promise<void> => {
        const user_id = request.user_id; // Vindo do middleware de autenticação
        const {
            note,
            dueDate,
            hasPenalty,
            isUrgent,
            isInternal,
            clientId,
            shouldContinueOpenNotes,
        } = request.body;

        const noteService = new NoteService();

        const newNote = await noteService.createNoteWithContinuations({
            user_id,
            note,
            dueDate, // O service já lida com a conversão se necessário
            hasPenalty,
            isUrgent,
            isInternal,
            clientId,
            shouldContinueOpenNotes,
        });

        response.json(newNote);
    }

    public list = async (request: Request, response: Response): Promise<void> => {
        const userId = request.user_id;
        // Pega a data da query string (ex: /notes?date=2025-10-09)
        const { date } = request.query;

        // Se nenhuma data for enviada, usa a data de hoje como padrão.
        const filterDate = date ? new Date(date as string) : new Date();

        const noteService = new NoteService();
        const notes = await noteService.list(userId, filterDate);

        response.json(notes);
    }

    public details = async (request: Request, response: Response): Promise<void> => {
        const { id } = request.params; // Pegando o ID da URL (ex: /notes/uuid-da-nota)
        
        const noteService = new NoteService();
        const note = await noteService.detail(id);

        response.json(note);
    }

    public update = async (request: Request, response: Response): Promise<void> => {
        const myId = request.user_id;
        const {
            note_id,
            note,
            dueDate,
            hasPenalty,
            isUrgent,
            isInternal,
            clientId,
        } = request.body; // Dados para atualizar vindos do corpo

        const noteService = new NoteService();

        const updatedNote = await noteService.update({
            myId,
            noteId: note_id,
            note,
            dueDate,
            hasPenalty,
            isUrgent,
            isInternal,
            clientId,
        });

        response.json(updatedNote);
    }

    public toggleStatus = async (request: Request, response: Response): Promise<void> => {
        const myId = request.user_id;
        const { id } = request.params; // ID da nota vem da URL

        const noteService = new NoteService();

        const updatedNote = await noteService.toggleStatus({
            myId,
            noteId: id,
        });

        response.json(updatedNote);
    }
}

export { NoteController };