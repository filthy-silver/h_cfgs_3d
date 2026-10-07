/**
 * @file assignments-view.js
 * @description Componente de interfaz para renderizar el panel de Próximas Entregas de Aules (Moodle).
 */

import { SUBJECTS } from '../data/schedule.data.js';

/**
 * Tabla de equivalencias para mapear cursos y entregas de Aules (soporte bilingüe valenciano/castellano).
 */
export const AULES_SUBJECT_PATTERNS = [
  {
    mod: "proye",
    keywords: ["realització de projectes", "realitzacio de projectes", "projectes", "realización de proyectos", "realizacion de proyectos", "proyectos", "pts 06"]
  },
  {
    mod: "dibujo",
    keywords: ["disseny, dibuix i modelatge", "dibuix", "disseny", "modelatge", "diseño, dibujo y modelado", "diseño y dibujo", "dibujo", "modelado"]
  },
  {
    mod: "anim",
    keywords: ["animació d'elements", "animació", "animacion", "animación de elementos", "elementos 2d", "animación 3d"]
  },
  {
    mod: "color",
    keywords: ["color, il·luminació i acabats", "color, il-luminacio", "il·luminació", "iluminació", "color, iluminación y acabados", "color e iluminación", "iluminación", "color", "acabados"]
  },
  {
    mod: "fol",
    keywords: ["itinerari personal", "itinerari per a l'ocupabilitat", "itinerari", "ocupabilitat", "itinerario personal", "itinerario para la empleabilidad", "fol", "empleabilidad"]
  },
  {
    mod: "inter",
    keywords: ["projecte intermodular", "proyecto intermodular", "intermodular"]
  },
  {
    mod: "ingles",
    keywords: ["anglés professional", "anglés", "angles", "inglés profesional", "ingles profesional", "inglés", "ingles", "english", "ang 02"]
  }
];

/**
 * Determina qué módulo corresponde a una entrega analizando prioritariamente su categoría (nombre del curso en Aules)
 * y posteriormente el título o descripción.
 * @param {Object} assignment
 * @returns {{ mod: string|null, colorVar: string, name: string }}
 */
export function matchSubject(assignment) {
  const categoryText = (assignment.category || '').toLowerCase();

  // 1. Prioridad: Coincidencia con la categoría del curso en Aules
  for (const item of AULES_SUBJECT_PATTERNS) {
    if (item.keywords.some(kw => categoryText.includes(kw.toLowerCase()))) {
      const subject = SUBJECTS[item.mod];
      if (subject) {
        return {
          mod: item.mod,
          colorVar: subject.colorVar,
          name: subject.legend || subject.name
        };
      }
    }
  }

  // 2. Coincidencia secundaria con el título y descripción
  const fullText = `${assignment.title || ''} ${assignment.description || ''}`.toLowerCase();
  for (const item of AULES_SUBJECT_PATTERNS) {
    if (item.keywords.some(kw => fullText.includes(kw.toLowerCase()))) {
      const subject = SUBJECTS[item.mod];
      if (subject) {
        return {
          mod: item.mod,
          colorVar: subject.colorVar,
          name: subject.legend || subject.name
        };
      }
    }
  }

  // Asignatura no identificada / Entrega general
  return {
    mod: null,
    colorVar: "--muted",
    name: "General"
  };
}

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

/**
 * Renderiza el listado de entregas en `#assignments-panel`.
 * Si el listado está vacío o no es válido, oculta el contenedor entero.
 * @param {Array<Object>} assignments
 */
export function renderAssignments(assignments) {
  const panelEl = document.getElementById("assignments-panel");
  if (!panelEl) return;

  if (!assignments || !assignments.length) {
    panelEl.style.display = "none";
    panelEl.innerHTML = "";
    return;
  }

  const itemsHtml = assignments.map(task => {
    const subject = matchSubject(task);
    const { formattedDate, relativeBadge, isUrgent } = formatDueDate(task.dueIso || task.dueTimestamp);
    const cleanTitle = (task.title || '').replace(/^(Venciment de |Vencimiento de )/i, '').trim();

    const linkHtml = task.url
      ? `<a href="${task.url}" target="_blank" rel="noopener noreferrer" class="assignment-link" aria-label="Abrir entrega en Aules">
           <span>Ver en Aules</span>
           <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7z"/></svg>
         </a>`
      : '';

    return `
      <article class="assignment-card ${isUrgent ? 'is-urgent' : ''}" style="--c: var(${subject.colorVar})">
        <div class="assignment-header">
          <span class="assignment-badge" style="background: color-mix(in srgb, var(${subject.colorVar}) 18%, transparent); color: var(${subject.colorVar});">
            ${subject.name}
          </span>
          <span class="assignment-countdown ${isUrgent ? 'urgent' : ''}">
            ${relativeBadge}
          </span>
        </div>
        <h3 class="assignment-title">${cleanTitle}</h3>
        <div class="assignment-footer">
          <div class="assignment-due">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20a8 8 0 100-16 8 8 0 000 16zm0-18a10 10 0 110 20 10 10 0 010-20zm.5 5v5.25l4.5 2.67-.75 1.23L11 13V7h1.5z"/></svg>
            <span>${formattedDate}</span>
          </div>
          ${linkHtml}
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
          <h2 class="assignments-heading">Próximas Entregas</h2>
          <p class="assignments-subheading">Sincronizado con Aules (Moodle)</p>
        </div>
      </div>
      <span class="assignments-counter">${assignments.length} pendiente${assignments.length > 1 ? 's' : ''}</span>
    </header>
    <div class="assignments-grid">
      ${itemsHtml}
    </div>
  `;

  panelEl.style.display = "block";
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
