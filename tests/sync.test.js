import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeSyncPayload,
  decodeSyncPayload,
  importAllKanbanData
} from '../src/kanban/kanban-store.js';

describe('kanban-store.js · Sincronización y Serialización Zero-Knowledge', () => {

  it('codifica y decodifica un payload complejo preservando UTF-8, acentos y emojis', () => {
    const original = {
      columns: {
        'exam-1': 'in-progress',
        'aules-1': 'done',
        'personal-1': 'pending'
      },
      personalTasks: [
        {
          id: 'personal-1',
          title: 'Practicar Rigging bípedo y cinemática 🎮',
          notes: 'Módulo de animación 3D · Aula INF-1 con acentos: áéíóú ñ',
          date: '2026-10-25',
          time: '18:30',
          // Campos de normalización que aplica unpackCompactData al desempaquetar
          mod: null,
          type: 'personal'
        }
      ],
      stickyNotes: [
        {
          id: 'note-1',
          text: 'Comprar pendrive 32GB 💡 ¡Importante para entrega!',
          color: 'yellow'
        }
      ],
      notesCollapsed: false
    };

    const token = encodeSyncPayload(original);
    assert.ok(typeof token === 'string' && token.length > 0);

    const decoded = decodeSyncPayload(token);
    assert.deepEqual(decoded, original);
  });

  it('decodifica correctamente extrayendo el token desde una URL completa con hash #sync=', () => {
    const payload = {
      columns: { 'task-1': 'done' },
      personalTasks: [],
      stickyNotes: [{ id: 'n1', text: 'Nota de prueba', color: 'cyan' }],
      notesCollapsed: true
    };

    const token = encodeSyncPayload(payload);
    const fullUrl = `https://cfgs3d.pages.dev/kanban.html#sync=${token}`;

    const decoded = decodeSyncPayload(fullUrl);
    assert.deepEqual(decoded, payload);
  });

  it('devuelve null ante entradas corruptas, vacías o nulas sin lanzar excepciones', () => {
    assert.equal(decodeSyncPayload(''), null);
    assert.equal(decodeSyncPayload(null), null);
    assert.equal(decodeSyncPayload(undefined), null);
    assert.equal(decodeSyncPayload('not-a-valid-base64-payload!!!'), null);
    assert.equal(decodeSyncPayload('https://example.com/kanban.html#sync=invalid'), null);
  });

  it('importAllKanbanData ignora entradas inválidas sin fallar', () => {
    assert.equal(importAllKanbanData(null), false);
    assert.equal(importAllKanbanData(undefined), false);
    assert.equal(importAllKanbanData('string'), false);
  });

});
