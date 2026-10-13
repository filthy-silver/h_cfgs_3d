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
