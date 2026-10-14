/**
 * @file functions/api/chat-invites.js
 * @description API de Cloudflare para gestión del Árbol Genealógico de Invitaciones,
 * control de cupos por alumno, trazabilidad de linaje y revocación en cascada.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const DEFAULT_USER_QUOTA = 2; // Cada usuario puede invitar a 2 personas
const MASTER_ADMIN_FINGERPRINT = 'filthysilver';

// Memoria de respaldo si KV no está enlazado localmente
const memoryInvites = new Map(); // code -> inviteRecord
const memoryUsers = new Map();   // fingerprint -> userRecord

/**
 * Obtiene un registro de la base KV o memoria.
 */
async function getKv(env, key) {
  if (env && env.EVENTS_KV) {
    try {
      const raw = await env.EVENTS_KV.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[Invites API] Error al leer KV:', e);
    }
  }
  return memoryInvites.get(key) || memoryUsers.get(key) || null;
}

/**
 * Guarda un registro en la base KV o memoria.
 */
async function setKv(env, key, value, ttlSeconds = null) {
  if (env && env.EVENTS_KV) {
    try {
      const opts = ttlSeconds ? { expirationTtl: Math.max(120, ttlSeconds) } : undefined;
      await env.EVENTS_KV.put(key, JSON.stringify(value), opts);
      return;
    } catch (e) {
      console.warn('[Invites API] Error al escribir en KV:', e);
    }
  }

  if (key.startsWith('inv_')) {
    memoryInvites.set(key, value);
  } else {
    memoryUsers.set(key, value);
  }
}

/**
 * Genera un código de invitación seguro y legible (ej: INV-8F3B2A).
 */
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let str = '';
  for (let i = 0; i < 6; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `INV-${str}`;
}

/**
 * Manejador principal para /api/chat/invites
 */
export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    // 1. GET: Consultar árbol de un usuario, cupos restantes y a quién invitó
    if (method === 'GET') {
      const fp = (url.searchParams.get('fingerprint') || '').trim().toLowerCase();
      if (!fp) {
        return new Response(JSON.stringify({ success: false, error: 'Huella requerida' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      const userKey = `user_meta_${fp}`;
      let user = await getKv(env, userKey);

      // Si es el admin maestro o usuario no registrado aún
      const isAdmin = fp.includes(MASTER_ADMIN_FINGERPRINT) || fp === 'admin';
      if (!user) {
        user = {
          fingerprint: fp,
          quota: isAdmin ? 9999 : DEFAULT_USER_QUOTA,
          invitedBy: isAdmin ? 'GENESIS' : 'UNKNOWN',
          invitedByLabel: isAdmin ? 'Sistema Génesis' : 'Invitación Directa',
          createdAt: Date.now(),
          banned: false
        };
        await setKv(env, userKey, user);
      }

      // Obtener invitaciones emitidas por este usuario
      const issuedKey = `issued_by_${fp}`;
      const issuedCodes = (await getKv(env, issuedKey)) || [];

      const inviteDetails = [];
      for (const code of issuedCodes) {
        const inv = await getKv(env, `inv_${code}`);
        if (inv) inviteDetails.push(inv);
      }

      const usedCount = inviteDetails.filter(i => i.used).length;
      const remainingQuota = Math.max(0, user.quota - inviteDetails.length);

      return new Response(JSON.stringify({
        success: true,
        fingerprint: fp,
        quota: user.quota,
        remainingQuota: isAdmin ? 9999 : remainingQuota,
        usedCount,
        invitedBy: user.invitedBy,
        invitedByLabel: user.invitedByLabel,
        banned: Boolean(user.banned),
        invites: inviteDetails
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    // 2. POST: Crear o canjear invitaciones
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const action = body.action;

      // ACCIÓN A: Crear nueva invitación (consume 1 del cupo)
      if (action === 'create') {
        const { creatorFingerprint, creatorLabel, targetLabel } = body;
        const fp = (creatorFingerprint || '').trim().toLowerCase();

        if (!fp) {
          return new Response(JSON.stringify({ success: false, error: 'Identificador del emisor requerido' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        const isAdmin = fp.includes(MASTER_ADMIN_FINGERPRINT) || fp === 'admin';
        const userKey = `user_meta_${fp}`;
        let user = await getKv(env, userKey);

        if (!user) {
          user = {
            fingerprint: fp,
            quota: isAdmin ? 9999 : DEFAULT_USER_QUOTA,
            invitedBy: isAdmin ? 'GENESIS' : 'UNKNOWN',
            invitedByLabel: isAdmin ? 'Génesis' : 'Directo',
            banned: false
          };
        }

        if (user.banned) {
          return new Response(JSON.stringify({ success: false, error: 'Usuario suspendido. No puedes crear invitaciones.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        const issuedKey = `issued_by_${fp}`;
        const issuedCodes = (await getKv(env, issuedKey)) || [];

        if (!isAdmin && issuedCodes.length >= user.quota) {
          return new Response(JSON.stringify({
            success: false,
            error: `Has agotado tu cupo de ${user.quota} invitaciones.`
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        const code = generateCode();
        const inviteRecord = {
          code,
          creatorFingerprint: fp,
          creatorLabel: creatorLabel || `Usuario#${fp.slice(0, 4)}`,
          targetLabel: targetLabel || 'Compañero',
          createdAt: Date.now(),
          used: false,
          usedByFingerprint: null,
          usedByLabel: null,
          usedAt: null
        };

        // Guardar registro de la invitación
        await setKv(env, `inv_${code}`, inviteRecord);

        // Actualizar lista de emitidas por el creador
        issuedCodes.push(code);
        await setKv(env, issuedKey, issuedCodes);

        return new Response(JSON.stringify({
          success: true,
          code,
          inviteRecord,
          remainingQuota: isAdmin ? 9999 : (user.quota - issuedCodes.length)
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // ACCIÓN B: Canjear invitación (Registro de linaje del nuevo alumno)
      if (action === 'claim') {
        const { code, userFingerprint, nickname } = body;
        const cleanCode = String(code || '').trim().toUpperCase();
        const cleanFp = String(userFingerprint || '').trim().toLowerCase();

        if (!cleanCode || !cleanFp) {
          return new Response(JSON.stringify({ success: false, error: 'Código y huella requeridos' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        const inviteKey = `inv_${cleanCode}`;
        const inviteRecord = await getKv(env, inviteKey);

        if (!inviteRecord) {
          return new Response(JSON.stringify({ success: false, error: 'Código de invitación inexistente o inválido.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        if (inviteRecord.used) {
          return new Response(JSON.stringify({
            success: false,
            error: `Este código ya fue utilizado por ${inviteRecord.usedByLabel || 'otro compañero'}.`
          }), {
            status: 410,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
          });
        }

        // Marcar la invitación como canjeada
        inviteRecord.used = true;
        inviteRecord.usedByFingerprint = cleanFp;
        inviteRecord.usedByLabel = nickname || `Alumno#${cleanFp.slice(0, 4)}`;
        inviteRecord.usedAt = Date.now();
        await setKv(env, inviteKey, inviteRecord);

        // Crear ficha de linaje del nuevo usuario
        const newUserKey = `user_meta_${cleanFp}`;
        const newUser = {
          fingerprint: cleanFp,
          nickname: nickname || inviteRecord.usedByLabel,
          quota: DEFAULT_USER_QUOTA,
          invitedBy: inviteRecord.creatorFingerprint,
          invitedByLabel: inviteRecord.creatorLabel,
          inviteCodeUsed: cleanCode,
          joinedAt: Date.now(),
          banned: false
        };
        await setKv(env, newUserKey, newUser);

        return new Response(JSON.stringify({
          success: true,
          message: '¡Invitación validada con éxito!',
          lineage: {
            invitedBy: inviteRecord.creatorFingerprint,
            invitedByLabel: inviteRecord.creatorLabel
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      // ACCIÓN C: Revocación en cascada (Admin / Moderador)
      if (action === 'revoke_cascade') {
        const { targetFingerprint } = body;
        const targetFp = String(targetFingerprint || '').trim().toLowerCase();

        // Expulsamos al usuario diana
        const targetUserKey = `user_meta_${targetFp}`;
        const targetUser = await getKv(env, targetUserKey);
        if (targetUser) {
          targetUser.banned = true;
          await setKv(env, targetUserKey, targetUser);
        }

        // Buscamos todas las invitaciones emitidas por él y suspendemos a sus invitados
        const issuedKey = `issued_by_${targetFp}`;
        const issuedCodes = (await getKv(env, issuedKey)) || [];
        const affectedUsers = [];

        for (const code of issuedCodes) {
          const inv = await getKv(env, `inv_${code}`);
          if (inv && inv.used && inv.usedByFingerprint) {
            const childFp = inv.usedByFingerprint;
            const childUser = await getKv(env, `user_meta_${childFp}`);
            if (childUser) {
              childUser.banned = true;
              await setKv(env, `user_meta_${childFp}`, childUser);
              affectedUsers.push(childFp);
            }
          }
        }

        return new Response(JSON.stringify({
          success: true,
          message: `Usuario ${targetFp} y ${affectedUsers.length} descendientes suspendidos en cascada.`,
          affectedUsers
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Acción no soportada' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Error interno del servidor de invitaciones' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
