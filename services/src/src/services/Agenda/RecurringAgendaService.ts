import { getDay, set, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, addMonths } from 'date-fns';
import cron from "node-cron"

import prismaClient from "../../prisma"
import { LogService } from "../LogService"
import { AgendaService } from "./AgendaService"

interface CreateRequest {
    my_id: string
    agenda: string
    day: number
    recurrence: string
    client_id?: string
    location?: string
    participant_id?: string
    participant_id_2?: string
    participant_id_3?: string
    obs: string
    department_control_id: string
}
interface UpdateRequest {
    my_id: string
    agenda_id: string
    agenda: string
    day: number
    recurrence: string
    client_id?: string
    location?: string
    participant_id?: string
    participant_id_2?: string
    participant_id_3?: string
    obs: string
}

class RecurringAgendaService {
    async create({
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
    }: CreateRequest) {
        const ag = await prismaClient.recurringAgenda.create({
            data: {
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
            },
            select: {
                id: true,
                agenda: true,
                day: true,
                recurrence: true,
                client_id: true,
                location: true,
                participant_id: true,
                participant_id_2: true,
                participant_id_3: true,
                obs: true,
                department_control_id: true,
            }
        })

        const ls = new LogService()
        await ls.createLog({
            my_id,
            action: "Cadastro",
            referring: "agenda.recurring",
            referring_id: ag.id,
            changes: "{}"
        })

        return { ag }
    }
    async detail(agenda_id: string) {
        const ag = await prismaClient.recurringAgenda.findFirst({
            where: {
                id: agenda_id
            },
            select: {
                id: true,
                agenda: true,
                day: true,
                recurrence: true,
                client_id: true,
                location: true,
                participant_id: true,
                participant_id_2: true,
                participant_id_3: true,
                obs: true,
                department_control_id: true,
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
            }
        })

        return { ag }
    }
    async list(dep_id: string) {
        const list = await prismaClient.agenda.findMany({
            where: {
                department_control_id: dep_id,
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
        day,
        recurrence,
        client_id,
        location,
        participant_id,
        participant_id_2,
        participant_id_3,
        obs,
    }: UpdateRequest) {
        try {
            const exists = await prismaClient.recurringAgenda.findFirst({
                where: {
                    id: agenda_id
                },
                select: {
                    id: true,
                    agenda: true,
                    day: true,
                    recurrence: true,
                    client_id: true,
                    location: true,
                    participant_id: true,
                    participant_id_2: true,
                    participant_id_3: true,
                    obs: true,
                }
            })
            if (!exists) {
                throw new Error("Agendamento não existe")
            }

            const updated = await prismaClient.recurringAgenda.update({
                where: {
                    id: agenda_id
                },
                data: {
                    agenda,
                    day,
                    recurrence,
                    client_id,
                    location,
                    participant_id,
                    participant_id_2,
                    participant_id_3,
                    obs,
                },
                select: {
                    agenda: true,
                    day: true,
                    recurrence: true,
                    client_id: true,
                    location: true,
                    participant_id: true,
                    participant_id_2: true,
                    participant_id_3: true,
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
                referring: "agenda.recurring",
                referring_id: agenda_id,
                oldData: exists,
                updatedData: updated,
            });

            return updated
        } catch (error) {
            console.log(error)
            throw new Error("Erro ao atualizar")
        }
    }

    public async processRecurringAgendas() {
        const runRoutine = async () => {
            console.log(`[${new Date().toISOString()}] Executando rotina...`)

            try {
                // Pega a data atual aqui dentro
                const currentDate = new Date();
                console.log(`Iniciando processamento de agendas recorrentes para ${currentDate.toISOString()}`);

                const allRecurringItems = await prismaClient.recurringAgenda.findMany();

                for (const item of allRecurringItems) {
                    // O resto da sua lógica aqui dentro permanece EXATAMENTE A MESMA,
                    // pois ela já utiliza a variável 'currentDate'.
                    const scheduledDayOfMonth = item.day;

                    // Define a data alvo para este mês com o dia da regra
                    let targetDate = set(currentDate, { date: scheduledDayOfMonth });

                    // Passo 2: Lógica de Datas - Verificar e ajustar para o final de semana
                    const dayOfWeek = getDay(targetDate); // 0 = Domingo, 6 = Sábado

                    let finalExecutionDate = targetDate;

                    // Se o dia agendado caiu em um Sábado (6)
                    if (dayOfWeek === 6) {
                        // Adianta para a Sexta-feira anterior
                        finalExecutionDate = subDays(targetDate, 1);
                        console.log(`[${item.agenda}] Agendamento do dia ${targetDate.getDate()} (Sábado) adiantado para dia ${finalExecutionDate.getDate()} (Sexta).`);
                    }
                    // Se o dia agendado caiu em um Domingo (0)
                    else if (dayOfWeek === 0) {
                        // Adianta para a Sexta-feira anterior
                        finalExecutionDate = subDays(targetDate, 2);
                        console.log(`[${item.agenda}] Agendamento do dia ${targetDate.getDate()} (Domingo) adiantado para dia ${finalExecutionDate.getDate()} (Sexta).`);
                    }

                    // Verifica se a data final de execução é de fato hoje
                    const isToday = finalExecutionDate.toDateString() === currentDate.toDateString();

                    if (!isToday) {
                        // Se não for para hoje, pula para o próximo item
                        continue;
                    }

                    // Passo 3: Verificação de Duplicidade
                    let startDate: Date;
                    let endDate: Date;

                    // Define o intervalo de tempo para a verificação com base na recorrência
                    switch (item.recurrence.toLowerCase()) {
                        case 'mensal':
                            startDate = startOfMonth(currentDate);
                            endDate = endOfMonth(currentDate);
                            break;
                        case 'trimestral':
                            startDate = startOfQuarter(currentDate);
                            endDate = endOfQuarter(currentDate);
                            break;
                        case 'semestral':
                            const currentMonth = currentDate.getMonth(); // 0 (Janeiro) a 11 (Dezembro)
                            const yearStart = startOfYear(currentDate);

                            if (currentMonth < 6) { // Primeiro semestre (Janeiro a Junho)
                                startDate = yearStart;
                                // Fim do sexto mês (Junho)
                                endDate = endOfMonth(addMonths(yearStart, 5));
                            } else { // Segundo semestre (Julho a Dezembro)
                                // Início do sétimo mês (Julho)
                                startDate = addMonths(yearStart, 6);
                                endDate = endOfYear(currentDate);
                            }
                            break;
                        case 'anual':
                            startDate = startOfYear(currentDate);
                            endDate = endOfYear(currentDate);
                            break;
                        default:
                            console.log(`[${item.agenda}] Recorrência '${item.recurrence}' desconhecida. Pulando.`);
                            continue; // Pula se o tipo de recorrência não for reconhecido
                    }

                    // Procura por uma agenda já existente com o mesmo título no período de tempo
                    const existingAgenda = await prismaClient.agenda.findFirst({
                        where: {
                            agenda: item.agenda,
                            date: {
                                gte: startDate, // Maior ou igual ao início do período
                                lte: endDate,   // Menor ou igual ao fim do período
                            },
                        },
                    });

                    // Se já existe, loga e pula para o próximo item
                    if (existingAgenda) {
                        console.log(`[${item.agenda}] Já existe um agendamento para este período. Pulando.`);
                        continue;
                    }

                    // Passo 4: Criação do Agendamento
                    console.log(`✅ [${item.agenda}] Criando novo agendamento para ${finalExecutionDate.toISOString()}`);

                    const ag = await prismaClient.agenda.create({
                        data: {
                            agenda: item.agenda,
                            date: finalExecutionDate,
                            client_id: item.client_id,
                            location: item.location,
                            participant_id: item.participant_id,
                            participant_id_2: item.participant_id_2,
                            participant_id_3: item.participant_id_3,
                            obs: item.obs,
                            department_control_id: item.department_control_id
                        },
                        select: {
                            id: true,
                            agenda: true,
                            date: true,
                            client_id: true,
                        }
                    })
                }

                console.log("Processamento de agendas recorrentes finalizado.");
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Erro ao executar rotina:`, error)
            }
        }

        cron.schedule("* 6 * * *", runRoutine, {
            timezone: "America/Sao_Paulo",
        })
    }
}

export { RecurringAgendaService }