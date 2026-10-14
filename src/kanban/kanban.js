/**
 * @file kanban.js
 * @description Orquestador principal del Tablero Kanban independiente para CFGS 3D.
 * Carga unificada de Aules + Exámenes + Tareas personales con Drag & Drop nativo y persistencia local.
 */

import { SUBJECTS } from '../data/schedule.data.js';
import { initTheme } from '../ui/theme.js';
import {
  getAllCardColumns,
  getCardColumn,
  setCardColumn,
  getPersonalTasks,
  savePersonalTask,
  deletePersonalTask
} from './kanban-store.js';
import { renderCardHtml } from './kanban-cards.js';
import { initKanbanDnD } from './kanban-dnd.js';
import { initKanbanNotes, renderNotesGrid } from './kanban-notes.js';
import { initKanbanSync } from './kanban-sync.js';

// Estado global de tarjetas en memoria
let allItems = [];
let editingTaskId = null;
let currentSearchTerm = '';

/**
 * Datos de demostración de respaldo en caso de entorno local sin conexión o APIs no disponibles.
 */
const FALLBACK_ITEMS = [
  {
    id: "aules-demo-1",
    title: "Actividad 3: Rigging bípedo y cinemática inversa",
    description: "Módulo de Animación de elementos 2D y 3D. Subir archivo .blend o .fbx con pesos de piel ajustados.",
    category: "Animación de elementos 2D y 3D",
    url: "https://aules.edu.gva.es/fp/",
    dueIso: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
    dueTimestamp: Date.now() + 2 * 24 * 3600 * 1000,
    type: "aules"
  },
  {
    id: "exam-demo-1",
    title: "Examen Parcial: Principios de Animación y Rigging",
    mod: "anim",
    date: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
    time: "17:35",
    notes: "Aula INF-1 · Bloque 1 y 2",
    dueIso: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
    dueTimestamp: Date.now() + 5 * 24 * 3600 * 1000,
    type: "exam"
  },
  {
    id: "aules-demo-2",
    title: "Memoria del Proyecto Intermodular (Fase 1)",
    description: "Subir documento en formato PDF con la biblia de arte y el diseño técnico preliminar.",
    category: "Proyecto intermodular",
    url: "https://aules.edu.gva.es/fp/",
    dueIso: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    dueTimestamp: Date.now() + 7 * 24 * 3600 * 1000,
    type: "aules"
  }
];

/**
 * Carga de entregas de Aules (Moodle).
 * @returns {Promise<Array>}
 */
async function fetchAulesAssignments() {
  try {
    const isDemo = window.location.search.includes('demo=1');
    const apiUrl = isDemo ? '/api/aules?demo=1' : '/api/aules';
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.assignments)) {
      return data.assignments.map(a => ({
        ...a,
        id: a.id || `aules-${a.title.slice(0, 15)}`,
        type: 'aules'
      }));
    }
  } catch (err) {
    console.warn('[Kanban] No se pudo obtener /api/aules:', err);
  }
  return [];
}

/**
 * Carga de exámenes de clase.
 * @returns {Promise<Array>}
 */
async function fetchClassExams() {
  try {
    const res = await fetch('/api/events');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.exams)) {
      return data.exams.map(e => ({
        ...e,
        id: e.id || `exam-${e.date}-${e.title.slice(0, 10)}`,
        type: 'exam'
      }));
    }
  } catch (err) {
    console.warn('[Kanban] No se pudo obtener /api/events:', err);
  }
  return [];
}

/**
 * Carga y unifica todas las fuentes de datos.
 */
async function loadUnifiedData() {
  const [aulesResult, examsResult] = await Promise.allSettled([
    fetchAulesAssignments(),
    fetchClassExams()
  ]);

  const aulesItems = aulesResult.status === 'fulfilled' ? aulesResult.value : [];
  const examItems = examsResult.status === 'fulfilled' ? examsResult.value : [];
  const personalTasks = getPersonalTasks();

  const isDemo = window.location.search.includes('demo=1');
  const fetchedItems = [...aulesItems, ...examItems];

  // Las tareas demo de respaldo SOLO se activan si se solicita explícitamente con ?demo=1
  if (isDemo && fetchedItems.length === 0 && personalTasks.length === 0) {
    allItems = [...FALLBACK_ITEMS];
  } else if (isDemo && fetchedItems.length === 0) {
    allItems = [...FALLBACK_ITEMS, ...personalTasks];
  } else {
    allItems = [...fetchedItems, ...personalTasks];
  }

  renderBoard();
}

/**
 * Renderiza las tarjetas distribuidas en las 3 columnas y actualiza contadores.
 */
function renderBoard() {
  const columnLists = {
    'pending': document.querySelector('#column-pending .column-cards-list'),
    'in-progress': document.querySelector('#column-in-progress .column-cards-list'),
    'done': document.querySelector('#column-done .column-cards-list')
  };

  const columnCounts = {
    'pending': 0,
    'in-progress': 0,
    'done': 0
  };

  // Filtrado por búsqueda
  const filtered = allItems.filter(item => {
    if (!currentSearchTerm) return true;
    const term = currentSearchTerm.toLowerCase();
    const title = (item.title || '').toLowerCase();
    const notes = (item.notes || item.description || '').toLowerCase();
    const category = (item.category || item.mod || '').toLowerCase();
    return title.includes(term) || notes.includes(term) || category.includes(term);
  });

  // Limpiar contenedores
  Object.values(columnLists).forEach(list => {
    if (list) list.innerHTML = '';
  });

  // Distribuir tarjetas
  filtered.forEach(item => {
    const colId = getCardColumn(item.id, 'pending');
    const targetList = columnLists[colId] || columnLists['pending'];

    if (targetList) {
      columnCounts[colId] = (columnCounts[colId] || 0) + 1;
      targetList.insertAdjacentHTML('beforeend', renderCardHtml(item, colId));
    }
  });

  // Actualizar contadores y estados vacíos
  ['pending', 'in-progress', 'done'].forEach(colId => {
    const badge = document.getElementById(`count-${colId}`);
    if (badge) {
      badge.textContent = String(columnCounts[colId] || 0);
    }

    const list = columnLists[colId];
    if (list && list.children.length === 0) {
      const emptyTexts = {
        'pending': 'Sin tareas pendientes',
        'in-progress': 'Arrastra aquí tareas en curso',
        'done': '¡Buen trabajo! No hay tareas completadas'
      };
      list.innerHTML = `<div class="column-empty-state">${emptyTexts[colId] || 'Vacío'}</div>`;
    }
  });
}

/**
 * Actualiza contadores y estados vacíos tras un movimiento de tarjeta sin re-renderizar todo.
 */
function updateBoardCounters() {
  ['pending', 'in-progress', 'done'].forEach(colId => {
    const list = document.querySelector(`#column-${colId} .column-cards-list`);
    const badge = document.getElementById(`count-${colId}`);
    if (!list) return;

    const cards = list.querySelectorAll('.kanban-card');
    if (badge) {
      badge.textContent = String(cards.length);
    }

    // Gestionar mensaje de columna vacía
    const emptyState = list.querySelector('.column-empty-state');
    if (cards.length === 0 && !emptyState) {
      const emptyTexts = {
        'pending': 'Sin tareas pendientes',
        'in-progress': 'Arrastra aquí tareas en curso',
        'done': '¡Buen trabajo! No hay tareas completadas'
      };
      list.innerHTML = `<div class="column-empty-state">${emptyTexts[colId] || 'Vacío'}</div>`;
    } else if (cards.length > 0 && emptyState) {
      emptyState.remove();
    }
  });
}

/**
 * Abre el diálogo modal para crear o editar una tarea personal.
 * @param {string|null} taskId
 */
function openPersonalTaskModal(taskId = null) {
  const modal = document.getElementById('personal-task-modal');
  const titleInput = document.getElementById('task-title-input');
  const modSelect = document.getElementById('task-mod-select');
  const dateInput = document.getElementById('task-date-input');
  const timeInput = document.getElementById('task-time-input');
  const notesInput = document.getElementById('task-notes-input');
  const modalHeading = document.getElementById('task-modal-heading');

  if (!modal) return;

  editingTaskId = taskId;

  // Llenar select de módulos si está vacío
  if (modSelect && modSelect.options.length <= 1) {
    modSelect.innerHTML = '<option value="">Sin módulo / General</option>';
    Object.values(SUBJECTS).forEach(sub => {
      const opt = document.createElement('option');
      opt.value = sub.id;
      opt.textContent = sub.legend || sub.name;
      modSelect.appendChild(opt);
    });
  }

  if (taskId) {
    const task = allItems.find(t => t.id === taskId);
    if (task) {
      modalHeading.textContent = 'Editar Tarea Personal';
      titleInput.value = task.title || '';
      modSelect.value = task.mod || '';
      dateInput.value = task.date || '';
      timeInput.value = task.time || '23:59';
      notesInput.value = task.notes || '';
    }
  } else {
    modalHeading.textContent = 'Nueva Tarea Personal';
    titleInput.value = '';
    modSelect.value = '';
    dateInput.value = '';
    timeInput.value = '23:59';
    notesInput.value = '';
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  titleInput.focus();
}

/**
 * Cierra el diálogo modal de tarea personal.
 */
function closePersonalTaskModal() {
  const modal = document.getElementById('personal-task-modal');
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  editingTaskId = null;
}

/**
 * Configura los eventos del formulario y modal de tareas personales.
 */
function setupModalEvents() {
  const modal = document.getElementById('personal-task-modal');
  const form = document.getElementById('personal-task-form');
  const btnOpen = document.getElementById('btn-add-personal-task');
  const btnClose = modal?.querySelectorAll('[data-close-modal]');

  btnOpen?.addEventListener('click', () => openPersonalTaskModal(null));

  btnClose?.forEach(btn => {
    btn.addEventListener('click', closePersonalTaskModal);
  });

  // Cerrar al pulsar escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('is-open')) {
      closePersonalTaskModal();
    }
  });

  // Cerrar al pulsar el backdrop
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePersonalTaskModal();
    }
  });

  // Envío del formulario
  form?.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = document.getElementById('task-title-input').value.trim();
    if (!title) return;

    const mod = document.getElementById('task-mod-select').value;
    const date = document.getElementById('task-date-input').value;
    const time = document.getElementById('task-time-input').value;
    const notes = document.getElementById('task-notes-input').value.trim();

    const saved = savePersonalTask({
      id: editingTaskId,
      title,
      mod: mod || null,
      date: date || null,
      time: time || '23:59',
      notes
    });

    if (editingTaskId) {
      const idx = allItems.findIndex(t => t.id === editingTaskId);
      if (idx >= 0) allItems[idx] = saved;
    } else {
      allItems.unshift(saved);
      // Por defecto colocar en 'pending'
      setCardColumn(saved.id, 'pending');
    }

    closePersonalTaskModal();
    renderBoard();
  });
}

/**
 * Delegación de eventos para acciones en las tarjetas (editar, eliminar, selector móvil de columna).
 */
function setupCardDelegation() {
  document.addEventListener('click', (e) => {
    // Editar tarea personal
    const editBtn = e.target.closest('.btn-edit-task');
    if (editBtn) {
      const id = editBtn.dataset.id;
      openPersonalTaskModal(id);
      return;
    }

    // Eliminar tarea personal
    const deleteBtn = e.target.closest('.btn-delete-task');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      if (confirm('¿Deseas eliminar esta tarea personal?')) {
        deletePersonalTask(id);
        allItems = allItems.filter(item => item.id !== id);
        renderBoard();
      }
      return;
    }
  });

  // Cambio de columna mediante el selector accesible / táctil
  document.addEventListener('change', (e) => {
    const select = e.target.closest('.card-move-select');
    if (!select) return;

    const cardId = select.dataset.moveId;
    const newColId = select.value;
    const cardEl = document.getElementById(`card-${cardId}`);

    if (cardEl && cardId && newColId) {
      setCardColumn(cardId, newColId);
      cardEl.dataset.column = newColId;

      const targetList = document.querySelector(`#column-${newColId} .column-cards-list`);
      if (targetList) {
        targetList.appendChild(cardEl);
      }
      updateBoardCounters();
    }
  });
}

/**
 * Configura y mantiene actualizado el Service Worker en la vista Kanban.
 */
function setupKanbanServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then(reg => {
          reg.update();
        })
        .catch(err => {
          console.warn('[Kanban] SW registro omitido o fallido:', err);
        });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }
}

/**
 * Inicialización completa de la aplicación Kanban.
 */
function initKanbanApp() {
  // 1. Inicializar tema visual sincronizado con index.html
  initTheme();

  // 2. Inicializar Drag & Drop nativo
  initKanbanDnD({
    onCardMoved: (cardId, newColumnId) => {
      setCardColumn(cardId, newColumnId);
      updateBoardCounters();
    }
  });

  // 3. Inicializar panel colapsable de notas rápidas
  initKanbanNotes();

  // 4. Inicializar vinculación en la nube (Pairing Handshake Móvil ↔ Torre)
  initKanbanSync({
    onDataRestored: () => {
      loadUnifiedData();
      renderNotesGrid();
    }
  });

  // 5. Configurar modal y delegación de acciones
  setupModalEvents();
  setupCardDelegation();

  // 6. Barra de búsqueda rápida
  const searchInput = document.getElementById('kanban-search-input');
  searchInput?.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value.trim();
    renderBoard();
  });

  // 7. Cargar datos unificados (Aules + Exámenes + Personales)
  loadUnifiedData();

  // 8. Service Worker
  setupKanbanServiceWorker();
}

// Ejecutar inmediatamente si el DOM ya está listo (frecuente en móviles y PWA)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initKanbanApp);
} else {
  initKanbanApp();
}
