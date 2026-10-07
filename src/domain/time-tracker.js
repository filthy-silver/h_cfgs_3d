/**
 * @file time-tracker.js
 * @description Lógica de dominio para cálculos horarios, cuentas atrás, resolución de festivos y salto inteligente de días.
 */

import {
  DAY_NAMES,
  SCHOOL_DAY_START_MINUTES,
  SCHOOL_DAY_END_MINUTES,
  getHolidayInfo
} from '../data/schedule.data.js';

/**
 * Convierte una cadena de hora "HH:mm" a minutos totales desde medianoche.
 * @param {string} timeStr - Formato "HH:mm"
 * @returns {number}
 */
export function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Formatea una cantidad de minutos a una cadena legible (ej: "1 h 20 min" o "45 min").
 * @param {number} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const r = minutes % 60;
  if (h > 0) {
    return r > 0 ? `${h} h ${r} min` : `${h} h`;
  }
  return `${minutes} min`;
}

/**
 * Obtiene la información temporal del momento actual enriquecida con estado de festivos y jornada.
 * @param {Date} [dateObj=new Date()]
 * @returns {{
 *   day: number,
 *   minutes: number,
 *   formattedDate: string,
 *   isWeekend: boolean,
 *   isAfterSchoolHours: boolean,
 *   isHoliday: boolean,
 *   holidayName: string|null,
 *   dateObj: Date
 * }}
 */
export function getNowInfo(dateObj = new Date()) {
  const day = dateObj.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const minutes = dateObj.getHours() * 60 + dateObj.getMinutes();
  const formattedDate = dateObj.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  const holidayInfo = getHolidayInfo(dateObj);
  const isAfterSchoolHours = minutes >= SCHOOL_DAY_END_MINUTES;

  // Se considera periodo de fin de semana desde el viernes a las 21:35 hasta el domingo a medianoche
  const isWeekend = day === 0 || day === 6 || (day === 5 && isAfterSchoolHours);

  return {
    day,
    minutes,
    formattedDate,
    isWeekend,
    isAfterSchoolHours,
    isHoliday: holidayInfo.isHoliday,
    holidayName: holidayInfo.name,
    dateObj
  };
}

/**
 * Determina de forma inteligente qué día (1..5) debe mostrar por defecto la vista móvil:
 * - Viernes tras 21:35, Sábados y Domingos -> Lunes (1).
 * - Lunes a Jueves tras 21:35 -> Día siguiente (día + 1).
 * - Dentro de la jornada lectiva (o antes de empezar) -> Día actual.
 * @param {Date} [dateObj=new Date()]
 * @returns {number} 1 = Lunes, 2 = Martes, etc.
 */
export function getSmartInitialMobileDay(dateObj = new Date()) {
  const day = dateObj.getDay();
  const minutes = dateObj.getHours() * 60 + dateObj.getMinutes();

  // Fin de semana (Viernes > 21:35, Sábado, Domingo) -> Salto a Lunes
  if (day === 0 || day === 6 || (day === 5 && minutes >= SCHOOL_DAY_END_MINUTES)) {
    return 1;
  }

  // De Lunes a Jueves tras el fin de jornada -> Salto automático al día siguiente
  if (day >= 1 && day <= 4 && minutes >= SCHOOL_DAY_END_MINUTES) {
    return day + 1;
  }

  // Día lectivo habitual
  return (day >= 1 && day <= 5) ? day : 1;
}

/**
 * Encuentra la clase activa actual dado un listado de eventos del día y los minutos actuales.
 * @param {Array<Object>} dayEvents
 * @param {number} currentMinutes
 * @returns {Object|null}
 */
export function findCurrentEvent(dayEvents, currentMinutes) {
  if (!dayEvents || !dayEvents.length) return null;
  return dayEvents.find(e => {
    const s = toMinutes(e.start);
    const end = toMinutes(e.end);
    return currentMinutes >= s && currentMinutes < end;
  }) || null;
}

/**
 * Encuentra la siguiente clase pendiente dentro del mismo día.
 * @param {Array<Object>} dayEvents
 * @param {number} currentMinutes
 * @returns {Object|null}
 */
export function findUpcomingEventToday(dayEvents, currentMinutes) {
  if (!dayEvents || !dayEvents.length) return null;
  return dayEvents.find(e => toMinutes(e.start) > currentMinutes) || null;
}

/**
 * Busca la próxima clase en el calendario futuro avanzando día a día,
 * ignorando fines de semana y festivos escolares.
 * @param {Record<number, Array<Object>>} eventsByDay
 * @param {Date} [fromDate=new Date()]
 * @returns {{ event: Object, when: string, date: Date } | null}
 */
export function findNextEventInFutureCalendar(eventsByDay, fromDate = new Date()) {
  // Búsqueda prospectiva de hasta 30 días naturales
  for (let offset = 1; offset <= 30; offset++) {
    const candidateDate = new Date(fromDate);
    candidateDate.setDate(candidateDate.getDate() + offset);

    const candidateDay = candidateDate.getDay();

    // Saltar fin de semana
    if (candidateDay === 0 || candidateDay === 6) continue;

    // Saltar festivos escolares
    const holiday = getHolidayInfo(candidateDate);
    if (holiday.isHoliday) continue;

    // Verificar si hay eventos en ese día de la semana (1..5)
    const list = eventsByDay[candidateDay];
    if (list && list.length > 0) {
      let whenText;
      if (offset === 1) {
        whenText = "Mañana";
      } else if (offset <= 7) {
        whenText = DAY_NAMES[candidateDay];
      } else {
        whenText = `${DAY_NAMES[candidateDay]} ${candidateDate.getDate()}`;
      }

      return {
        event: list[0],
        when: whenText,
        date: candidateDate
      };
    }
  }

  return null;
}

/**
 * Calcula el progreso porcentual y tiempo restante de un evento en curso.
 * @param {Object} event
 * @param {number} currentMinutes
 * @returns {{ progressPercent: number, remainingMinutes: number, formattedRemaining: string }}
 */
export function computeEventProgress(event, currentMinutes) {
  const startMin = toMinutes(event.start);
  const endMin = toMinutes(event.end);
  const total = endMin - startMin;
  const elapsed = currentMinutes - startMin;
  const remainingMinutes = Math.max(0, endMin - currentMinutes);

  const progressPercent = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
  const formattedRemaining = `Quedan ${formatDuration(remainingMinutes)}`;

  return { progressPercent, remainingMinutes, formattedRemaining };
}
