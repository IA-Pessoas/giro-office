import { ServiceError, TimeUtils } from "@workspace/shared";

/**
 * Cálculo de minutos esperados a partir da configuração de ponto (RH).
 */
export function expectedMinutesFromPointConfig(config: {
  start_time: Date;
  lunch_break: Date;
  lunch_return: Date;
  end_time: Date;
}): number {
  const morning = TimeUtils.diffMinutes(config.start_time, config.lunch_break);
  const afternoon = TimeUtils.diffMinutes(config.lunch_return, config.end_time);
  if (morning < 0 || afternoon < 0) {
    throw new ServiceError(500, "Configuração de ponto com horários inconsistentes.");
  }
  return morning + afternoon;
}
