/**
 * @file assignments-view.js
 * @description Componente de interfaz para renderizar el panel de Próximas Entregas de Aules (Moodle).
 */

import { SUBJECTS } from '../data/schedule.data.js';

import { AULES_SUBJECT_PATTERNS, matchSubject } from '../domain/subject-matcher.js';
import { escapeHtml, sanitizeUrl } from '../domain/sanitizer.js';

export { AULES_SUBJECT_PATTERNS, matchSubject, escapeHtml, sanitizeUrl };

/**
 * Formatea una fecha y calcula la etiqueta de urgencia relativa (ej. "Hoy", "Mañana", "En 3 días").
 * @param {string|number} dueIsoOrTimestamp
 * @returns {{ formattedDate: string, time: string, relativeBadge: string, isUrgent: boolean }}
 */
function formatDueDate(dueIsoOrTimestamp) {
  const dueDate = new Date(dueIsoOrTimestamp);
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffHours / 24);

  const formattedDate = dueDate.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });

  const time = dueDate.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit"
  });

  let relativeBadge = `En ${diffDays} días`;
  let isUrgent = false;

  if (diffHours <= 12) {
    relativeBadge = "¡Hoy!";
    isUrgent = true;
  } else if (diffHours <= 24) {
    relativeBadge = "En 24h";
    isUrgent = true;
  } else if (diffDays === 1) {
    relativeBadge = "Mañana";
    isUrgent = true;
  } else if (diffDays === 2) {
    relativeBadge = "En 2 días";
  }

  return {
    formattedDate: `${formattedDate} · ${time}`,
    time,
    relativeBadge,
    isUrgent
  };
}

// Variables internas de estado y listeners para no duplicar eventos
let adminActionCallbacks = null;
let panelListenerAttached = false;

/**
 * Renderiza el listado unificado de entregas y exámenes en `#assignments-panel`.
 * Si el listado está vacío o no es válido, oculta el contenedor entero.
 * @param {Array<Object>} items Lista combinada de entregas y exámenes
 * @param {Object} [options={}] Opciones de renderizado (isAdmin, onEditExam, onDeleteExam, onAddExam)
 */
export function renderAssignments(items, options = {}) {
  const panelEl = document.getElementById("assignments-panel");
  if (!panelEl) return;

  const { isAdmin = false, onEditExam, onDeleteExam, onAddExam } = options;
  adminActionCallbacks = { onEditExam, onDeleteExam, onAddExam };

  if (!items || !items.length) {
    // Si no hay tareas, mostrar cabecera limpia con enlace directo al tablero personal
    panelEl.innerHTML = `
      <header class="assignments-header">
        <div class="assignments-title-group">
          <div class="assignments-icon-box" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          </div>
          <div>
            <h2 class="assignments-heading">Próximas Entregas y Exámenes</h2>
            <p class="assignments-subheading">Sin entregas ni exámenes pendientes</p>
          </div>
        </div>
        <div class="assignments-header-actions">
          ${isAdmin ? `<button type="button" class="btn-add-exam" id="btn-panel-add-exam">+ Añadir examen</button>` : ''}
          <a href="kanban.html" class="btn-panel-kanban" title="Abrir mi tablero Kanban personal">
            <span>Mi Tablero</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-7.85-1.42 1.42L16.86 11H5v2z"/></svg>
          </a>
        </div>
      </header>
    `;
    panelEl.style.display = "block";
    setupPanelEventListeners(panelEl);
    return;
  }

  // Ordenación cronológica rigurosa
  const sortedItems = [...items].sort((a, b) => (a.dueTimestamp || 0) - (b.dueTimestamp || 0));

  const itemsHtml = sortedItems.map(item => {
    const isExam = item.type === 'exam';
    const subject = matchSubject(item);
    const { formattedDate, relativeBadge, isUrgent } = formatDueDate(item.dueIso || item.dueTimestamp);
    const cleanTitle = (item.title || '').replace(/^(Venciment de |Vencimiento de )/i, '').trim();

    const safeUrl = (!isExam && item.url) ? sanitizeUrl(item.url) : '';
    const linkHtml = safeUrl
      ? `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="assignment-link" aria-label="Abrir entrega en Aules">
           <span>Ver en Aules</span>
           <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7z"/></svg>
         </a>`
      : '';

    const examBadgeHtml = isExam
      ? `<span class="exam-tag">Examen</span>`
      : '';

    const notesHtml = (isExam && item.notes)
      ? `<p class="assignment-notes">${escapeHtml(item.notes)}</p>`
      : '';

    const adminActionsHtml = (isExam && isAdmin)
      ? `<div class="assignment-admin-actions">
           <button type="button" class="btn-card-action edit" data-action="edit" data-id="${item.id}" aria-label="Editar examen">Editar</button>
           <button type="button" class="btn-card-action delete" data-action="delete" data-id="${item.id}" aria-label="Eliminar examen">Eliminar</button>
         </div>`
      : '';

    return `
      <article class="assignment-card ${isExam ? 'is-exam' : ''} ${isUrgent ? 'is-urgent' : ''}" style="--c: var(${subject.colorVar})" data-id="${item.id || ''}" data-type="${isExam ? 'exam' : 'aules'}">
        <div class="assignment-header">
          <div class="assignment-badges">
            <span class="assignment-badge" style="background: color-mix(in srgb, var(${subject.colorVar}) 18%, transparent); color: var(${subject.colorVar});">
              ${subject.name}
            </span>
            ${examBadgeHtml}
          </div>
          <span class="assignment-countdown ${isUrgent ? 'urgent' : ''}">
            ${relativeBadge}
          </span>
        </div>
        <h3 class="assignment-title">${escapeHtml(cleanTitle)}</h3>
        ${notesHtml}
        <div class="assignment-footer">
          <div class="assignment-due">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20a8 8 0 100-16 8 8 0 000 16zm0-18a10 10 0 110 20 10 10 0 010-20zm.5 5v5.25l4.5 2.67-.75 1.23L11 13V7h1.5z"/></svg>
            <span>${formattedDate}</span>
          </div>
          <div class="assignment-footer-right">
            ${linkHtml}
            ${adminActionsHtml}
          </div>
        </div>
      </article>
    `;
  }).join("");

  panelEl.innerHTML = `
    <header class="assignments-header">
      <div class="assignments-title-group">
        <div class="assignments-icon-box" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
        </div>
        <div>
          <h2 class="assignments-heading">Próximas Entregas y Exámenes</h2>
          <p class="assignments-subheading">Sincronizado con Aules y calendario de exámenes</p>
        </div>
      </div>
      <div class="assignments-header-actions">
        ${isAdmin ? `<button type="button" class="btn-add-exam" id="btn-panel-add-exam">+ Añadir examen</button>` : ''}
        <a href="kanban.html" class="btn-panel-kanban" title="Gestionar entregas en formato Tablero Kanban">
          <span>Tablero</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-7.85-1.42 1.42L16.86 11H5v2z"/></svg>
        </a>
        <span class="assignments-counter">${sortedItems.length} pendiente${sortedItems.length > 1 ? 's' : ''}</span>
      </div>
    </header>
    <div class="assignments-grid">
      ${itemsHtml}
    </div>
  `;

  panelEl.style.display = "block";
  setupPanelEventListeners(panelEl);
}

/**
 * Configura los delegados de eventos para botones de administración en el panel.
 * @param {HTMLElement} panelEl
 */
function setupPanelEventListeners(panelEl) {
  if (panelListenerAttached) return;
  panelListenerAttached = true;

  panelEl.addEventListener("click", (e) => {
    const addBtn = e.target.closest("#btn-panel-add-exam");
    if (addBtn && adminActionCallbacks?.onAddExam) {
      adminActionCallbacks.onAddExam();
      return;
    }

    const actionBtn = e.target.closest(".btn-card-action");
    if (!actionBtn) return;

    const action = actionBtn.getAttribute("data-action");
    const id = actionBtn.getAttribute("data-id");

    if (action === "edit" && adminActionCallbacks?.onEditExam) {
      adminActionCallbacks.onEditExam(id);
    } else if (action === "delete" && adminActionCallbacks?.onDeleteExam) {
      adminActionCallbacks.onDeleteExam(id);
    }
  });
}

/**
 * Oculta el panel en caso de desconexión, error o ausencia de tareas.
 */
export function hideAssignmentsPanel() {
  const panelEl = document.getElementById("assignments-panel");
  if (panelEl) {
    panelEl.style.display = "none";
  }
}

