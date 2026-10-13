/**
 * Test unitario automatizado para la API de Cloudflare Pages Function y el esquema de tareas
 */
const data = require('../js/data.js');
const { SUBJECTS, EVENT_TYPES, getDaysUntil, formatDueText } = data;

console.log('--- Iniciando prueba de esquema de tareas y API ---');

let errors = 0;

// 1. Probar funciones de fecha
const testDiff0 = getDaysUntil(new Date().toISOString().split('T')[0]);
if (testDiff0 !== 0) {
  console.error(`✖ Error en getDaysUntil(hoy): esperado 0, obtenido ${testDiff0}`);
  errors++;
} else {
  console.log('✓ getDaysUntil para hoy es 0');
}

const dueTextToday = formatDueText(new Date().toISOString().split('T')[0]);
if (dueTextToday !== 'Hoy') {
  console.error(`✖ Error en formatDueText(hoy): esperado 'Hoy', obtenido ${dueTextToday}`);
  errors++;
} else {
  console.log('✓ formatDueText para hoy devuelve "Hoy"');
}

// 2. Simular Cloudflare Pages Function
const api = require('../functions/api/events.js');

async function runApiTests() {
  const mockEnv = {
    ADMIN_PIN: 'secret2026',
    EVENTS_KV: {
      data: new Map(),
      async get(key) { return this.data.get(key) || null; },
      async put(key, val) { this.data.set(key, val); }
    }
  };

  // Test GET inicial
  const getRes = await api.onRequestGet({ env: mockEnv });
  if (getRes.status !== 200) {
    console.error(`✖ Error GET status: esperado 200, obtenido ${getRes.status}`);
    errors++;
  }
  const initialItems = await getRes.json();
  if (!Array.isArray(initialItems) || initialItems.length === 0) {
    console.error('✖ Error GET: se esperaba un array no vacío de eventos iniciales');
    errors++;
  } else {
    console.log(`✓ GET /api/events devuelve ${initialItems.length} elementos por defecto.`);
  }

  // Test POST sin PIN o con PIN incorrecto -> Debe devolver 401
  const badPostReq = {
    headers: new Map([['X-Admin-Pin', 'pin_falso']]),
    async json() { return { title: 'Test', mod: 'anim', date: '2026-10-30', type: 'examen' }; }
  };
  badPostReq.headers.get = (k) => badPostReq.headers.get ? badPostReq.headers.get.call(badPostReq.headers, k) : 'pin_falso';

  const badPostRes = await api.onRequestPost({
    request: {
      headers: { get: (name) => name === 'X-Admin-Pin' ? 'pin_invalido' : null },
      json: async () => ({ title: 'Test', mod: 'anim', date: '2026-10-30' })
    },
    env: mockEnv
  });

  if (badPostRes.status !== 401) {
    console.error(`✖ Error POST con PIN erróneo: esperado 401, obtenido ${badPostRes.status}`);
    errors++;
  } else {
    console.log('✓ POST /api/events con PIN incorrecto bloqueado con 401 Unauthorized.');
  }

  // Test POST con PIN correcto -> Debe devolver 201
  const goodPostRes = await api.onRequestPost({
    request: {
      headers: { get: (name) => name === 'X-Admin-Pin' ? 'secret2026' : null },
      json: async () => ({
        title: 'Examen de Prueba Blender 3D',
        mod: 'anim',
        date: '2026-11-15',
        type: 'examen',
        notes: 'Modelado y rig'
      })
    },
    env: mockEnv
  });

  if (goodPostRes.status !== 201) {
    console.error(`✖ Error POST con PIN correcto: esperado 201, obtenido ${goodPostRes.status}`);
    errors++;
  } else {
    const postJson = await goodPostRes.json();
    console.log(`✓ POST /api/events con PIN correcto aceptado (ID: ${postJson.item.id}).`);

    // Test DELETE con PIN correcto
    const delRes = await api.onRequestDelete({
      request: {
        url: `https://example.com/api/events?id=${postJson.item.id}`,
        headers: { get: (name) => name === 'X-Admin-Pin' ? 'secret2026' : null }
      },
      env: mockEnv
    });

    if (delRes.status !== 200) {
      console.error(`✖ Error DELETE con PIN: esperado 200, obtenido ${delRes.status}`);
      errors++;
    } else {
      console.log('✓ DELETE /api/events con PIN correcto ejecutado satisfactoriamente.');
    }
  }

  if (errors === 0) {
    console.log('✔ ¡Todas las pruebas de la API y esquema pasaron con éxito!');
    process.exit(0);
  } else {
    console.error(`✖ Pruebas finalizadas con ${errors} errores.`);
    process.exit(1);
  }
}

runApiTests();
