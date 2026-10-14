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

  // Formato local: YYYYMMDDTHHMMSS (interpretar en hora peninsular española Europe/Madrid)
  const matchLocal = cleanStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (matchLocal) {
    const [, y, m, d, h, min, s] = matchLocal;
    // Calcular el desfase de Madrid (CET UTC+1 o CEST UTC+2) para esa fecha
    const approxUtc = new Date(Date.UTC(+y, +m - 1, +d, +h, +min, +s));
    let offsetMinutes = 60; // Por defecto invierno UTC+1
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hourCycle: 'h23'
      }).formatToParts(approxUtc);
      const p = {};
      for (const part of parts) p[part.type] = parseInt(part.value, 10);
      const madridEpoch = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      offsetMinutes = (madridEpoch - approxUtc.getTime()) / (60 * 1000);
    } catch {
      // Fallback
    }
    const realUtcMs = Date.UTC(+y, +m - 1, +d, +h, +min, +s) - (offsetMinutes * 60 * 1000);
    return new Date(realUtcMs);
  }

  // Formato sólo fecha: YYYYMMDD (final del día en hora peninsular)
  const matchDay = cleanStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (matchDay) {
    const [, y, m, d] = matchDay;
    const approxUtc = new Date(Date.UTC(+y, +m - 1, +d, 23, 59, 59));
    let offsetMinutes = 60;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Madrid',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hourCycle: 'h23'
      }).formatToParts(approxUtc);
      const p = {};
      for (const part of parts) p[part.type] = parseInt(part.value, 10);
      const madridEpoch = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      offsetMinutes = (madridEpoch - approxUtc.getTime()) / (60 * 1000);
    } catch {
      // Fallback
    }
    const realUtcMs = Date.UTC(+y, +m - 1, +d, 23, 59, 59) - (offsetMinutes * 60 * 1000);
    return new Date(realUtcMs);
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
      const stableId = (event.title || 'task').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
      return {
        id: event.id || `aules-${stableId}-${targetDate ? targetDate.getTime() : 0}`,
        title: event.title || 'Entrega pendiente',
        description: event.description || '',
        category: event.category || '',
        url: event.url || 'https://aules.edu.gva.es/fp/',
        dueIso: targetDate ? targetDate.toISOString() : null,
        dueTimestamp: targetDate ? targetDate.getTime() : 0
      };
    })
    .filter(item => item.dueTimestamp > now.getTime())
    .sort((a, b) => a.dueTimestamp - b.dueTimestamp);
}

/**
 * Extrae extensiones o entregables técnicos mediante heurística de expresiones regulares.
 * @param {string} text
 * @returns {string[]}
 */
function extractHeuristicDeliverables(text) {
  if (!text) return [];
  const extRegex = /\.(blend|fbx|obj|stl|ma|mb|max|c4d|hip|psd|ai|png|jpg|jpeg|tga|exr|mp4|mov|avi|pdf|zip|rar|7z|gltf|glb)\b/gi;
  const matches = text.match(extRegex) || [];
  const normalized = Array.from(new Set(matches.map(m => m.toLowerCase())));
  return normalized.slice(0, 5);
}

/**
 * Genera un resumen heurístico instantáneo sin consumo de IA.
 * @param {Object} assignment
 * @returns {Object}
 */
function generateHeuristicSummary(assignment) {
  const desc = (assignment.description || '').replace(/\r\n/g, '\n').trim();
  const title = (assignment.title || '').trim();
  const deliverables = extractHeuristicDeliverables(`${title} ${desc}`);

  let short = '';
  if (desc) {
    const firstLine = desc.split('\n')[0].trim();
    const sentenceMatch = firstLine.match(/^([^.?!]+[.?!])/);
    short = sentenceMatch ? sentenceMatch[1].trim() : (firstLine.slice(0, 110).trim() + (firstLine.length > 110 ? '…' : ''));
  }
  if (!short || short.length < 15) {
    short = deliverables.length > 0 
      ? `Subir archivos requeridos (${deliverables.join(', ')}) antes del plazo fijado.`
      : `Completar y entregar la actividad requerida en el aula virtual.`;
  }

  const paragraph = desc 
    ? (desc.slice(0, 300).trim() + (desc.length > 300 ? '…' : ''))
    : `Actividad del módulo ${assignment.category || 'CFGS 3D'}. Consulta los requisitos técnicos y la rúbrica completa en el enlace de Aules.`;

  return {
    short,
    paragraph,
    deliverables,
    source: 'heuristic'
  };
}

/**
 * Obtiene el resumen de una entrega desde la memoria KV o lo genera con Cloudflare Workers AI.
 * @param {Object} env Entorno de Cloudflare Workers (con EVENTS_KV y AI)
 * @param {Object} assignment Datos de la entrega
 * @returns {Promise<Object>}
 */
async function getOrGenerateSummary(env, assignment) {
  const kvKey = `aules_ai:${assignment.id}`;

  // 1. Comprobar si ya está en caché KV (Memoización de coste cero)
  if (env?.EVENTS_KV) {
    try {
      const cached = await env.EVENTS_KV.get(kvKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.short === 'string') {
          return { ...parsed, cached: true };
        }
      }
    } catch (err) {
      console.warn('[AulesAI] Error al leer KV:', err);
    }
  }

  // 2. Si hay AI disponible, invocar Llama 3.1 8B Instruct
  if (env?.AI && typeof env.AI.run === 'function') {
    try {
      const prompt = `Eres un asistente educativo para alumnos del ciclo CFGS de Animaciones 3D, Juegos y Entornos Interactivos.
Analiza la siguiente tarea escolar y genera un resumen estructurado.

Título: ${assignment.title}
Módulo: ${assignment.category || 'Animación 3D'}
Enunciado: ${assignment.description ? assignment.description.slice(0, 1200) : 'Sin descripción adicional'}

Responde ÚNICAMENTE con un JSON válido y estricto con este esquema exacto (sin bloques de código ni explicaciones):
{
  "short": "Una única frase directa (máximo 120 caracteres) resumiendo qué debe entregar el alumno.",
  "paragraph": "Un párrafo claro y profesional (máximo 280 caracteres) explicando el objetivo práctico, técnica o requisitos.",
  "deliverables": [".blend", ".pdf"]
}`;

      const aiRes = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt,
        max_tokens: 300,
        temperature: 0.2
      });

      let rawText = '';
      if (typeof aiRes === 'string') {
        rawText = aiRes;
      } else if (aiRes && typeof aiRes.response === 'string') {
        rawText = aiRes.response;
      } else if (aiRes && typeof aiRes.text === 'string') {
        rawText = aiRes.text;
      }

      // Limpiar bloques de código markdown y extraer substring JSON seguro
      const cleanJson = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      let jsonCandidate = cleanJson;
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonCandidate = jsonMatch[0];
      }

      const parsedJson = JSON.parse(jsonCandidate);
      if (parsedJson && typeof parsedJson.short === 'string') {
        const result = {
          short: parsedJson.short.trim(),
          paragraph: (parsedJson.paragraph || '').trim(),
          deliverables: Array.isArray(parsedJson.deliverables) 
            ? parsedJson.deliverables.map(d => String(d).toLowerCase().startsWith('.') ? d.toLowerCase() : `.${d.toLowerCase()}`)
            : extractHeuristicDeliverables(assignment.description),
          source: 'ai'
        };

        // Guardar en KV de forma permanente para que no vuelva a computarse jamás
        if (env?.EVENTS_KV) {
          try {
            await env.EVENTS_KV.put(kvKey, JSON.stringify(result));
          } catch (kvErr) {
            console.warn('[AulesAI] Error al guardar en KV:', kvErr);
          }
        }

        return result;
      }
    } catch (aiErr) {
      console.warn('[AulesAI] Inferencia de Workers AI no completada, aplicando fallback:', aiErr);
    }
  }

  // 3. Fallback heurístico instantáneo (tolerancia total a fallos)
  const heuristic = generateHeuristicSummary(assignment);
  return heuristic;
}

/**
 * Enriquece un array de entregas con resúmenes de IA / heurísticos por lotes para respetar cuotas.
 * @param {Object} env
 * @param {Array<Object>} assignments
 * @returns {Promise<Array<Object>>}
 */
async function enrichAssignmentsWithAi(env, assignments) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return [];
  }

  const enriched = [];
  const chunkSize = 3;
  for (let i = 0; i < assignments.length; i += chunkSize) {
    const chunk = assignments.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        const summary = await getOrGenerateSummary(env, item);
        return {
          ...item,
          url: item.url || 'https://aules.edu.gva.es/fp/',
          aiSummary: summary
        };
      })
    );
    enriched.push(...chunkResults);
  }

  return enriched;
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

    const enrichedMock = await enrichAssignmentsWithAi(context.env, mockAssignments);

    return new Response(
      JSON.stringify({
        success: true,
        count: enrichedMock.length,
        assignments: enrichedMock,
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
    const rawAssignments = parseMoodleIcs(rawIcs);
    const assignments = await enrichAssignmentsWithAi(context.env, rawAssignments);

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
