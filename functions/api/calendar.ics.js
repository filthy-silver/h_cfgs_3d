/**
 * @file functions/api/calendar.ics.js
 * @description Cloudflare Pages Function que genera dinámicamente el feed RFC 5545 iCalendar (.ics).
 */

const TIME_BOUNDARIES = [
  "15:45",
  "16:40",
  "17:35",
  "18:30",
  "18:50",
  "19:45",
  "20:40",
  "21:35"
];

const SUBJECTS = {
  proye:  { name: "Realización de proyectos",      meta: "PTS 06 · INF-1",              location: "Aula INF-1" },
  color:  { name: "Color, iluminación y acabados", meta: "PTS 01 / PTS 04 · INF-1",     location: "Aula INF-1" },
  dibujo: { name: "Diseño, dibujo y modelado",     meta: "PS SO 01 / PS SO 03 · INF-1", location: "Aula INF-1" },
  anim:   { name: "Animación de elementos",        meta: "PS SO 01 / PS SO 02 · INF-1", location: "Aula INF-1" },
  fol:    { name: "Itinerario personal",           meta: "FOL 04 · POLI 2",             location: "POLI 2" },
  inter:  { name: "Proyecto intermodular",         meta: "PS SO 03 · INF-1",            location: "Aula INF-1" },
  ingles: { name: "Inglés profesional",            meta: "ANG 02 · ANG 1",              location: "Aula ANG 1" }
};

const SCHEDULE = {
  1: [["proye", 0, 1], ["color", 1, 3], ["dibujo", 4, 7]],
  2: [["fol", 0, 1], ["inter", 1, 2], ["proye", 2, 3], ["proye", 4, 6], ["ingles", 6, 7]],
  3: [["color", 0, 3], ["fol", 4, 5], ["proye", 5, 7]],
  4: [["anim", 0, 3], ["anim", 4, 5], ["ingles", 5, 6], ["fol", 6, 7, "FOL 04 · POLI 1"]],
  5: [["anim", 0, 3], ["anim", 4, 5], ["dibujo", 5, 7]]
};

const DAY_MAP = {
  1: { byDay: "MO", anchorDate: "20260914" },
  2: { byDay: "TU", anchorDate: "20260915" },
  3: { byDay: "WE", anchorDate: "20260916" },
  4: { byDay: "TH", anchorDate: "20260917" },
  5: { byDay: "FR", anchorDate: "20260918" }
};

function formatIcsTime(anchorDate, timeStr) {
  const [h, m] = timeStr.split(':');
  return `${anchorDate}T${h}${m}00`;
}

export function generateIcsFeed() {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CFGS 3D//Horario Semanal//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Horario CFGS 3D",
    "X-WR-TIMEZONE:Europe/Madrid",
    "X-WR-CALDESC:Horario oficial de clases de Animaciones 3D, Juegos y Entornos Interactivos",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Madrid",
    "X-LIC-LOCATION:Europe/Madrid",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];

  // Fecha fin del curso académico lectivo (finales de junio de 2027)
  const untilDate = "20270630T235959Z";

  for (const [dayStr, blocks] of Object.entries(SCHEDULE)) {
    const day = parseInt(dayStr, 10);
    const dayInfo = DAY_MAP[day];
    if (!dayInfo) continue;

    blocks.forEach(([mod, from, to, metaOverride], index) => {
      const subject = SUBJECTS[mod] || { name: mod, meta: "", location: "Centro Educativo" };
      const startTime = TIME_BOUNDARIES[from];
      const endTime = TIME_BOUNDARIES[to];
      const meta = metaOverride || subject.meta;
      const location = metaOverride ? metaOverride.split('·')[1]?.trim() || subject.location : subject.location;

      const dtStart = formatIcsTime(dayInfo.anchorDate, startTime);
      const dtEnd = formatIcsTime(dayInfo.anchorDate, endTime);
      const uid = `cfgs3d-d${day}-s${from}-${to}-${mod}-${index}@horario.pages.dev`;

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:20260901T000000Z`);
      lines.push(`DTSTART;TZID=Europe/Madrid:${dtStart}`);
      lines.push(`DTEND;TZID=Europe/Madrid:${dtEnd}`);
      lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${untilDate};BYDAY=${dayInfo.byDay}`);
      lines.push(`SUMMARY:${subject.name}`);
      lines.push(`DESCRIPTION:${meta}`);
      lines.push(`LOCATION:${location}`);
      lines.push("STATUS:CONFIRMED");
      lines.push("TRANSP:OPAQUE");
      // Alarma recordatorio 15 minutos antes
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-PT15M");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:Clase de ${subject.name} en 15 min`);
      lines.push("END:VALARM");
      lines.push("END:VEVENT");
    });
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export async function onRequest(context) {
  const icsData = generateIcsFeed();

  return new Response(icsData, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="horario_cfgs_3d.ics"',
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
