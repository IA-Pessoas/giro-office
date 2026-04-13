import prismaClient from "../prisma"

interface CreateRequest {
    my_id: string
    action: string
    referring: string
    referring_id: string
    changes: any
    dep?: string
}

class LogService {
    async createLog({ my_id, action, referring, referring_id, changes, dep }: CreateRequest) {
        if (dep === 'pessoal') {
            await prismaClient.logsPessoal.create({
                data: {
                    user_id: my_id,
                    action,
                    referring,
                    referring_id,
                    changes,
                },
            });
        } else if (dep === 'rh') {
            await prismaClient.logsPessoal.create({
                data: {
                    user_id: my_id,
                    action,
                    referring,
                    referring_id,
                    changes,
                },
            });
        } else {
            await prismaClient.logs.create({
                data: {
                    user_id: my_id,
                    action,
                    referring,
                    referring_id,
                    changes,
                },
            });
        }
    }

    async logUpdateIfChanged({
        my_id,
        action,
        referring,
        referring_id,
        oldData,
        updatedData,
        dep
    }: {
        my_id: string;
        action: string;
        referring: string;
        referring_id: string;
        oldData: Record<string, any> | null;
        updatedData: Record<string, any>;
        dep?: string;
    }) {
        const changes: Record<string, any> = {};

        if (action !== 'Cadastro') {
            for (const key of Object.keys(updatedData)) {
                if (
                    oldData &&
                    updatedData[key as keyof typeof updatedData] !== oldData[key as keyof typeof oldData]
                ) {
                    changes[key] = {
                        from: oldData[key as keyof typeof oldData],
                        to: updatedData[key as keyof typeof updatedData],
                    };
                }
            }
        }


        if (Object.keys(changes).length > 0) {
            if (dep === null) {
                await this.createLog({
                    my_id,
                    action,
                    referring,
                    referring_id,
                    changes,
                });
            } else if (dep === 'pessoal') {
                await this.createLog({
                    my_id,
                    action,
                    referring,
                    referring_id,
                    changes,
                });
            }
        }
    }

    async list(referring: string, referringId: string, dep: string) {
        if (dep === null) {
            const logs = await prismaClient.logs.findMany({
                where: {
                    referring,
                    referring_id: referringId
                },
                select: {
                    id: true,
                    user_id: true,
                    action: true,
                    referring: true,
                    referring_id: true,
                    changes: true,
                    date: true,
                    user: {
                        select: {
                            name: true
                        }
                    }
                },
                orderBy: {
                    date: 'desc'
                }
            })
            return logs;
        } else if (dep === 'pessoal') {
            const logs = await prismaClient.logsPessoal.findMany({
                where: {
                    referring,
                    referring_id: referringId
                },
                select: {
                    id: true,
                    user_id: true,
                    action: true,
                    referring: true,
                    referring_id: true,
                    changes: true,
                    date: true,
                    user: {
                        select: {
                            name: true
                        }
                    }
                },
                orderBy: {
                    date: 'desc'
                }
            })
            return logs;
        }
    }
}

export { LogService }