/**
 * @file schedule.data.js
 * @description Esquema de datos estructurado, configuración de horarios y calendario de festivos para CFGS 3D.
 */

export const TIME_BOUNDARIES = [
  "15:45",
  "16:40",
  "17:35",
  "18:30",
  "18:50",
  "19:45",
  "20:40",
  "21:35"
];

export const BREAK_SLOT_INDEX = 3; // 18:30 - 18:50
export const SCHOOL_DAY_START_MINUTES = 15 * 60 + 45; // 15:45 (945 minutos)
export const SCHOOL_DAY_END_MINUTES = 21 * 60 + 35;   // 21:35 (1295 minutos)

export const DAYS_CONFIG = [
  { id: 1, name: "Lunes", shortName: "Lun" },
  { id: 2, name: "Martes", shortName: "Mar" },
  { id: 3, name: "Miércoles", shortName: "Mié" },
  { id: 4, name: "Jueves", shortName: "Jue" },
  { id: 5, name: "Viernes", shortName: "Vie" }
];

export const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado"
];

/**
 * Calendario de festivos y días no lectivos para el curso escolar 2026/2027.
 * Incluye festivos autonómicos (Comunitat Valenciana), nacionales y periodos vacacionales.
 */
export const SCHOOL_HOLIDAYS = {
  "2026-10-09": "Día de la Comunitat Valenciana",
  "2026-10-12": "Fiesta Nacional de España",
  "2026-11-01": "Todos los Santos",
  "2026-11-02": "Día no lectivo (Todos los Santos)",
  "2026-12-06": "Día de la Constitución",
  "2026-12-07": "Puente de la Constitución",
  "2026-12-08": "Inmaculada Concepción",
  // Vacaciones de Navidad
  "2026-12-23": "Vacaciones de Navidad",
  "2026-12-24": "Nochebuena",
  "2026-12-25": "Navidad",
  "2026-12-28": "Vacaciones de Navidad",
  "2026-12-29": "Vacaciones de Navidad",
  "2026-12-30": "Vacaciones de Navidad",
  "2026-12-31": "Nochevieja",
  "2027-01-01": "Año Nuevo",
  "2027-01-04": "Vacaciones de Navidad",
  "2027-01-05": "Vacaciones de Navidad",
  "2027-01-06": "Epifanía del Señor (Reyes)",
  // San Vicente
  "2027-01-22": "San Vicente Mártir",
  // Fallas
  "2027-03-15": "Semana Fallera",
  "2027-03-16": "Semana Fallera",
  "2027-03-17": "Semana Fallera",
  "2027-03-18": "Semana Fallera",
  "2027-03-19": "San José (Fallas)",
  // Semana Santa y Pascua
  "2027-04-01": "Jueves Santo",
  "2027-04-02": "Viernes Santo",
  "2027-04-05": "Lunes de Pascua",
  "2027-04-06": "Vacaciones de Pascua",
  "2027-04-07": "Vacaciones de Pascua",
  "2027-04-08": "Vacaciones de Pascua",
  "2027-04-09": "Vacaciones de Pascua",
  "2027-04-12": "San Vicente Ferrer",
  // Trabajo
  "2027-05-01": "Fiesta del Trabajo"
};

/**
 * Consulta si una fecha determinada es festivo escolar.
 * @param {Date} [dateObj=new Date()]
 * @returns {{ isHoliday: boolean, name: string|null, dateStr: string }}
 */
export function getHolidayInfo(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;
  const name = SCHOOL_HOLIDAYS[dateStr] || null;

  return {
    isHoliday: Boolean(name),
    name,
    dateStr
  };
}

export const SUBJECTS = {
  proye: {
    id: "proye",
    name: "Realización de proyectos",
    meta: "PTS 06 · INF-1",
    legend: "Proyectos",
    colorVar: "--mod-proye"
  },
  color: {
    id: "color",
    name: "Color, iluminación y acabados",
    meta: "PTS 01 / PTS 04 · INF-1",
    legend: "Color e iluminación",
    colorVar: "--mod-color"
  },
  dibujo: {
    id: "dibujo",
    name: "Diseño, dibujo y modelado",
    meta: "PS SO 01 / PS SO 03 · INF-1",
    legend: "Diseño y dibujo",
    colorVar: "--mod-dibujo"
  },
  anim: {
    id: "anim",
    name: "Animación de elementos",
    meta: "PS SO 01 / PS SO 02 · INF-1",
    legend: "Animación 2D/3D",
    colorVar: "--mod-anim"
  },
  fol: {
    id: "fol",
    name: "Itinerario personal",
    meta: "FOL 04 · POLI 2",
    legend: "Itinerario / FOL",
    colorVar: "--mod-fol"
  },
  inter: {
    id: "inter",
    name: "Proyecto intermodular",
    meta: "PS SO 03 · INF-1",
    legend: "Intermodular",
    colorVar: "--mod-inter"
  },
  ingles: {
    id: "ingles",
    name: "Inglés profesional",
    meta: "ANG 02 · ANG 1",
    legend: "Inglés",
    colorVar: "--mod-ingles"
  },
  recreo: {
    id: "recreo",
    name: "Recreo",
    meta: "Descanso",
    legend: "Recreo",
    colorVar: "--mod-recreo"
  }
};

/**
 * Definición estructurada de bloques lectivos semanales.
 */
export const WEEKLY_SCHEDULE_RAW = {
  1: [
    { mod: "proye", from: 0, to: 1 },
    { mod: "color", from: 1, to: 3 },
    { mod: "dibujo", from: 4, to: 7 }
  ],
  2: [
    { mod: "fol", from: 0, to: 1 },
    { mod: "inter", from: 1, to: 2 },
    { mod: "proye", from: 2, to: 3 },
    { mod: "proye", from: 4, to: 6 },
    { mod: "ingles", from: 6, to: 7 }
  ],
  3: [
    { mod: "color", from: 0, to: 3 },
    { mod: "fol", from: 4, to: 5 },
    { mod: "proye", from: 5, to: 7 }
  ],
  4: [
    { mod: "anim", from: 0, to: 3 },
    { mod: "anim", from: 4, to: 5 },
    { mod: "ingles", from: 5, to: 6 },
    { mod: "fol", from: 6, to: 7, meta: "FOL 04 · POLI 1" }
  ],
  5: [
    { mod: "anim", from: 0, to: 3 },
    { mod: "anim", from: 4, to: 5 },
    { mod: "dibujo", from: 5, to: 7 }
  ]
};

/**
 * Genera la lista normalizada de eventos agrupados por día (1 a 5).
 * @returns {Record<number, Array<Object>>}
 */
export function buildNormalizedEvents() {
  const eventsByDay = {};

  DAYS_CONFIG.forEach(({ id: day }) => {
    const rawList = WEEKLY_SCHEDULE_RAW[day] || [];
    const dayEvents = rawList.map(item => {
      const subject = SUBJECTS[item.mod] || { name: item.mod, meta: "", colorVar: "--line" };
      return {
        id: `ev-${day}-${item.from}-${item.to}-${item.mod}`,
        mod: item.mod,
        from: item.from,
        to: item.to,
        start: TIME_BOUNDARIES[item.from],
        end: TIME_BOUNDARIES[item.to],
        name: subject.name,
        meta: item.meta || subject.meta,
        colorVar: subject.colorVar
      };
    });

    // Inyectar recreo común
    dayEvents.push({
      id: `ev-${day}-recreo`,
      mod: "recreo",
      from: BREAK_SLOT_INDEX,
      to: BREAK_SLOT_INDEX + 1,
      start: TIME_BOUNDARIES[BREAK_SLOT_INDEX],
      end: TIME_BOUNDARIES[BREAK_SLOT_INDEX + 1],
      name: SUBJECTS.recreo.name,
      meta: SUBJECTS.recreo.meta,
      colorVar: SUBJECTS.recreo.colorVar
    });

    dayEvents.sort((a, b) => a.from - b.from);
    eventsByDay[day] = dayEvents;
  });

  return eventsByDay;
}
