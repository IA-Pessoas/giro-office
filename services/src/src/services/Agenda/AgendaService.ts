import { startOfMonth, addMonths } from 'date-fns'
import prismaClient from "../../prisma"
import { LogService } from "../LogService"
import { ClientService } from "../ClientService"

interface CreateRequest {
    my_id: string
    agenda: string
    date: Date
    client_id?: string
    location?: string
    participant_id?: string
    participant_id_2?: string
    participant_id_3?: string
    task_id?: string
    status: string
    obs: string
    department_control_id: string
}
interface UpdateRequest {
    my_id: string
    agenda_id: string
    agenda: string
    date: Date
    client_id?: string
    location?: string
    participant_id?: string
    participant_id_2?: string
    participant_id_3?: string
    task_id?: string
    status: string
    obs: string
}

class AgendaService {
    private async find(id: string) {
        const agenda = await prismaClient.agenda.findFirst({
            where:{
                id
            },
            select:{
                id: true,
                agenda: true,
                date: true,
                client_id: true,
                location: true,
                participant_id: true,
                participant_id_2: true,
                participant_id_3: true,
                task_id: true,
                status: true,
                obs: true,
            }
        })
        return agenda
    }
    async create({ 
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
    }: CreateRequest) {
        const ag = await prismaClient.agenda.create({
            data:{
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
            },
            select:{
                id: true,
                agenda: true,
                date: true,
                client_id: true,
            }
        })

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "agenda",
            referring_id: ag.id,
            changes: "{}"
        })

        return { ag }
    }
    async detail(agenda_id: string) {
        const ag = await prismaClient.agenda.findFirst({
            where:{
                id: agenda_id
            },
            select:{
                id: true,
                agenda: true,
                date: true,
                client_id: true,
                location: true,
                participant_id: true,
                participant_id_2: true,
                participant_id_3: true,
                task_id: true,
                status: true,
                obs: true,
                client: {
                    select: {
                        company_name: true,
                        cpf_cnpj: true
                    }
                },
                participant: {
                    select: {
                        name: true,
                        department: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                participant2: {
                    select: {
                        name: true,
                        department: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                participant3: {
                    select: {
                        name: true,
                        department: {
                            select: {
                                name: true
                            }
                        }
                    }
                },
                task: {
                    select: {
                        name: true,
                        status: true
                    }
                }
            }
        })

        return { ag }
    }
    async list(date: Date) {
        // 1. Encontra o primeiro dia do mês da data recebida
        const firstDayOfMonth = startOfMonth(date);

        // 2. Calcula o primeiro dia do próximo mês
        const firstDayOfNextMonth = addMonths(firstDayOfMonth, 1);

        const list = await prismaClient.agenda.findMany({
            where: {
                date: {
                    // 3. Busca por registros DENTRO do intervalo do mês
                    gte: firstDayOfMonth,      // Maior ou igual ao dia 1º do mês
                    lt: firstDayOfNextMonth,   // Menor que o dia 1º do próximo mês
                },
            },
            select: {
                id: true,
                agenda: true,
                date: true,
                client_id: true,
                location: true,
                participant_id: true,
                participant_id_2: true,
                participant_id_3: true,
                task_id: true,
                status: true,
                obs: true,
                client: {
                    select: {
                        company_name: true,
                        cpf_cnpj: true,
                    },
                },
                participant: {
                    select: {
                        name: true,
                        department: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
                participant2: {
                    select: {
                        name: true,
                        department: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
                participant3: {
                    select: {
                        name: true,
                        department: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
                task: {
                    select: {
                        name: true,
                        status: true,
                    },
                },
            },
        });

        return { list };
    }
    async update({ 
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
    }: UpdateRequest) {
        try {
            const exists = await this.find(agenda_id)
            if (!exists) {
                throw new Error("Agendamento não existe")
            }

            const updated = await prismaClient.agenda.update({
                where:{
                    id: agenda_id
                },
                data: {
                    agenda,
                    date,
                    client_id,
                    location,
                    participant_id,
                    participant_id_2,
                    participant_id_3,
                    task_id,
                    obs,
                },
                select: {
                    agenda: true,
                    date: true,
                    client_id: true,
                    location: true,
                    participant_id: true,
                    participant_id_2: true,
                    participant_id_3: true,
                    task_id: true,
                    obs: true,
                }
            })

            if (!updated) {
                throw new Error("Erro ao atualizar")
            }

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "agenda",
                referring_id: agenda_id,
                oldData: exists,
                updatedData: updated,
            });

            
            await this.updateStatus(my_id, agenda_id, status)

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
    async updateStatus(my_id: string, agenda_id: string, status: string) {
        try {
            const exists = await this.find(agenda_id)
            if (!exists) {
                throw new Error("Agendamento não existe")
            }
            
            if (status === exists.status)
                throw new Error("Agendamento já está com o status informado")

            const updated = await prismaClient.agenda.update({
                where:{
                    id: agenda_id
                },
                data: {
                    status,
                },
                select: {
                    status: true,
                }
            })

            if (!updated) {
                throw new Error("Erro ao atualizar")
            }

            const ls = new LogService();
            await ls.logUpdateIfChanged({
                my_id,
                action: "Atualização",
                referring: "agenda",
                referring_id: agenda_id,
                oldData: exists,
                updatedData: updated,
            });

            if (status === "Realizado" && exists.task_id != null && exists.client_id != null && exists.participant_id != null) {
                const cs = new ClientService()
                await cs.createHistoryPending(exists.client_id, "Agendamento realizado", exists.participant_id)
            }

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }
}

export { AgendaService }