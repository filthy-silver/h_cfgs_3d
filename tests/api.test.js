const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../functions/api/events.js');

describe('functions/api/events.js - Cloudflare API & PIN Security', () => {
  let mockEnv;

  beforeEach(() => {
    const store = new Map();
    mockEnv = {
      ADMIN_PIN: 'secreto_seguro_4815',
      EVENTS_KV: {
        async get(k) {
          return store.get(k) || null;
        },
        async put(k, v) {
          store.set(k, v);
        }
      }
    };
  });

  it('OPTIONS responde con cabeceras CORS permisivas', async () => {
    const res = await api.onRequestOptions();
    assert.ok(res);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  });

  it('GET /api/events responde 200 y array de eventos iniciales', async () => {
    const res = await api.onRequestGet({ env: mockEnv });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'application/json; charset=utf-8');

    const data = await res.json();
    assert.ok(Array.isArray(data));
    assert.ok(data.length >= 3);
  });

  it('POST /api/events sin cabecera X-Admin-Pin devuelve 401 Unauthorized', async () => {
    const req = {
      headers: { get: () => null },
      json: async () => ({ title: 'Test', mod: 'anim', date: '2026-10-30' })
    };
    const res = await api.onRequestPost({ request: req, env: mockEnv });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error.includes('PIN'));
  });

  it('POST /api/events con PIN incorrecto devuelve 401 Unauthorized', async () => {
    const req = {
      headers: { get: (h) => (h === 'X-Admin-Pin' ? 'pin_invalido' : null) },
      json: async () => ({ title: 'Test', mod: 'anim', date: '2026-10-30' })
    };
    const res = await api.onRequestPost({ request: req, env: mockEnv });
    assert.equal(res.status, 401);
  });

  it('POST /api/events con PIN correcto y campos válidos crea evento (201 Created)', async () => {
    const newEvent = {
      title: 'Examen de Iluminación y Shading',
      mod: 'color',
      type: 'examen',
      date: '2026-11-12',
      time: '16:40',
      notes: 'Traer ejercicios de render'
    };

    const req = {
      headers: { get: (h) => (h === 'X-Admin-Pin' ? 'secreto_seguro_4815' : null) },
      json: async () => newEvent
    };

    const res = await api.onRequestPost({ request: req, env: mockEnv });
    assert.equal(res.status, 201);

    const body = await res.json();
    assert.ok(body.success);
    assert.ok(body.item.id);
    assert.equal(body.item.title, 'Examen de Iluminación y Shading');
    assert.equal(body.item.priority, 'high'); // Los exámenes reciben prioridad alta automáticamente
  });

  it('POST /api/events con campos requeridos faltantes devuelve 400 Bad Request', async () => {
    const req = {
      headers: { get: (h) => (h === 'X-Admin-Pin' ? 'secreto_seguro_4815' : null) },
      json: async () => ({ title: 'Sin fecha ni modulo' })
    };
    const res = await api.onRequestPost({ request: req, env: mockEnv });
    assert.equal(res.status, 400);
  });

  it('POST /api/events con ID existente actualiza el evento en lugar de duplicar', async () => {
    // Primero crear uno
    const createReq = {
      headers: { get: (h) => (h === 'X-Admin-Pin' ? 'secreto_seguro_4815' : null) },
      json: async () => ({ title: 'Original', mod: 'anim', date: '2026-11-01', type: 'tarea' })
    };
    const createRes = await api.onRequestPost({ request: createReq, env: mockEnv });
    const { item } = await createRes.json();

    // Actualizar con el mismo ID
    const updateReq = {
      headers: { get: (h) => (h === 'X-Admin-Pin' ? 'secreto_seguro_4815' : null) },
      json: async () => ({ id: item.id, title: 'Modificado', mod: 'anim', date: '2026-11-02', type: 'tarea' })
    };
    const updateRes = await api.onRequestPost({ request: updateReq, env: mockEnv });
    assert.equal(updateRes.status, 201);

    // Comprobar con GET que solo hay un evento con ese ID
    const getRes = await api.onRequestGet({ env: mockEnv });
    const all = await getRes.json();
    const matches = all.filter((e) => e.id === item.id);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].title, 'Modificado');
  });

  it('DELETE /api/events con PIN correcto elimina el elemento', async () => {
    const req = {
      url: 'https://example.com/api/events?id=ev-init-1',
      headers: { get: (h) => (h === 'X-Admin-Pin' ? 'secreto_seguro_4815' : null) }
    };
    const res = await api.onRequestDelete({ request: req, env: mockEnv });
    assert.equal(res.status, 200);

    const getRes = await api.onRequestGet({ env: mockEnv });
    const all = await getRes.json();
    assert.equal(all.some((e) => e.id === 'ev-init-1'), false);
  });
});
