/**
 * @file functions/api/sync.js
 * @description Endpoint de Cloudflare Pages Functions para sincronización y emparejamiento
 * temporal (Pairing Handshake) del Tablero Kanban entre dispositivos (PC Torre ↔ Móvil).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const PIN_TTL_SECONDS = 300; // 5 minutos de validez

// Memoria de respaldo si Cloudflare KV no está configurado (ej: entorno local o desarrollo)
const inMemorySyncStore = new Map();

/**
 * Limpia registros expirados en la memoria de respaldo.
 */
function cleanExpiredMemoryStore() {
  const now = Date.now();
  for (const [key, value] of inMemorySyncStore.entries()) {
    if (value.expiresAt && value.expiresAt < now) {
      inMemorySyncStore.delete(key);
    }
  }
}

/**
 * Obtiene un registro del almacén KV o memoria.
 * @param {Object} env
 * @param {string} pin
 * @returns {Promise<Object|null>}
 */
async function getSyncRecord(env, pin) {
  const key = `sync_pin_${pin}`;
  if (env && env.EVENTS_KV) {
    try {
      const raw = await env.EVENTS_KV.get(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('[Sync API] Error al leer KV:', e);
    }
  }

  cleanExpiredMemoryStore();
  return inMemorySyncStore.get(key) || null;
}

/**
 * Guarda un registro en el almacén KV o memoria con TTL de expiración.
 * @param {Object} env
 * @param {string} pin
 * @param {Object} record
 * @param {number} ttlSeconds
 */
async function saveSyncRecord(env, pin, record, ttlSeconds = PIN_TTL_SECONDS) {
  const key = `sync_pin_${pin}`;
  record.expiresAt = Date.now() + (ttlSeconds * 1000);

  if (env && env.EVENTS_KV) {
    try {
      // Cloudflare KV exige un TTL mínimo de 60s. Forzamos Math.max(120, ttlSeconds) para evitar 400 por reloj/redondeo.
      const safeTtl = Math.max(120, Math.round(ttlSeconds));
      await env.EVENTS_KV.put(key, JSON.stringify(record), { expirationTtl: safeTtl });
      return;
    } catch (e) {
      console.warn('[Sync API] Error al escribir en KV:', e);
    }
  }

  inMemorySyncStore.set(key, record);
}

/**
 * Genera un código PIN de 6 dígitos único.
 * @returns {string}
 */
function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Manejador principal de peticiones HTTP para /api/sync.
 * @param {Object} context
 * @param {Request} context.request
 * @param {Object} context.env
 */
export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  // 1. Manejo Preflight CORS
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  try {
    // 2. Consulta de estado (Polling del emisor para auto-cierre)
    if (method === 'GET') {
      const url = new URL(request.url);
      const pin = (url.searchParams.get('pin') || '').trim();

      if (!pin) {
        return new Response(JSON.stringify({ success: false, error: 'PIN requerido' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      const record = await getSyncRecord(env, pin);
      if (!record) {
        return new Response(JSON.stringify({ success: true, status: 'expired' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        status: record.status || 'pending',
        remainingSeconds: Math.max(0, Math.round((record.expiresAt - Date.now()) / 1000))
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...CORS_HEADERS
        }
      });
    }

    // 3. Mutaciones (Crear PIN o Canjear PIN)
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const action = body.action;

      // ACCIÓN A: Crear PIN temporal (Emisor)
      if (action === 'create') {
        const payloadData = body.data || {};
        const pin = generatePin();

        const record = {
          pin,
          data: payloadData,
          status: 'pending',
          createdAt: Date.now(),
          expiresAt: Date.now() + (PIN_TTL_SECONDS * 1000)
        };

        await saveSyncRecord(env, pin, record, PIN_TTL_SECONDS);

        const kvBound = Boolean(env && env.EVENTS_KV);

        return new Response(JSON.stringify({
          success: true,
          pin,
          expiresIn: PIN_TTL_SECONDS,
          kvBound
        }), {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...CORS_HEADERS
          }
        });
      }

      // ACCIÓN B: Canjear PIN (Receptor)
      if (action === 'claim') {
        const pin = String(body.pin || '').replace(/\D/g, '').trim();

        if (!pin || pin.length !== 6) {
          return new Response(JSON.stringify({ success: false, error: 'Código PIN de 6 dígitos inválido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        const record = await getSyncRecord(env, pin);
        if (!record) {
          const kvBound = Boolean(env && env.EVENTS_KV);
          const errorMsg = kvBound
            ? 'El código PIN ha caducado o no existe.'
            : 'No se encontró el código. Cloudflare KV no está vinculado en el panel de Cloudflare Pages para comunicar servidores distintos. Utiliza el botón "Copiar enlace directo" o pega el código de transferencia.';

          return new Response(JSON.stringify({
            success: false,
            error: errorMsg,
            kvBound
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        // Si ya fue reclamado por otro receptor, rechazar el doble canje
        if (record.status === 'claimed') {
          return new Response(JSON.stringify({ success: false, error: 'Este código ya ha sido canjeado' }), {
            status: 410,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        // Marcar como reclamado y conservar 120s para que el emisor detecte el cambio en polling
        record.status = 'claimed';
        await saveSyncRecord(env, pin, record, 120);

        return new Response(JSON.stringify({
          success: true,
          data: record.data
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...CORS_HEADERS
          }
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Acción no soportada' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Método HTTP no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || 'Error interno del servidor de sincronización'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
