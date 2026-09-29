import { z } from "zod";

const listSchema = z.array(z.string().trim().max(200));
const planningSchema = z
  .object({
    fornecedores: listSchema,
    cronograma: listSchema,
    registro: listSchema,
    transporte: listSchema,
    acomodacoes: listSchema,
  })
  .strict();
const marketingCommunicationSchema = z
  .object({
    abertura: listSchema,
    divulgacao: listSchema,
    acessoria: listSchema,
    site: listSchema,
  })
  .strict();
const duringEventSchema = z
  .object({
    recepcao: listSchema,
    staff: listSchema,
    programacao: listSchema,
    feedback: listSchema,
  })
  .strict();
const afterEventSchema = z
  .object({
    avaliacao: listSchema,
    agradecimento: listSchema,
    relatorio: listSchema,
    followup: listSchema,
  })
  .strict();

export const marketingEventEditionParamsSchema = z
  .object({ eventId: z.string().uuid({ message: "Identificador do evento inválido." }) })
  .strict();
export const marketingEventEditionIdParamsSchema = marketingEventEditionParamsSchema
  .extend({
    editionId: z.string().uuid({ message: "Identificador da edição inválido." }),
  })
  .strict();

export const marketingEventEditionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/u)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
      }, "Informe uma data válida."),
    place: z.string().trim().min(1).max(255),
    budgetItems: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            amount: z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/u),
          })
          .strict(),
      )
      .max(500),
    partnerships: listSchema,
    organizingTeam: listSchema,
    logistics: planningSchema,
    marketingCommunication: marketingCommunicationSchema,
    duringEvent: duringEventSchema,
    afterEvent: afterEventSchema,
    notes: z.string().max(10000),
    feedbackPeriodStart: z.string().datetime({ offset: true }).nullable().optional(),
    feedbackPeriodEnd: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const start = value.feedbackPeriodStart ?? null;
    const end = value.feedbackPeriodEnd ?? null;
    if ((start === null) !== (end === null)) {
      context.addIssue({
        code: "custom",
        path: [start === null ? "feedbackPeriodStart" : "feedbackPeriodEnd"],
        message: "Informe as datas inicial e final do período de avaliação.",
      });
      return;
    }
    if (start !== null && end !== null && new Date(start).valueOf() > new Date(end).valueOf()) {
      context.addIssue({
        code: "custom",
        path: ["feedbackPeriodEnd"],
        message: "A data final do período deve ser igual ou posterior à data inicial.",
      });
    }
  });

export const marketingEventEditionFeedbackBodySchema = z
  .object({
    rating: z
      .number()
      .int()
      .min(1, "A avaliação deve ser de 1 a 5.")
      .max(5, "A avaliação deve ser de 1 a 5."),
    observation: z.string().trim().max(10000).optional(),
  })
  .strict();

export type MarketingEventEditionFeedbackInput = z.infer<
  typeof marketingEventEditionFeedbackBodySchema
>;

export type MarketingEventEditionInput = z.infer<typeof marketingEventEditionBodySchema>;
