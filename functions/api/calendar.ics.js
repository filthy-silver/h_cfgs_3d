/**
 * @file functions/api/calendar.ics.js
 * @description Cloudflare Pages Function que genera dinámicamente el feed RFC 5545 iCalendar (.ics).
 */

import {
  TIME_BOUNDARIES,
  SUBJECTS,
  WEEKLY_SCHEDULE_RAW
} from '../../src/data/schedule.data.js';

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

/**
 * Pliega líneas iCalendar según RFC 5545 §3.1 (máximo 75 octetos por línea,
 * continuaciones precedidas por un espacio en blanco).
 * @param {string} line
 * @returns {string}
 */
export function foldIcsLine(line) {
  const maxBytes = 75;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);

  if (bytes.length <= maxBytes) {
    return line;
  }

  const parts = [];
  let currentStart = 0;
  let isFirstLine = true;

  while (currentStart < line.length) {
    const limit = isFirstLine ? 75 : 74;
    let end = currentStart;
    let byteCount = 0;

    while (end < line.length) {
      const charBytes = encoder.encode(line[end]).length;
      if (byteCount + charBytes > limit) {
        break;
      }
      byteCount += charBytes;
      end++;
    }

    if (end === currentStart) {
      end = currentStart + 1;
    }

    const chunk = line.slice(currentStart, end);
    parts.push(isFirstLine ? chunk : ` ${chunk}`);
    isFirstLine = false;
    currentStart = end;
  }

  return parts.join("\r\n");
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

  for (const [dayStr, blocks] of Object.entries(WEEKLY_SCHEDULE_RAW)) {
    const day = parseInt(dayStr, 10);
    const dayInfo = DAY_MAP[day];
    if (!dayInfo) continue;

    blocks.forEach((item, index) => {
      const subject = SUBJECTS[item.mod] || { name: item.mod, meta: "", location: "Centro Educativo" };
      const startTime = TIME_BOUNDARIES[item.from];
      const endTime = TIME_BOUNDARIES[item.to];
      const meta = item.meta || subject.meta;
      const location = meta.includes('·') ? meta.split('·')[1].trim() : (subject.location || "Aula");

      const dtStart = formatIcsTime(dayInfo.anchorDate, startTime);
      const dtEnd = formatIcsTime(dayInfo.anchorDate, endTime);
      const uid = `cfgs3d-d${day}-s${item.from}-${item.to}-${item.mod}-${index}@horario.pages.dev`;

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
  return lines.map(foldIcsLine).join("\r\n");
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
