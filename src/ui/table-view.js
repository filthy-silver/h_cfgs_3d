/**
 * @file table-view.js
 * @description Renderizado accesible de la tabla semanal para escritorio y leyenda interactiva con enfoque visual.
 */

import {
  TIME_BOUNDARIES,
  BREAK_SLOT_INDEX,
  DAYS_CONFIG,
  SUBJECTS
} from '../data/schedule.data.js';

let activePinnedMod = null;

/**
 * Renderiza el cuerpo de la tabla semanal en `#tbody`.
 * @param {Record<number, Array<Object>>} eventsByDay
 */
export function renderTableView(eventsByDay) {
  const tbody = document.getElementById("tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const totalSlots = TIME_BOUNDARIES.length - 1;

  for (let p = 0; p < totalSlots; p++) {
    const tr = document.createElement("tr");

    // Columna horaria fija
    const timeTd = document.createElement("td");
    timeTd.className = "time-col";
    timeTd.setAttribute("scope", "row");
    timeTd.textContent = `${TIME_BOUNDARIES[p]}–${TIME_BOUNDARIES[p + 1]}`;
    tr.appendChild(timeTd);

    if (p === BREAK_SLOT_INDEX) {
      // Fila especial de recreo
      const breakTd = document.createElement("td");
      breakTd.className = "break";
      breakTd.colSpan = DAYS_CONFIG.length;
      breakTd.textContent = "Recreo";
      tr.appendChild(breakTd);
    } else {
      // Celdas por día
      DAYS_CONFIG.forEach(({ id: dayId }) => {
        const dayEvents = eventsByDay[dayId] || [];
        const ev = dayEvents.find(e => e.from === p);

        if (ev) {
          const slotTd = document.createElement("td");
          slotTd.className = "slot";
          slotTd.dataset.mod = ev.mod;
          slotTd.rowSpan = ev.to - ev.from;
          slotTd.style.setProperty("--c", `var(${ev.colorVar})`);

          const titleSpan = document.createElement("span");
          titleSpan.className = "slot-title";
          titleSpan.textContent = ev.name;

          const metaSpan = document.createElement("span");
          metaSpan.className = "slot-meta";
          metaSpan.textContent = ev.meta;

          slotTd.append(titleSpan, metaSpan);
          tr.appendChild(slotTd);
        } else if (!dayEvents.some(e => e.from < p && p < e.to)) {
          // Espacio vacío si no está ocupado por un bloque superior con rowSpan
          const emptyTd = document.createElement("td");
          emptyTd.className = "empty-slot";
          emptyTd.setAttribute("aria-hidden", "true");
          tr.appendChild(emptyTd);
        }
      });
    }

    tbody.appendChild(tr);
  }
}

/**
 * Resalta en la tabla los bloques pertenecientes a un módulo y atenúa los demás.
 * @param {string} modId
 */
export function highlightModule(modId) {
  const table = document.querySelector("table");
  if (!table) return;

  table.classList.add("has-focus");

  const slots = table.querySelectorAll("td.slot");
  slots.forEach(td => {
    const isTarget = td.dataset.mod === modId;
    td.classList.toggle("is-focused", isTarget);
  });

  const legendItems = document.querySelectorAll(".legend-item");
  legendItems.forEach(item => {
    const isTarget = item.dataset.mod === modId;
    item.classList.toggle("is-selected", isTarget);
    item.setAttribute("aria-pressed", String(isTarget));
  });

  const clearBtn = document.getElementById("legend-clear-btn");
  if (clearBtn) {
    clearBtn.classList.add("is-visible");
  }
}

/**
 * Restaura la opacidad de todos los bloques en la tabla semanal.
 */
export function clearHighlight() {
  const table = document.querySelector("table");
  if (!table) return;

  table.classList.remove("has-focus");

  const slots = table.querySelectorAll("td.slot");
  slots.forEach(td => td.classList.remove("is-focused"));

  const legendItems = document.querySelectorAll(".legend-item");
  legendItems.forEach(item => {
    item.classList.remove("is-selected");
    item.setAttribute("aria-pressed", "false");
  });

  const clearBtn = document.getElementById("legend-clear-btn");
  if (clearBtn) {
    clearBtn.classList.remove("is-visible");
  }

  activePinnedMod = null;
}

/**
 * Renderiza la barra de leyenda de asignaturas en `#legend` e inicializa sus interacciones.
 */
export function renderLegend() {
  const legendContainer = document.getElementById("legend");
  if (!legendContainer) return;

  const validSubjects = Object.values(SUBJECTS).filter(s => s.id !== "recreo");

  const itemsHtml = validSubjects
    .map(
      s => `
      <div class="legend-item" role="button" tabindex="0" data-mod="${s.id}" aria-pressed="false" aria-label="Resaltar ${s.legend}">
        <span class="legend-dot" style="background: var(${s.colorVar})"></span>
        <span>${s.legend}</span>
      </div>`
    )
    .join("");

  legendContainer.innerHTML = `
    ${itemsHtml}
    <button type="button" class="legend-clear-btn" id="legend-clear-btn" aria-label="Restaurar vista completa">Restaurar vista</button>
  `;

  // Asignar eventos de hover y clic/anclado
  const items = legendContainer.querySelectorAll(".legend-item");
  items.forEach(item => {
    const mod = item.dataset.mod;

    // Hover (sólo si no hay selección fija anclada)
    item.addEventListener("mouseenter", () => {
      if (!activePinnedMod) {
        highlightModule(mod);
      }
    });

    item.addEventListener("mouseleave", () => {
      if (!activePinnedMod) {
        clearHighlight();
      }
    });

    // Clic para anclar/desanclar
    const handleToggle = () => {
      if (activePinnedMod === mod) {
        clearHighlight();
      } else {
        activePinnedMod = mod;
        highlightModule(mod);
      }
    };

    item.addEventListener("click", handleToggle);

    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    });
  });

  const clearBtn = document.getElementById("legend-clear-btn");
  clearBtn?.addEventListener("click", () => {
    clearHighlight();
  });

  // Clic fuera para limpiar enfoque persistente
  document.addEventListener("click", (e) => {
    if (activePinnedMod && !legendContainer.contains(e.target) && !document.querySelector("table")?.contains(e.target)) {
      clearHighlight();
    }
  });
}
