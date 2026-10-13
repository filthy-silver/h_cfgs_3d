/**
 * @file kanban-notes.js
 * @description Gestión del panel inferior colapsable de notas rápidas y recordatorios tipo post-it
 * con guardado automático en tiempo real y personalización de color.
 */

import {
  getStickyNotes,
  addStickyNote,
  updateStickyNote,
  deleteStickyNote,
  isNotesPanelCollapsed,
  setNotesPanelCollapsed
} from './kanban-store.js';

const COLOR_PALETTES = [
  { id: 'yellow', label: 'Amarillo', hex: '#fef08a' },
  { id: 'cyan', label: 'Cian', hex: '#a5f3fc' },
  { id: 'emerald', label: 'Verde', hex: '#a7f3d0' },
  { id: 'purple', label: 'Lavanda', hex: '#ddd6fe' },
  { id: 'pink', label: 'Rosa', hex: '#fbcfe8' }
];

let debounceTimers = new Map();

/**
 * Escapa HTML para prevenir XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Inicializa el panel inferior de notas.
 */
export function initKanbanNotes() {
  const panelEl = document.getElementById('kanban-notes-panel');
  if (!panelEl) return;

  const toggleBtn = document.getElementById('btn-toggle-notes');
  const addBtn = document.getElementById('btn-add-note');
  const gridEl = document.getElementById('notes-grid');
  const countBadge = document.getElementById('notes-count-badge');

  // 1. Restaurar estado de colapso
  const initiallyCollapsed = isNotesPanelCollapsed();
  applyCollapsedState(panelEl, toggleBtn, initiallyCollapsed);

  toggleBtn?.addEventListener('click', () => {
    const isCurrentlyCollapsed = panelEl.classList.contains('is-collapsed');
    const newState = !isCurrentlyCollapsed;
    applyCollapsedState(panelEl, toggleBtn, newState);
    setNotesPanelCollapsed(newState);
  });

  // 2. Botón añadir nueva nota
  addBtn?.addEventListener('click', () => {
    // Si el panel está plegado, desplegarlo al añadir
    if (panelEl.classList.contains('is-collapsed')) {
      applyCollapsedState(panelEl, toggleBtn, false);
      setNotesPanelCollapsed(false);
    }
    const newNote = addStickyNote('', 'yellow');
    renderNotesGrid();

    // Enfocar inmediatamente la nueva nota
    requestAnimationFrame(() => {
      const textarea = document.querySelector(`textarea[data-note-id="${newNote.id}"]`);
      if (textarea) textarea.focus();
    });
  });

  // 3. Render inicial
  renderNotesGrid();

  // 4. Delegación de eventos en la rejilla de notas
  if (gridEl) {
    // Auto-ajuste de altura y autosave en tiempo real
    gridEl.addEventListener('input', (e) => {
      const textarea = e.target.closest('.sticky-note-textarea');
      if (!textarea) return;

      autoResizeTextarea(textarea);

      const noteId = textarea.dataset.noteId;
      const content = textarea.value;

      // Debounce para no sobrecargar el almacenamiento
      if (debounceTimers.has(noteId)) {
        clearTimeout(debounceTimers.get(noteId));
      }

      debounceTimers.set(noteId, setTimeout(() => {
        updateStickyNote(noteId, { content });
        debounceTimers.delete(noteId);
      }, 300));
    });

    // Clics para borrar, cambiar color o crear primera nota
    gridEl.addEventListener('click', (e) => {
      // Botón de estado vacío
      const emptyBtn = e.target.closest('#btn-empty-note');
      if (emptyBtn) {
        addStickyNote('Ej: Recordar traer el disco duro para la entrega de texturas.', 'yellow');
        renderNotesGrid();
        return;
      }

      // Eliminar nota
      const deleteBtn = e.target.closest('.btn-delete-note');
      if (deleteBtn) {
        const noteId = deleteBtn.dataset.noteId;
        deleteStickyNote(noteId);
        renderNotesGrid();
        return;
      }

      // Cambiar color de nota
      const colorDot = e.target.closest('.note-color-dot');
      if (colorDot) {
        const noteId = colorDot.dataset.noteId;
        const color = colorDot.dataset.color;
        updateStickyNote(noteId, { color });

        const noteCard = colorDot.closest('.sticky-note-card');
        if (noteCard) {
          noteCard.dataset.color = color;
          noteCard.querySelectorAll('.note-color-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.color === color);
          });
        }
      }
    });
  }
}

/**
 * Aplica visualmente el estado colapsado / expandido al panel de notas.
 * @param {HTMLElement} panelEl
 * @param {HTMLButtonElement} toggleBtn
 * @param {boolean} isCollapsed
 */
function applyCollapsedState(panelEl, toggleBtn, isCollapsed) {
  panelEl.classList.toggle('is-collapsed', isCollapsed);
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    const iconSpan = toggleBtn.querySelector('.toggle-icon');
    if (iconSpan) {
      iconSpan.textContent = isCollapsed ? '▲' : '▼';
    }
    toggleBtn.title = isCollapsed ? 'Desplegar panel de notas' : 'Plegar panel de notas';
  }
}

/**
 * Renderiza la rejilla completa de notas rápidas.
 */
export function renderNotesGrid() {
  const gridEl = document.getElementById('notes-grid');
  const countBadge = document.getElementById('notes-count-badge');
  if (!gridEl) return;

  const notes = getStickyNotes();

  if (countBadge) {
    countBadge.textContent = `${notes.length} ${notes.length === 1 ? 'nota' : 'notas'}`;
  }

  if (notes.length === 0) {
    gridEl.innerHTML = `
      <div class="notes-empty-state">
        <p>No tienes notas ni recordatorios pendientes.</p>
        <button type="button" class="btn-empty-add-note" id="btn-empty-note">Crear mi primera nota</button>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = notes.map(note => {
    const currentColor = note.color || 'yellow';

    const colorDotsHtml = COLOR_PALETTES.map(p => `
      <button
        type="button"
        class="note-color-dot ${p.id === currentColor ? 'active' : ''}"
        data-note-id="${note.id}"
        data-color="${p.id}"
        title="Color ${p.label}"
        aria-label="Color ${p.label}"
        style="background: ${p.hex}"
      ></button>
    `).join('');

    return `
      <article class="sticky-note-card" data-color="${currentColor}" id="note-${note.id}">
        <header class="note-card-header">
          <div class="note-palette-bar" role="group" aria-label="Elegir color de la nota">
            ${colorDotsHtml}
          </div>
          <button
            type="button"
            class="btn-delete-note"
            data-note-id="${note.id}"
            title="Eliminar nota"
            aria-label="Eliminar nota"
          >
            &times;
          </button>
        </header>

        <textarea
          class="sticky-note-textarea"
          data-note-id="${note.id}"
          placeholder="Escribe un apunte, enlace o recordatorio…"
          aria-label="Contenido de la nota"
        >${escapeHtml(note.content)}</textarea>
      </article>
    `;
  }).join('');

  // Ajustar altura de los textareas renderizados
  gridEl.querySelectorAll('.sticky-note-textarea').forEach(autoResizeTextarea);
}

/**
 * Ajusta la altura del textarea dinámicamente según su contenido.
 * @param {HTMLTextAreaElement} textarea
 */
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(80, textarea.scrollHeight) + 'px';
}
