/**
 * @file functions/api/aules.js
 * @description Cloudflare Pages Function que actúa como Edge Proxy para el feed iCal de Aules (Moodle).
 * Descarga el feed autenticado desde AULES_ICAL_URL, lo parsea, filtra eventos futuros y los sirve como JSON.
 */

/**
 * Normaliza y desdobla las líneas de texto iCalendar según RFC 5545
 * (las líneas que comienzan con espacio o tabulación son continuación de la anterior).
 * @param {string} rawIcs
 * @returns {string[]}
 */
function unfoldIcsLines(rawIcs) {
  const normalized = rawIcs.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const unfolded = [];
  const lines = normalized.split('\n');

  for (const line of lines) {
    if (!line) continue;
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line.trim());
    }
  }

  return unfolded;
}

/**
 * Parsea una cadena de fecha iCalendar (ej: "20261015T215900Z" o "20261015T235900") a un objeto Date.
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseIcsDate(dateStr) {
  if (!dateStr) return null;

  // Si incluye parámetros de zona horaria (ej: DTEND;TZID=Europe/Madrid:20261015T235900)
  const cleanStr = dateStr.includes(':') ? dateStr.split(':').pop() : dateStr;

  // Formato UTC: YYYYMMDDTHHMMSSZ
  const matchUtc = cleanStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (matchUtc) {
    const [, y, m, d, h, min, s] = matchUtc;
    return new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +s));
  }

  // Formato local: YYYYMMDDTHHMMSS
  const matchLocal = cleanStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (matchLocal) {
    const [, y, m, d, h, min, s] = matchLocal;
    return new Date(+y, +m - 1, +d, +h, +min, +s);
  }

  // Formato sólo fecha: YYYYMMDD
  const matchDay = cleanStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (matchDay) {
    const [, y, m, d] = matchDay;
    return new Date(+y, +m - 1, +d, 23, 59, 59);
  }

  return null;
}

/**
 * Decodifica caracteres especiales escapados en campos de texto iCalendar.
 * @param {string} text
 * @returns {string}
 */
function unescapeIcsText(text) {
  if (!text) return '';
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Extrae y parsea los bloques VEVENT del contenido iCalendar de Moodle.
 * @param {string} rawIcs
 * @returns {Array<Object>}
 */
function parseMoodleIcs(rawIcs) {
  const lines = unfoldIcsLines(rawIcs);
  const assignments = [];
  let inEvent = false;
  let currentEvent = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (inEvent && (currentEvent.dueDate || currentEvent.startDate)) {
        assignments.push(currentEvent);
      }
      inEvent = false;
      currentEvent = {};
      continue;
    }

    if (!inEvent) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    const rawProp = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    const propName = rawProp.split(';')[0].toUpperCase();

    switch (propName) {
      case 'UID':
        currentEvent.id = value;
        break;
      case 'SUMMARY':
        currentEvent.title = unescapeIcsText(value);
        break;
      case 'DESCRIPTION':
        currentEvent.description = unescapeIcsText(value);
        break;
      case 'CATEGORIES':
        currentEvent.category = unescapeIcsText(value);
        break;
      case 'URL':
        currentEvent.url = value;
        break;
      case 'DTEND':
        currentEvent.dueDate = parseIcsDate(value);
        break;
      case 'DTSTART':
        currentEvent.startDate = parseIcsDate(value);
        break;
    }
  }

  const now = new Date();

  // Filtrar eventos pasados y normalizar fecha límite
  return assignments
    .map(event => {
      const targetDate = event.dueDate || event.startDate;
      return {
        id: event.id || `aules-${Math.random().toString(36).slice(2)}`,
        title: event.title || 'Entrega pendiente',
        description: event.description || '',
        category: event.category || '',
        url: event.url || null,
        dueIso: targetDate ? targetDate.toISOString() : null,
        dueTimestamp: targetDate ? targetDate.getTime() : 0
      };
    })
    .filter(item => item.dueTimestamp > now.getTime())
    .sort((a, b) => a.dueTimestamp - b.dueTimestamp);
}

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  // Manejo de peticiones preflight CORS
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const aulesUrl = context.env?.AULES_ICAL_URL;
  const requestUrl = new URL(context.request.url);
  const isDemo = requestUrl.searchParams.get('demo') === '1' || aulesUrl === 'demo' || aulesUrl === 'mock';

  // Modo demostración / pruebas locales
  if (isDemo) {
    const now = new Date();
    const mockAssignments = [
      {
        id: "demo-1",
        title: "Actividad 3: Rigging bípedo y cinemática inversa",
        description: "Módulo de Animación de elementos 2D y 3D. Subir archivo .blend o .fbx con pesos de piel ajustados.",
        category: "Animación de elementos 2D y 3D",
        url: "https://aules.edu.gva.es/fp/",
        dueIso: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        dueTimestamp: now.getTime() + 2 * 24 * 60 * 60 * 1000
      },
      {
        id: "demo-2",
        title: "Memoria del Proyecto Intermodular (Fase 1)",
        description: "Subir documento en formato PDF con la biblia de arte y el diseño técnico preliminar.",
        category: "Proyecto intermodular",
        url: "https://aules.edu.gva.es/fp/",
        dueIso: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        dueTimestamp: now.getTime() + 4 * 24 * 60 * 60 * 1000
      },
      {
        id: "demo-3",
        title: "Iluminación de tres puntos y Render passes",
        description: "Color, iluminación y acabados. Entrega de pases de difuso, especular y oclusión ambiental.",
        category: "Color, iluminación y acabados",
        url: "https://aules.edu.gva.es/fp/",
        dueIso: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        dueTimestamp: now.getTime() + 7 * 24 * 60 * 60 * 1000
      },
      {
        id: "demo-4",
        title: "Modelado Low-Poly y mapa UV del personaje",
        description: "Diseño, dibujo y modelado. Malla de menos de 10k polígonos con texturas aplicadas.",
        category: "Diseño, dibujo y modelado",
        url: "https://aules.edu.gva.es/fp/",
        dueIso: new Date(now.getTime() + 11 * 24 * 60 * 60 * 1000).toISOString(),
        dueTimestamp: now.getTime() + 11 * 24 * 60 * 60 * 1000
      }
    ];

    return new Response(
      JSON.stringify({
        success: true,
        count: mockAssignments.length,
        assignments: mockAssignments,
        isDemo: true
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store'
        }
      }
    );
  }

  // Si no está configurado el secreto en Cloudflare
  if (!aulesUrl) {
    return new Response(
      JSON.stringify({
        success: false,
        assignments: [],
        message: 'AULES_ICAL_URL no configurada en las variables de entorno de Cloudflare. Añade el secreto en el panel de Cloudflare o en un archivo .dev.vars local.'
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store'
        }
      }
    );
  }

  try {
    const response = await fetch(aulesUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/calendar, text/plain, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`Error en el servidor de Aules: ${response.status} ${response.statusText}`);
    }

    const rawIcs = await response.text();
    const assignments = parseMoodleIcs(rawIcs);

    return new Response(
      JSON.stringify({
        success: true,
        count: assignments.length,
        assignments
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          // 30 minutos de caché en el Edge y en el cliente para no sobrecargar el servidor Moodle
          'Cache-Control': 'public, max-age=1800, s-maxage=1800'
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        assignments: [],
        error: error.message || 'Error al conectar con Aules'
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}
