/**
 * @file kanban-cards.js
 * @description Generador y formateador de tarjetas para el tablero Kanban
 * (Aules Moodle, Exámenes oficiales y Tareas personales).
 */

import { SUBJECTS } from '../data/schedule.data.js';
import { matchSubject } from '../domain/subject-matcher.js';
import { escapeHtml, sanitizeUrl } from '../domain/sanitizer.js';

export { escapeHtml };

/**
 * Formatea fechas límite con cálculo de urgencia relativa.
 * @param {string|number} dueIsoOrTimestamp
 * @returns {{ formattedDate: string, relativeBadge: string, isUrgent: boolean, isPast: boolean }}
 */
export function formatCardDueDate(dueIsoOrTimestamp) {
  if (!dueIsoOrTimestamp) {
    return {
      formattedDate: '',
      relativeBadge: '',
      isUrgent: false,
      isPast: false
    };
  }

  const dueDate = new Date(dueIsoOrTimestamp);
  if (isNaN(dueDate.getTime())) {
    return {
      formattedDate: '',
      relativeBadge: '',
      isUrgent: false,
      isPast: false
    };
  }

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

  let relativeBadge = `En ${diffDays}d`;
  let isUrgent = false;
  let isPast = false;

  if (diffMs < 0) {
    relativeBadge = "Vencida";
    isPast = true;
  } else if (diffHours <= 12) {
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
    relativeBadge,
    isUrgent,
    isPast
  };
}

/**
 * Obtiene la información de módulo y color para cualquier tipo de ítem.
 * @param {Object} item
 * @returns {{ mod: string|null, colorVar: string, name: string }}
 */
export function resolveCardSubject(item) {
  if (item.type === 'personal') {
    if (item.mod && SUBJECTS[item.mod]) {
      const subject = SUBJECTS[item.mod];
      return {
        mod: item.mod,
        colorVar: subject.colorVar,
        name: subject.legend || subject.name
      };
    }
    return {
      mod: null,
      colorVar: '--accent',
      name: 'Personal'
    };
  }

  // Delegar al reconocedor heurístico del proyecto
  return matchSubject(item);
}

/**
 * Renderiza el HTML de una tarjeta para el tablero Kanban.
 * @param {Object} item
 * @param {'pending'|'in-progress'|'done'} currentColumn
 * @returns {string}
 */
export function renderCardHtml(item, currentColumn) {
  const isExam = item.type === 'exam';
  const isPersonal = item.type === 'personal';
  const isAules = item.type === 'aules';

  const subject = resolveCardSubject(item);
  const { formattedDate, relativeBadge, isUrgent, isPast } = formatCardDueDate(item.dueIso || item.dueTimestamp);

  const cleanTitle = (item.title || '')
    .replace(/^(Venciment de |Vencimiento de )/i, '')
    .trim();

  // Clases condicionales
  const cardClasses = [
    'kanban-card',
    isExam ? 'is-exam' : '',
    isPersonal ? 'is-personal' : '',
    isAules ? 'is-aules' : '',
    isUrgent ? 'is-urgent' : '',
    isPast ? 'is-past' : ''
  ].filter(Boolean).join(' ');

  // Distintivo de tipo
  let typeBadgeHtml = '';
  if (isExam) {
    typeBadgeHtml = `<span class="badge badge-exam">📝 Examen</span>`;
  } else if (isPersonal) {
    typeBadgeHtml = `<span class="badge badge-personal">👤 Personal</span>`;
  } else if (isAules) {
    typeBadgeHtml = `<span class="badge badge-aules">📚 Aules</span>`;
    if (item.aiSummary?.source === 'ai') {
      typeBadgeHtml += `<span class="badge badge-ai-chip" title="Resumen enriquecido con Cloudflare Workers AI">⚡ IA</span>`;
    }
  }

  // Badge de urgencia
  const urgencyBadgeHtml = relativeBadge
    ? `<span class="badge badge-urgency ${isUrgent ? 'urgent' : ''} ${isPast ? 'past' : ''}">${relativeBadge}</span>`
    : '';

  // Enlace externo (Aules)
  const safeAulesUrl = (isAules && item.url) ? sanitizeUrl(item.url) : '';
  const aulesLinkHtml = safeAulesUrl
    ? `<a href="${safeAulesUrl}" target="_blank" rel="noopener noreferrer" class="card-link" draggable="false" data-action="open-aules-link" title="Abrir entrega directamente en Moodle Aules">
        <span>Aules ↗</span>
      </a>`
    : '';

  // Contenido del cuerpo de la tarjeta: Resumen de 1 frase + entregables para Aules
  let cardBodyHtml = '';
  if (isAules) {
    const summaryShort = item.aiSummary?.short || (item.description ? item.description.slice(0, 110) + '…' : '');
    const deliverables = Array.isArray(item.aiSummary?.deliverables) ? item.aiSummary.deliverables : [];
    const deliverablesHtml = deliverables.length > 0
      ? `<div class="card-deliverables" aria-label="Archivos requeridos">
          ${deliverables.map(ext => `<span class="deliverable-tag">${escapeHtml(ext)}</span>`).join('')}
         </div>`
      : '';

    cardBodyHtml = `
      ${summaryShort ? `<p class="card-summary-short" title="Clic para ver detalle y requisitos">${escapeHtml(summaryShort)}</p>` : ''}
      ${deliverablesHtml}
      <div class="card-detail-hint">
        <span>Ver detalle</span>
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
      </div>
    `;
  } else {
    const notesText = item.notes || item.description || '';
    cardBodyHtml = notesText
      ? `<p class="card-notes">${escapeHtml(notesText)}</p>`
      : '';
  }

  // Botones de acción para tarjetas personales (editar / eliminar)
  const personalActionsHtml = isPersonal
    ? `<div class="card-actions-row">
        <button type="button" class="btn-card-icon btn-edit-task" data-action="edit" data-id="${item.id}" draggable="false" title="Editar tarea personal" aria-label="Editar tarea">
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button type="button" class="btn-card-icon btn-delete-task" data-action="delete" data-id="${item.id}" draggable="false" title="Eliminar tarea personal" aria-label="Eliminar tarea">
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>`
    : '';

  // Selector rápido para mover entre columnas (Accesibilidad móvil & teclado)
  const columnSelectorHtml = `
    <div class="card-move-control" aria-label="Mover tarjeta a otra columna" draggable="false">
      <label class="sr-only" for="move-select-${item.id}">Mover estado</label>
      <select id="move-select-${item.id}" class="card-move-select" data-move-id="${item.id}" draggable="false">
        <option value="pending" ${currentColumn === 'pending' ? 'selected' : ''}>⏳ Pendiente</option>
        <option value="in-progress" ${currentColumn === 'in-progress' ? 'selected' : ''}>⚡ Trabajando</option>
        <option value="done" ${currentColumn === 'done' ? 'selected' : ''}>✅ Hecho</option>
      </select>
    </div>
  `;

  const cardAriaTitle = isAules
    ? 'Haz clic para ver el resumen detallado y requisitos'
    : (isExam ? 'Haz clic para ver los detalles del examen' : 'Haz clic para editar esta tarea');

  return `
    <article
      class="${cardClasses}"
      style="--c: var(${subject.colorVar})"
      draggable="true"
      id="card-${item.id}"
      data-id="${item.id}"
      data-type="${item.type}"
      data-column="${currentColumn}"
      role="button"
      aria-haspopup="dialog"
      title="${cardAriaTitle}"
      tabindex="0"
    >
      <div class="card-top-bar">
        <div class="card-badges">
          <span class="badge badge-subject" style="border-color: var(${subject.colorVar}); color: var(${subject.colorVar})">
            ${escapeHtml(subject.name)}
          </span>
          ${typeBadgeHtml}
        </div>
        <div class="card-top-right">
          ${personalActionsHtml}
          <div class="card-drag-handle" title="Arrastrar tarjeta para cambiar de columna" aria-label="Arrastrar tarjeta" draggable="false">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path fill="currentColor" d="M9 5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9-14a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 7a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
            </svg>
          </div>
        </div>
      </div>

      <h3 class="card-title">${escapeHtml(cleanTitle)}</h3>

      ${cardBodyHtml}

      <div class="card-footer">
        <div class="card-due-info">
          ${formattedDate ? `
            <span class="due-date-text">
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                <path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z"/>
              </svg>
              ${formattedDate}
            </span>
          ` : ''}
          ${urgencyBadgeHtml}
        </div>

        <div class="card-footer-actions">
          ${aulesLinkHtml}
          ${columnSelectorHtml}
        </div>
      </div>
    </article>
  `;
}
