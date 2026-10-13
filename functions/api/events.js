/**
 * Cloudflare Pages Function: /api/events
 * API REST para la gestión centralizada de tareas, entregas y exámenes.
 * Valida el PIN en el Edge (servidor) mediante la variable de entorno o Secret env.ADMIN_PIN.
 */

// Cabeceras CORS estándar
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pin'
};

// Eventos iniciales de ejemplo si la base de datos KV aún no tiene registros
const INITIAL_EVENTS = [
  {
    id: 'ev-init-1',
    title: 'Examen Parcial: Principios de Animación y Rigging',
    mod: 'anim',
    type: 'examen',
    date: '2026-10-23',
    time: '17:35',
    notes: 'Temas 1 al 4. Entregar ejercicio previo en Aules.',
    priority: 'high',
    stage: 'todo',
    createdAt: '2026-10-06T12:00:00Z'
  },
  {
    id: 'ev-init-2',
    title: 'Entrega Fase 1: Guion y Storyboard del Proyecto 3D',
    mod: 'proye',
    type: 'entrega',
    date: '2026-10-27',
    time: '15:45',
    notes: 'Subir archivo PDF y enlace a carpeta Drive de referencias.',
    priority: 'normal',
    stage: 'todo',
    createdAt: '2026-10-06T12:00:00Z'
  },
  {
    id: 'ev-init-3',
    title: 'Práctica: Iluminación de tres puntos en Blender',
    mod: 'color',
    type: 'tarea',
    date: '2026-10-30',
    time: '16:40',
    notes: 'Renderizar en formato PNG 1920x1080 con color grading.',
    priority: 'normal',
    stage: 'todo',
    createdAt: '2026-10-06T12:00:00Z'
  }
];

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

// GET /api/events — Consulta pública para todos los alumnos
export async function onRequestGet({ env }) {
  try {
    let events = null;

    if (env && env.EVENTS_KV) {
      const raw = await env.EVENTS_KV.get('school_events');
      if (raw) {
        events = JSON.parse(raw);
      }
    }

    // Si KV está vacío o no configurado aún, servir eventos de muestra
    if (!events) {
      events = INITIAL_EVENTS;
      if (env && env.EVENTS_KV) {
        await env.EVENTS_KV.put('school_events', JSON.stringify(events));
      }
    }

    return new Response(JSON.stringify(events), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=120',
        ...CORS_HEADERS
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}

// POST /api/events — Añadir/Editar evento (Requiere PIN en cabecera X-Admin-Pin)
export async function onRequestPost({ request, env }) {
  const enteredPin = request.headers.get('X-Admin-Pin');
  const serverPin = (env && env.ADMIN_PIN) ? env.ADMIN_PIN : '1234';

  if (!enteredPin || enteredPin.trim() !== serverPin) {
    return new Response(JSON.stringify({ error: 'PIN de profesor/administrador incorrecto' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  try {
    const payload = await request.json();

    if (!payload.title || !payload.mod || !payload.date) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios (title, mod, date)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    let events = [];
    if (env && env.EVENTS_KV) {
      const raw = await env.EVENTS_KV.get('school_events');
      events = raw ? JSON.parse(raw) : INITIAL_EVENTS;
    } else {
      events = [...INITIAL_EVENTS];
    }

    // Si viene con ID existente, es una edición; si no, es nueva creación
    if (payload.id) {
      const idx = events.findIndex(e => e.id === payload.id);
      if (idx !== -1) {
        events[idx] = { ...events[idx], ...payload, updatedAt: new Date().toISOString() };
      } else {
        events.push(payload);
      }
    } else {
      payload.id = 'ev-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
      payload.createdAt = new Date().toISOString();
      payload.stage = payload.stage || 'todo';
      payload.priority = payload.type === 'examen' ? 'high' : (payload.priority || 'normal');
      events.push(payload);
    }

    if (env && env.EVENTS_KV) {
      await env.EVENTS_KV.put('school_events', JSON.stringify(events));
    }

    return new Response(JSON.stringify({ success: true, item: payload }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}

// DELETE /api/events?id=... — Eliminar evento (Requiere PIN)
export async function onRequestDelete({ request, env }) {
  const enteredPin = request.headers.get('X-Admin-Pin');
  const serverPin = (env && env.ADMIN_PIN) ? env.ADMIN_PIN : '1234';

  if (!enteredPin || enteredPin.trim() !== serverPin) {
    return new Response(JSON.stringify({ error: 'PIN de profesor/administrador incorrecto' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  try {
    const url = new URL(request.url);
    const idToDelete = url.searchParams.get('id');

    if (!idToDelete) {
      return new Response(JSON.stringify({ error: 'Parámetro id obligatorio' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    let events = [];
    if (env && env.EVENTS_KV) {
      const raw = await env.EVENTS_KV.get('school_events');
      events = raw ? JSON.parse(raw) : INITIAL_EVENTS;
    } else {
      events = [...INITIAL_EVENTS];
    }

    events = events.filter(e => e.id !== idToDelete);

    if (env && env.EVENTS_KV) {
      await env.EVENTS_KV.put('school_events', JSON.stringify(events));
    }

    return new Response(JSON.stringify({ success: true, id: idToDelete }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
