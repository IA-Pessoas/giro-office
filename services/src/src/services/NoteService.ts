import { startOfWeek, addDays } from 'date-fns';
import { LogService } from './LogService';
import prisma from '../prisma';

// Interfaces para os métodos
interface CreateNoteRequest {
    user_id: string;
    note: string;
    dueDate?: Date;
    hasPenalty: boolean;
    isUrgent: boolean;
    isInternal: boolean;
    clientId?: string;
    shouldContinueOpenNotes?: boolean;
}

interface UpdateNoteRequest {
    myId: string;
    noteId: string;
    note: string;
    dueDate?: Date;
    hasPenalty: boolean;
    isUrgent: boolean;
    isInternal: boolean;
    clientId?: string;
}
interface ToggleStatusRequest {
    myId: string;
    noteId: string;
}

class NoteService {
    private async find(noteId: string) {
        const note = await prisma.note.findUnique({
            where: { id: noteId }
        });
        return note;
    }

    async createNoteWithContinuations(data: CreateNoteRequest) {
        const { user_id, note, dueDate, hasPenalty, isUrgent, isInternal, clientId, shouldContinueOpenNotes = true } = data;
        const today = new Date();

        // 1. CALCULAR DATAS DA SEMANA
        const weekStartDate = startOfWeek(today, { weekStartsOn: 1 }); // Segunda-feira
        const weekEndDate = addDays(weekStartDate, 4); // Sexta-feira

        let nextNoteNumber = 1;

        // 2. LÓGICA DE CONTINUAÇÃO DE NOTAS
        const notesInCurrentWeek = await prisma.note.findMany({
            where: { user_id, week_start_date: weekStartDate },
            orderBy: { number: 'desc' },
        });

        if (notesInCurrentWeek.length > 0) {
            nextNoteNumber = notesInCurrentWeek[0].number + 1;
        } else if (shouldContinueOpenNotes) {
            const openNotes = await prisma.note.findMany({
                where: { user_id, status: false },
            });

            await prisma.$transaction(async (tx) => {
                for (const oldNote of openNotes) {
                    // Marca a nota antiga como "concluída" (status: true)
                    await tx.note.update({
                        where: { id: oldNote.id },
                        data: { status: true, completion_date: today },
                    });

                    // Cria a nota "continuada" na semana atual
                    await tx.note.create({
                        data: {
                            user_id: user_id,
                            number: nextNoteNumber++,
                            note: oldNote.note,
                            created_at: today,
                            due_date: oldNote.due_date,
                            status: false,
                            week_start_date: weekStartDate,
                            week_end_date: weekEndDate,
                            original_creation_date: oldNote.original_creation_date,
                            has_penalty: oldNote.has_penalty,
                            is_urgent: oldNote.is_urgent,
                            is_internal: oldNote.is_internal,
                            client_id: oldNote.client_id,
                        }
                    });
                }
            });
        }

        // 3. CRIAR A NOVA NOTA QUE O USUÁRIO ENVIOU
        const newNote = await prisma.note.create({
            data: {
                user_id: user_id,
                number: nextNoteNumber,
                note,
                created_at: today,
                due_date: dueDate,
                status: false,
                week_start_date: weekStartDate,
                week_end_date: weekEndDate,
                original_creation_date: today,
                has_penalty: hasPenalty,
                is_urgent: isUrgent,
                is_internal: isInternal,
                client_id: clientId,
            },
        });

        // 4. LOG DE CRIAÇÃO
        const ls = new LogService();
        await ls.createLog({
            my_id: user_id,
            action: "Cadastro",
            referring: "notes",
            referring_id: newNote.id,
            changes: "{}"
        });

        return newNote; // Retorna o objeto diretamente
    }

    async detail(noteId: string) {
        const note = await prisma.note.findUnique({
            where: { id: noteId },
            include: { // Usar 'include' é mais prático que 'select' para trazer relações
                user: { select: { name: true } },
                client: { select: { name: true, fantasy_name: true } },
            }
        });

        if (!note) {
            throw new Error("Anotação não encontrada");
        }
        return note;
    }

    async list(userId: string, date: Date) {
        // 1. Calcula o primeiro dia (Segunda-feira) da semana para a data fornecida
        const weekStartDate = startOfWeek(date, { weekStartsOn: 1 });

        const notes = await prisma.note.findMany({
            where: {
                user_id: userId,
                // 2. Filtra as notas cuja data de início da semana seja a que calculamos
                week_start_date: weekStartDate,
            },
            orderBy: [
                { number: 'asc' }, // Ordena pelo número da nota na semana
                { created_at: 'asc' },
            ],
            include: {
                client: { select: { name: true } }
            }
        });

        return notes;
    }

    async update({ myId, noteId, ...data }: UpdateNoteRequest) {
        try {
            const oldData = await this.find(noteId);
            if (!oldData) {
                throw new Error("Anotação não existe");
            }

            const updatedNote = await prisma.note.update({
                where: { id: noteId },
                data: {
                    note: data.note,
                    due_date: data.dueDate,
                    has_penalty: data.hasPenalty,
                    is_urgent: data.isUrgent,
                    is_internal: data.isInternal,
                    client_id: data.clientId,
                },
            });

            return updatedNote;

        } catch (error) {
            console.log(error);
            throw new Error("Erro ao atualizar anotação");
        }
    }

    async toggleStatus({ myId, noteId }: ToggleStatusRequest) {
        try {
            // 1. Busca a nota atual para saber o status corrente
            const currentNote = await this.find(noteId);
            if (!currentNote) {
                throw new Error("Anotação não existe");
            }

            // 2. Inverte o status atual
            const newStatus = !currentNote.status;

            // 3. Atualiza a nota no banco de dados
            const updatedNote = await prisma.note.update({
                where: { id: noteId },
                data: {
                    status: newStatus,
                    // ✅ Boa prática: Se o novo status é 'true' (concluído),
                    // preenche a data de conclusão. Se for 'false', limpa a data.
                    completion_date: newStatus ? new Date() : null,
                },
            });

            // 4. Cria o log da alteração de status
            const ls = new LogService();
            await ls.createLog({
                my_id: myId,
                action: `Alteração de Status para ${newStatus ? '"Concluído"' : '"Aberto"'}`,
                referring: "notes",
                referring_id: noteId,
                changes: JSON.stringify({
                    status: { from: currentNote.status, to: newStatus }
                })
            });

            return updatedNote;

        } catch (error) {
            console.log(error);
            throw new Error("Erro ao atualizar status da anotação");
        }
    }

}

export { NoteService };