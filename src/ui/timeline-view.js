/**
 * @file timeline-view.js
 * @description Vista móvil tipo timeline con soporte WAI-ARIA (Tablist), gestos táctiles (Swipe), Haptic Feedback y actualización granular del DOM.
 */

import { getHolidayInfo } from '../data/schedule.data.js';
import { toMinutes } from '../domain/time-tracker.js';

let currentSelectedDay = 1;
let registeredTabs = [];
let registeredOnDayChange = null;

/**
 * Emite una vibración háptica muy sutil si el navegador y hardware lo admiten.
 * @param {number} [duration=10]
 */
export function triggerHaptic(duration = 10) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(duration);
    } catch {
      // Ignorar si el usuario o navegador bloquean la API
    }
  }
}

/**
 * Selecciona una pestaña de día y notifica a los oyentes.
 * @param {number} day
 * @param {Array<HTMLElement>} tabs
 * @param {(day: number) => void} onDayChange
 * @param {boolean} [withHaptic=true]
 */
function selectTab(day, tabs, onDayChange, withHaptic = true) {
  if (day < 1 || day > 5) return;
  currentSelectedDay = day;

  tabs.forEach(t => {
    const isSelected = parseInt(t.dataset.day, 10) === day;
    t.classList.toggle("active", isSelected);
    t.setAttribute("aria-selected", String(isSelected));
    t.setAttribute("tabindex", isSelected ? "0" : "-1");
  });

  const timelineList = document.getElementById("timeline-list");
  if (timelineList) {
    timelineList.setAttribute("aria-labelledby", `tab-day-${day}`);
  }

  if (withHaptic) {
    triggerHaptic(10);
  }

  if (typeof onDayChange === "function") {
    onDayChange(day);
  }
}

/**
 * Permite cambiar de día programáticamente desde el orquestador principal.
 * @param {number} day
 */
export function setMobileDay(day) {
  if (registeredTabs.length > 0) {
    selectTab(day, registeredTabs, registeredOnDayChange, false);
  }
}

/**
 * Configura la detección de deslizamiento horizontal (Swipe) en dispositivos táctiles.
 * @param {Array<HTMLElement>} tabs
 * @param {(day: number) => void} onDayChange
 */
function setupSwipeGesture(tabs, onDayChange) {
  const timelineView = document.querySelector(".timeline-view");
  if (!timelineView) return;

  let startX = 0;
  let startY = 0;
  let endX = 0;
  let endY = 0;

  timelineView.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        endX = startX;
        endY = startY;
      }
    },
    { passive: true }
  );

  timelineView.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 1) {
        endX = e.touches[0].clientX;
        endY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );

  timelineView.addEventListener("touchend", () => {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Umbral de 45px con clara dominancia horizontal sobre vertical
    if (absX > 45 && absX > absY * 1.35) {
      if (deltaX < 0) {
        // Deslizar izquierda -> Día siguiente
        if (currentSelectedDay < 5) {
          selectTab(currentSelectedDay + 1, tabs, onDayChange, true);
        }
      } else {
        // Deslizar derecha -> Día anterior
        if (currentSelectedDay > 1) {
          selectTab(currentSelectedDay - 1, tabs, onDayChange, true);
        }
      }
    }
  });
}

/**
 * Inicializa las pestañas de días con el patrón accesible WAI-ARIA Tablist, teclado y gestos swipe.
 * @param {number} initialDay - Día seleccionado inicial (1..5)
 * @param {(day: number) => void} onDayChange - Callback al cambiar de día
 */
export function initTimelineTabs(initialDay, onDayChange) {
  currentSelectedDay = (initialDay >= 1 && initialDay <= 5) ? initialDay : 1;
  const tabContainer = document.getElementById("day-tabs");
  if (!tabContainer) return;

  tabContainer.setAttribute("role", "tablist");
  tabContainer.setAttribute("aria-label", "Días lectivos de la semana");

  const tabs = Array.from(tabContainer.querySelectorAll(".day-tab"));
  registeredTabs = tabs;
  registeredOnDayChange = onDayChange;

  tabs.forEach(tab => {
    const day = parseInt(tab.dataset.day, 10);
    tab.setAttribute("role", "tab");
    tab.setAttribute("id", `tab-day-${day}`);
    tab.setAttribute("aria-controls", "timeline-list");

    const isSelected = day === currentSelectedDay;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.setAttribute("tabindex", isSelected ? "0" : "-1");
    tab.classList.toggle("active", isSelected);

    tab.addEventListener("click", () => {
      selectTab(day, tabs, onDayChange, true);
    });
  });

  // Navegación accesible por teclado (Flechas, Inicio, Fin)
  tabContainer.addEventListener("keydown", (e) => {
    const currentIndex = tabs.findIndex(t => parseInt(t.dataset.day, 10) === currentSelectedDay);
    let targetIndex = -1;

    switch (e.key) {
      case "ArrowRight":
        targetIndex = (currentIndex + 1) % tabs.length;
        break;
      case "ArrowLeft":
        targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        targetIndex = 0;
        break;
      case "End":
        targetIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const targetDay = parseInt(tabs[targetIndex].dataset.day, 10);
    selectTab(targetDay, tabs, onDayChange, true);
    tabs[targetIndex].focus();
  });

  // Habilitar gestos táctiles de Swipe
  setupSwipeGesture(tabs, onDayChange);
}

/**
 * Renderiza la lista de tarjetas del timeline para un día específico.
 * Soporta estados de festivo escolar y jornada libre.
 * @param {number} day - Día de la semana (1..5)
 * @param {Record<number, Array<Object>>} eventsByDay
 * @param {number} currentDay - Día actual de la semana (0..6)
 * @param {number} currentMinutes - Minutos actuales desde las 00:00
 * @param {Date} [currentDate=new Date()]
 */
export function renderTimelineCards(day, eventsByDay, currentDay, currentMinutes, currentDate = new Date()) {
  const listEl = document.getElementById("timeline-list");
  if (!listEl) return;

  listEl.innerHTML = "";
  listEl.setAttribute("role", "tabpanel");
  listEl.setAttribute("id", "timeline-list");
  listEl.setAttribute("aria-labelledby", `tab-day-${day}`);

  // Calcular la fecha exacta del día seleccionado dentro de la semana actual
  const currentWeekDay = currentDate.getDay() === 0 ? 7 : currentDate.getDay(); // 1=Lun..7=Dom
  const diffDays = day - currentWeekDay;
  const targetDate = new Date(currentDate);
  targetDate.setDate(targetDate.getDate() + diffDays);

  const holidayInfo = getHolidayInfo(targetDate);
  const dayEvents = eventsByDay[day] || [];
  const isToday = currentDay === day;

  // 1. Caso: Festivo escolar
  if (holidayInfo.isHoliday) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "timeline-empty-card";
    emptyCard.innerHTML = `
      <span class="icon" aria-hidden="true">🎉</span>
      <div class="title">${holidayInfo.name}</div>
      <div class="desc">Día no lectivo oficial. No hay clases programadas para esta jornada.</div>
    `;
    listEl.appendChild(emptyCard);
    return;
  }

  // 2. Caso: Sin clases registradas
  if (!dayEvents.length) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "timeline-empty-card";
    emptyCard.innerHTML = `
      <span class="icon" aria-hidden="true">🏖️</span>
      <div class="title">Sin clases programadas</div>
      <div class="desc">No hay módulos lectivos programados para este día.</div>
    `;
    listEl.appendChild(emptyCard);
    return;
  }

  // 3. Renderizado normal de tarjetas de clase
  dayEvents.forEach(ev => {
    const card = document.createElement("article");
    card.className = "timeline-card";
    if (ev.mod === "recreo") card.classList.add("is-break");
    card.style.setProperty("--c", `var(${ev.colorVar})`);

    const startMin = toMinutes(ev.start);
    const endMin = toMinutes(ev.end);

    card.dataset.startMin = String(startMin);
    card.dataset.endMin = String(endMin);

    if (isToday) {
      if (currentMinutes >= endMin) {
        card.classList.add("is-past");
      } else if (currentMinutes >= startMin && currentMinutes < endMin) {
        card.classList.add("is-active");
      }
    }

    card.innerHTML = `
      <div class="timeline-card-header">
        <span class="timeline-card-time">${ev.start} – ${ev.end}</span>
        <span class="timeline-badge" aria-hidden="true">Ahora</span>
      </div>
      <div class="timeline-card-title">${ev.name}</div>
      <div class="timeline-card-meta">${ev.meta}</div>
    `;

    listEl.appendChild(card);
  });
}

/**
 * Actualiza únicamente las clases de las tarjetas existentes
 * SIN destruir el árbol DOM (optimización para ejecuciones periódicas de cada minuto).
 * @param {number} selectedDay
 * @param {number} currentDay
 * @param {number} currentMinutes
 */
export function updateTimelineStates(selectedDay, currentDay, currentMinutes) {
  const listEl = document.getElementById("timeline-list");
  if (!listEl) return;

  const isToday = currentDay === selectedDay;
  const cards = listEl.querySelectorAll(".timeline-card");

  cards.forEach(card => {
    const startMin = parseInt(card.dataset.startMin, 10);
    const endMin = parseInt(card.dataset.endMin, 10);

    let isPast = false;
    let isActive = false;

    if (isToday) {
      if (currentMinutes >= endMin) {
        isPast = true;
      } else if (currentMinutes >= startMin && currentMinutes < endMin) {
        isActive = true;
      }
    }

    card.classList.toggle("is-past", isPast);
    card.classList.toggle("is-active", isActive);
  });
}

/**
 * Devuelve el día seleccionado actualmente en la vista móvil.
 * @returns {number}
 */
export function getSelectedMobileDay() {
  return currentSelectedDay;
}
