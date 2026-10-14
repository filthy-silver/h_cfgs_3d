/**
 * @file kanban-store.js
 * @description Gestión de estado y persistencia en localStorage para el tablero Kanban,
 * tareas personales y notas rápidas.
 */

const STORAGE_KEYS = {
  COLUMNS: 'cfgs3d_kanban_columns',
  PERSONAL_TASKS: 'cfgs3d_kanban_personal_tasks',
  STICKY_NOTES: 'cfgs3d_kanban_notes',
  NOTES_COLLAPSED: 'cfgs3d_kanban_notes_collapsed'
};

const safeStorage = {
  get(key, fallback = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.warn(`[KanbanStore] Error al leer "${key}":`, e);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[KanbanStore] Error al guardar "${key}":`, e);
    }
  }
};

/* ─── 1. Posicionamiento de tarjetas en columnas ─── */

/**
 * Obtiene el mapa { [cardId]: 'pending' | 'in-progress' | 'done' }
 * @returns {Record<string, string>}
 */
export function getAllCardColumns() {
  return safeStorage.get(STORAGE_KEYS.COLUMNS, {}) || {};
}

/**
 * Obtiene la columna asignada a una tarjeta. Si no existe, devuelve la columna por defecto.
 * @param {string} cardId
 * @param {'pending'|'in-progress'|'done'} defaultColumn
 * @returns {string}
 */
export function getCardColumn(cardId, defaultColumn = 'pending') {
  const map = getAllCardColumns();
  return map[cardId] || defaultColumn;
}

/**
 * Asigna una tarjeta a una columna y persiste en localStorage.
 * @param {string} cardId
 * @param {'pending'|'in-progress'|'done'} columnId
 */
export function setCardColumn(cardId, columnId) {
  const map = getAllCardColumns();
  map[cardId] = columnId;
  safeStorage.set(STORAGE_KEYS.COLUMNS, map);
}

/**
 * Elimina el registro de columna de una tarjeta si ha sido eliminada.
 * @param {string} cardId
 */
export function removeCardColumn(cardId) {
  const map = getAllCardColumns();
  if (cardId in map) {
    delete map[cardId];
    safeStorage.set(STORAGE_KEYS.COLUMNS, map);
  }
}

/* ─── 2. Tareas Personales del Alumno ─── */

/**
 * Recupera todas las tareas personales creadas por el alumno.
 * @returns {Array<Object>}
 */
export function getPersonalTasks() {
  return safeStorage.get(STORAGE_KEYS.PERSONAL_TASKS, []) || [];
}

/**
 * Guarda o actualiza una tarea personal en localStorage.
 * @param {Object} task
 * @returns {Object} Tarea guardada con su id asignado
 */
export function savePersonalTask(task) {
  const tasks = getPersonalTasks();
  const id = task.id || `personal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  let dueIso = null;
  let dueTimestamp = 0;
  if (task.date) {
    const time = task.time || '23:59';
    const dt = new Date(`${task.date}T${time}:00`);
    if (!isNaN(dt.getTime())) {
      dueIso = dt.toISOString();
      dueTimestamp = dt.getTime();
    }
  }

  const normalizedTask = {
    ...task,
    id,
    type: 'personal',
    dueIso,
    dueTimestamp,
    updatedAt: now
  };

  const existingIndex = tasks.findIndex(t => t.id === id);
  if (existingIndex >= 0) {
    tasks[existingIndex] = { ...tasks[existingIndex], ...normalizedTask };
  } else {
    normalizedTask.createdAt = now;
    tasks.unshift(normalizedTask);
  }

  safeStorage.set(STORAGE_KEYS.PERSONAL_TASKS, tasks);
  return normalizedTask;
}

/**
 * Elimina una tarea personal por su ID.
 * @param {string} id
 */
export function deletePersonalTask(id) {
  const tasks = getPersonalTasks().filter(t => t.id !== id);
  safeStorage.set(STORAGE_KEYS.PERSONAL_TASKS, tasks);
  removeCardColumn(id);
}

/* ─── 3. Micro-notas y Recordatorios Rápidos (Post-its) ─── */

const DEFAULT_NOTES = [
  {
    id: 'note-1',
    content: 'Traer pendrive USB 3.0 de al menos 32GB para la entrega del render.',
    color: 'yellow',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'note-2',
    content: 'Descargar referencias de iluminación en ArtStation para la práctica de Color.',
    color: 'cyan',
    updatedAt: new Date().toISOString()
  }
];

/**
 * Recupera las notas de recordatorio.
 * @returns {Array<Object>}
 */
export function getStickyNotes() {
  return safeStorage.get(STORAGE_KEYS.STICKY_NOTES, DEFAULT_NOTES) || [];
}

/**
 * Persiste la lista completa de notas rápidas.
 * @param {Array<Object>} notes
 */
export function saveStickyNotes(notes) {
  safeStorage.set(STORAGE_KEYS.STICKY_NOTES, notes);
}

/**
 * Crea una nueva nota en blanco o con valores iniciales.
 * @param {string} [content='']
 * @param {string} [color='yellow']
 * @returns {Object}
 */
export function addStickyNote(content = '', color = 'yellow') {
  const notes = getStickyNotes();
  const newNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    content,
    color,
    updatedAt: new Date().toISOString()
  };
  notes.unshift(newNote);
  saveStickyNotes(notes);
  return newNote;
}

/**
 * Actualiza una nota específica.
 * @param {string} id
 * @param {Partial<Object>} fields
 */
export function updateStickyNote(id, fields) {
  const notes = getStickyNotes();
  const note = notes.find(n => n.id === id);
  if (note) {
    Object.assign(note, fields, { updatedAt: new Date().toISOString() });
    saveStickyNotes(notes);
  }
}

/**
 * Elimina una nota por su ID.
 * @param {string} id
 */
export function deleteStickyNote(id) {
  const notes = getStickyNotes().filter(n => n.id !== id);
  saveStickyNotes(notes);
}

/* ─── 4. Estado de colapso del panel de notas ─── */

/**
 * Consulta si el panel de notas está colapsado.
 * @returns {boolean}
 */
export function isNotesPanelCollapsed() {
  const val = safeStorage.get(STORAGE_KEYS.NOTES_COLLAPSED, false);
  return Boolean(val);
}

/**
 * Guarda si el panel de notas está colapsado.
 * @param {boolean} isCollapsed
 */
export function setNotesPanelCollapsed(isCollapsed) {
  safeStorage.set(STORAGE_KEYS.NOTES_COLLAPSED, Boolean(isCollapsed));
}

/* ─── 5. Exportación e Importación Completa (Sincronización en la Nube) ─── */

/**
 * Empaqueta todos los datos locales del Kanban para sincronizar.
 * @returns {Object}
 */
export function exportAllKanbanData() {
  return {
    columns: getAllCardColumns(),
    personalTasks: getPersonalTasks(),
    stickyNotes: getStickyNotes(),
    notesCollapsed: isNotesPanelCollapsed()
  };
}

/**
 * Importa y persiste el paquete de datos del Kanban recibido de la sincronización.
 * @param {Object} data
 */
export function importAllKanbanData(data) {
  if (!data || typeof data !== 'object') return false;

  let changed = false;
  if (data.columns && typeof data.columns === 'object') {
    safeStorage.set(STORAGE_KEYS.COLUMNS, data.columns);
    changed = true;
  }
  if (Array.isArray(data.personalTasks)) {
    safeStorage.set(STORAGE_KEYS.PERSONAL_TASKS, data.personalTasks);
    changed = true;
  }
  if (Array.isArray(data.stickyNotes)) {
    safeStorage.set(STORAGE_KEYS.STICKY_NOTES, data.stickyNotes);
    changed = true;
  }
  if (typeof data.notesCollapsed === 'boolean') {
    safeStorage.set(STORAGE_KEYS.NOTES_COLLAPSED, data.notesCollapsed);
  }
  return changed;
}

/**
 * Empaqueta el estado del tablero en un formato compacto minificado para enlaces directos de sincronización.
 * @param {Object} data
 * @returns {Object}
 */
export function packCompactData(data) {
  if (!data || typeof data !== 'object') return {};

  const compactCols = {};
  for (const [id, col] of Object.entries(data.columns || {})) {
    if (col === 'pending') compactCols[id] = 'p';
    else if (col === 'in-progress') compactCols[id] = 'i';
    else if (col === 'done') compactCols[id] = 'd';
    else if (col) compactCols[id] = col;
  }

  const compactTasks = (data.personalTasks || []).map(t => [
    t.id || '',
    t.title || '',
    t.mod || '',
    t.date || '',
    t.time || '23:59',
    t.notes || ''
  ]);

  const compactNotes = (data.stickyNotes || []).map(n => [
    n.id || '',
    n.text || '',
    n.color || 'yellow'
  ]);

  return {
    _v: 1,
    c: compactCols,
    t: compactTasks,
    n: compactNotes,
    z: data.notesCollapsed ? 1 : 0
  };
}

/**
 * Desempaqueta el formato compacto minificado a la estructura completa de Kanban.
 * @param {Object} raw
 * @returns {Object|null}
 */
export function unpackCompactData(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Si ya es el formato extendido antiguo, mantener retrocompatibilidad total
  if (raw.columns || raw.personalTasks) {
    return raw;
  }

  const cols = {};
  for (const [id, val] of Object.entries(raw.c || {})) {
    if (val === 'p') cols[id] = 'pending';
    else if (val === 'i') cols[id] = 'in-progress';
    else if (val === 'd') cols[id] = 'done';
    else cols[id] = val;
  }

  const personalTasks = (raw.t || []).map(arr => ({
    id: arr[0],
    title: arr[1],
    mod: arr[2] || null,
    date: arr[3] || null,
    time: arr[4] || '23:59',
    notes: arr[5] || '',
    type: 'personal'
  }));

  const stickyNotes = (raw.n || []).map(arr => ({
    id: arr[0],
    text: arr[1] || '',
    color: arr[2] || 'yellow'
  }));

  return {
    columns: cols,
    personalTasks,
    stickyNotes,
    notesCollapsed: Boolean(raw.z)
  };
}

/**
 * Codifica el paquete de datos del tablero en una cadena Base64 ultracompacta y segura para URLs de sincronización.
 * @param {Object} data
 * @returns {string|null}
 */
export function encodeSyncPayload(data) {
  try {
    const compact = packCompactData(data);
    const jsonStr = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(jsonStr);
    let binStr = '';
    for (let i = 0; i < bytes.length; i++) {
      binStr += String.fromCharCode(bytes[i]);
    }
    return btoa(binStr);
  } catch (err) {
    console.error('[KanbanStore] Error al codificar payload de sincronización:', err);
    return null;
  }
}

/**
 * Decodifica una cadena Base64 (o enlace completo con #sync=...) en el objeto de datos del tablero.
 * @param {string} rawString
 * @returns {Object|null}
 */
export function decodeSyncPayload(rawString) {
  try {
    let clean = String(rawString || '').trim();
    if (clean.includes('#sync=')) {
      clean = clean.split('#sync=')[1];
    } else if (clean.includes('sync=')) {
      clean = clean.split('sync=')[1];
    }
    // Limpiar caracteres URL no deseados
    clean = clean.split('&')[0];

    const binStr = atob(clean);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    const jsonStr = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonStr);

    if (parsed && typeof parsed === 'object') {
      return unpackCompactData(parsed);
    }
    return null;
  } catch (err) {
    console.warn('[KanbanStore] Payload de sincronización inválido o corrupto:', err);
    return null;
  }
}


