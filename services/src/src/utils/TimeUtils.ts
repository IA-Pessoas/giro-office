import { differenceInMinutes, format, parse, set } from "date-fns";

class TimeUtils {
    // Converte "08:00" para minutos do dia (ex: 480)
    static timeStringToMinutes(time: string): number {
        if (!time) return 0;
        const [hours, minutes] = time.split(':').map(Number);
        return (hours * 60) + minutes;
    }

    // Calcula minutos trabalhados entre duas datas
    static diffMinutes(start: Date | null, end: Date | null): number {
        if (!start || !end) return 0;
        return differenceInMinutes(end, start);
    }

    // Cria uma data hoje com a hora específica da string "HH:mm"
    static createDateFromTime(timeString: string): Date {
        const [hours, minutes] = timeString.split(':').map(Number);
        const now = new Date();
        return set(now, { hours, minutes, seconds: 0, milliseconds: 0 });
    }
}

export { TimeUtils }