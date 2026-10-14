/**
 * @file functions/api/events.js
 * @description Cloudflare Pages Function y Worker endpoint para la gestión de exámenes.
 * Ofrece lectura pública y mutaciones (crear, editar, eliminar) protegidas por ADMIN_PIN.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pin'
};

// Almacenamiento en memoria como fallback si no se configura KV
let inMemoryExams = [];

/**
 * Obtiene el listado de exámenes de KV o memoria fallback.
 * Purga de forma proactiva cualquier examen de prueba residual para evitar que reaparezca.
 * @param {Object} env
 * @returns {Promise<Array>}
 */
async function getStoredExams(env) {
  let exams = inMemoryExams;
  let fromKv = false;
  if (env && env.EVENTS_KV) {
    try {
      const raw = await env.EVENTS_KV.get('school_exams');
      if (raw) {
        exams = JSON.parse(raw);
        fromKv = true;
      }
    } catch (err) {
      console.warn('[Events API] Error al leer de EVENTS_KV, recurriendo a memoria:', err);
    }
  }

  // Filtrar de forma permanente cualquier examen de prueba residual o de demostración
  const isDemoExam = (e) => {
    if (!e) return true;
    const id = String(e.id || '').toLowerCase();
    const title = String(e.title || '').toLowerCase();
    return id === 'exam-sample-1' || id === 'exam-demo-1' || title.includes('principios de animación y rigging') || title.includes('examen de prueba');
  };

  const cleaned = Array.isArray(exams) ? exams.filter(e => !isDemoExam(e)) : [];

  // Si se detectaron exámenes de muestra en KV o memoria, sincronizar la limpieza de inmediato
  if (cleaned.length !== exams.length) {
    if (fromKv && env && env.EVENTS_KV) {
      await env.EVENTS_KV.put('school_exams', JSON.stringify(cleaned)).catch(() => {});
    }
    inMemoryExams = cleaned;
  }

  return cleaned;
}

/**
 * Guarda el listado de exámenes en KV o memoria fallback.
 * @param {Object} env
 * @param {Array} exams
 */
async function saveStoredExams(env, exams) {
  if (env && env.EVENTS_KV) {
    try {
      await env.EVENTS_KV.put('school_exams', JSON.stringify(exams));
      return;
    } catch (err) {
      console.warn('[Events API] Error al escribir en EVENTS_KV, recurriendo a memoria:', err);
    }
  }
  inMemoryExams = exams;
}

/**
 * Valida el PIN recibido contra la variable de entorno ADMIN_PIN.
 * Rechaza la petición si ADMIN_PIN no está configurado en el servidor para evitar contraseñas por defecto.
 * @param {Request} request
 * @param {Object} env
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePin(request, env) {
  const serverPin = env?.ADMIN_PIN ? String(env.ADMIN_PIN).trim() : null;
  if (!serverPin) {
    console.error('[Events API] ADMIN_PIN no está configurado en el entorno de Cloudflare.');
    return { valid: false, error: 'ADMIN_PIN no está configurado en las variables de entorno de Cloudflare.' };
  }

  const headerPin = request.headers.get('X-Admin-Pin');
  if (!headerPin || headerPin.trim() !== serverPin) {
    return { valid: false, error: 'PIN de profesor o delegado incorrecto' };
  }

  return { valid: true };
}

/**
 * Normaliza los campos de un examen y añade timestamp y ISO string.
 * @param {Object} exam
 * @returns {Object}
 */
function normalizeExam(exam) {
  const time = exam.time || '15:45';
  const dt = new Date(`${exam.date}T${time}:00`);
  const validDate = !isNaN(dt.getTime());

  return {
    id: exam.id,
    title: exam.title,
    mod: exam.mod,
    date: exam.date,
    time: exam.time || '15:45',
    notes: exam.notes || '',
    type: 'exam',
    dueIso: validDate ? dt.toISOString() : null,
    dueTimestamp: validDate ? dt.getTime() : 0
  };
}

/**
 * Manejador principal de peticiones HTTP para /api/events.
 * @param {Object} context
 * @param {Request} context.request
 * @param {Object} context.env
 */
export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  // 1. Preflight CORS
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  // 2. GET: Consulta pública para todos los alumnos (sin PIN)
  if (method === 'GET') {
    try {
      const exams = await getStoredExams(env);
      const normalized = exams.map(normalizeExam).sort((a, b) => a.dueTimestamp - b.dueTimestamp);

      return new Response(JSON.stringify({
        success: true,
        count: normalized.length,
        exams: normalized
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          ...CORS_HEADERS
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        success: false,
        error: err.message || 'Error al obtener exámenes'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }
  }

  // 3. Verificación de PIN para operaciones de mutación (POST, DELETE)
  const pinAuth = validatePin(request, env);
  if (!pinAuth.valid) {
    return new Response(JSON.stringify({
      success: false,
      error: pinAuth.error
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
    });
  }

  // 4. POST: Verificación de PIN o Crear/Editar examen
  if (method === 'POST') {
    try {
      const payload = await request.json();

      // Acción especial: sólo verificar si el PIN es válido
      if (payload && payload.action === 'verify') {
        return new Response(JSON.stringify({
          success: true,
          message: 'PIN verificado correctamente'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      // Validar datos mínimos obligatorios para el examen
      if (!payload.title || !payload.mod || !payload.date) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Faltan campos obligatorios (title, mod, date)'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      const exams = await getStoredExams(env);
      let targetExam = null;

      if (payload.id) {
        // Edición de examen existente
        const idx = exams.findIndex(e => e.id === payload.id);
        if (idx !== -1) {
          exams[idx] = {
            ...exams[idx],
            title: payload.title.trim(),
            mod: payload.mod,
            date: payload.date,
            time: payload.time || '15:45',
            notes: (payload.notes || '').trim(),
            updatedAt: new Date().toISOString()
          };
          targetExam = exams[idx];
        } else {
          // Si no existe con ese ID, crearlo con el ID recibido
          targetExam = {
            id: payload.id,
            title: payload.title.trim(),
            mod: payload.mod,
            date: payload.date,
            time: payload.time || '15:45',
            notes: (payload.notes || '').trim(),
            createdAt: new Date().toISOString()
          };
          exams.push(targetExam);
        }
      } else {
        // Creación de nuevo examen
        targetExam = {
          id: `exam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: payload.title.trim(),
          mod: payload.mod,
          date: payload.date,
          time: payload.time || '15:45',
          notes: (payload.notes || '').trim(),
          createdAt: new Date().toISOString()
        };
        exams.push(targetExam);
      }

      await saveStoredExams(env, exams);

      return new Response(JSON.stringify({
        success: true,
        exam: normalizeExam(targetExam)
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        success: false,
        error: err.message || 'Error al procesar examen'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }
  }

  // 5. DELETE: Eliminar examen por ID (?id=...) o todos (?all=true o ?id=all)
  if (method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const idToDelete = url.searchParams.get('id');
      const deleteAll = url.searchParams.get('all') === 'true' || idToDelete === 'all';

      if (deleteAll) {
        await saveStoredExams(env, []);
        return new Response(JSON.stringify({
          success: true,
          message: 'Todos los exámenes han sido eliminados correctamente'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      if (!idToDelete) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Parámetro id obligatorio'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      let exams = await getStoredExams(env);
      const originalCount = exams.length;
      exams = exams.filter(e => e.id !== idToDelete);

      if (exams.length === originalCount) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No se encontró el examen con dicho ID'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
        });
      }

      await saveStoredExams(env, exams);

      return new Response(JSON.stringify({
        success: true,
        deletedId: idToDelete
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    } catch (err) {
      return new Response(JSON.stringify({
        success: false,
        error: err.message || 'Error al eliminar examen'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
      });
    }
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: CORS_HEADERS
  });
}
