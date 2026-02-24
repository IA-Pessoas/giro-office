import prismaClient from "../../prisma";
import { LogService } from '../LogService'

interface GetOrCreateDTO {
    my_id: string;
    clientId: string;
    competence: string;
}

interface UpdateFieldDTO {
    id: string;
    my_id: string;
    data: { [key: string]: boolean | string };
}

const updatableFields: Set<string> = new Set([
    'regenerate_accounting_entries',
    'check_summary_by_accumulator',
    'post_accounting_transaction',
    'import_bank_statements',
    'reconcile_bank_statements',
    'reconcile_vendors',
    'integrate_taxes',
    'settle_federal_taxes_via_ecac',
    'settle_state_taxes_via_sefaz_ba',
    'integrate_payroll',
    'suspense_accounts',
    'check_overdrawn_accounts',
    'general_account_reconciliation',
    'check_loan_and_interest_accounts',
    'monthly_closing',
    'reconcile_icms_pis_cofins',
    'depreciation',
    'notes'
]);

class ControlContabilService {
    private prisma = prismaClient;

    public async create({ my_id, clientId, competence }: GetOrCreateDTO) {
        if (!clientId || !competence) {
            throw new Error("Cliente ID e Competência são obrigatórios.");
        }

        let control = await this.prisma.controlContabil.findFirst({
            where: {
                client_id: clientId,
                competence: competence,
            },
        });

        if (!control) {
            control = await this.prisma.controlContabil.create({
                data: {
                    client_id: clientId,
                    competence: competence,
                    regenerate_accounting_entries: false,
                    check_summary_by_accumulator: false,
                    post_accounting_transaction: false,
                    import_bank_statements: false,
                    reconcile_bank_statements: false,
                    reconcile_vendors: false,
                    integrate_taxes: false,
                    settle_federal_taxes_via_ecac: false,
                    settle_state_taxes_via_sefaz_ba: false,
                    integrate_payroll: false,
                    suspense_accounts: false,
                    check_overdrawn_accounts: false,
                    general_account_reconciliation: false,
                    check_loan_and_interest_accounts: false,
                    monthly_closing: false,
                    reconcile_icms_pis_cofins: false,
                    depreciation: false,
                    notes: "",
                },
            });
            
            const ls = new LogService()
            await ls.createLog({
                my_id,
                action: "Cadastro",
                referring: "contabil.control",
                referring_id: control.id,
                changes: "{}"
            })
        }


        return control;
    }

    public async detail(clientId: string, competence: string) {
        if (!clientId || !competence) {
            throw new Error("Cliente ID e Competência são obrigatórios.");
        }

        const control = await this.prisma.controlContabil.findFirst({
            where: {
                client_id: clientId,
                competence: competence,
            },
        });

        return control;
    }

    public async updateField({ my_id, id, data }: UpdateFieldDTO) {
        const field = Object.keys(data)[0];
        const value = data[field];

        if (!field || !updatableFields.has(field)) {
            throw new Error(`Campo '${field}' é inválido ou não pode ser atualizado.`);
        }

        if (field !== 'notes' && typeof value !== 'boolean') {
            throw new Error(`O valor para '${field}' deve ser um booleano (true/false).`);
        }
        if (field === 'notes' && typeof value !== 'string') {
            throw new Error(`O valor para 'notes' deve ser um texto.`);
        }

        const exists = await this.prisma.controlContabil.findFirst({ where:{ id } })
        if (!exists)
            throw new Error("Não esta cadastrado")

        const updated = await this.prisma.controlContabil.update({
            where: { id },
            data: {
                [field]: value,
            },
        });

        const ls = new LogService();
        await ls.logUpdateIfChanged({
            my_id,
            action: "Atualização",
            referring: "contabil.control",
            referring_id: id,
            oldData: exists,
            updatedData: updated,
        })

        return updated;
    }
}

export { ControlContabilService };