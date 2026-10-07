/**
 * @file main.js
 * @description Orquestador principal de la aplicación Horario Semanal CFGS 3D con contexto temporal inteligente.
 */

import {
  buildNormalizedEvents,
  SCHOOL_DAY_START_MINUTES
} from './data/schedule.data.js';
import {
  getNowInfo,
  getSmartInitialMobileDay,
  findCurrentEvent,
  findUpcomingEventToday,
  findNextEventInFutureCalendar,
  computeEventProgress
} from './domain/time-tracker.js';
import { initTheme } from './ui/theme.js';
import { renderTableView, renderLegend } from './ui/table-view.js';
import {
  initTimelineTabs,
  renderTimelineCards,
  updateTimelineStates,
  getSelectedMobileDay,
  setMobileDay
} from './ui/timeline-view.js';
import { initCalendarModal } from './ui/calendar-modal.js';
import { renderAssignments, hideAssignmentsPanel } from './ui/assignments-view.js';

// Modelo de datos normalizado
const eventsByDay = buildNormalizedEvents();

// Selectores frecuentes
const $ = id => document.getElementById(id);
const setCardAccent = (cardEl, colorVar) => {
  if (!cardEl) return;
  cardEl.style.setProperty("--c", colorVar ? `var(${colorVar})` : "var(--line)");
};

let lastAutoAdvancedDay = null;

/**
 * Actualiza el panel dinámico "Ahora / Siguiente" con contexto inteligente (festivos, fin de semana, fuera de jornada).
 */
function tick() {
  const nowInfo = getNowInfo();
  const { day, minutes, formattedDate, isWeekend, isAfterSchoolHours, isHoliday, holidayName, dateObj } = nowInfo;

  const todayDateEl = $("today-date");
  if (todayDateEl) {
    todayDateEl.textContent = formattedDate;
  }

  const todayList = eventsByDay[day] || [];
  const curEvent = !isHoliday ? findCurrentEvent(todayList, minutes) : null;
  const upcomingEvent = !isHoliday ? findUpcomingEventToday(todayList, minutes) : null;
  const nextFutureClass = findNextEventInFutureCalendar(eventsByDay, dateObj);

  // 1. Estado "Ahora"
  let progress = 0;

  if (isHoliday) {
    // Escenario 1: Festivo escolar oficial
    setCardAccent($("card-now"), null);
    $("now-title").textContent = "Día no lectivo";
    $("now-meta").textContent = holidayName || "Festivo escolar";
    $("now-timer").textContent = "";
  } else if (isWeekend) {
    // Escenario 2: Fin de semana (Viernes > 21:35, Sábado o Domingo)
    setCardAccent($("card-now"), null);
    $("now-title").textContent = "Fin de semana";
    if (nextFutureClass) {
      $("now-meta").textContent = `Próxima clase: ${nextFutureClass.when} a las ${nextFutureClass.event.start} [${nextFutureClass.event.name}]`;
    } else {
      $("now-meta").textContent = "Sin clases programadas para el próximo ciclo";
    }
    $("now-timer").textContent = "";
  } else if (curEvent) {
    // Escenario 3: Clase activa en este instante
    const { progressPercent, formattedRemaining } = computeEventProgress(curEvent, minutes);
    progress = progressPercent;

    $("now-title").textContent = curEvent.name;
    $("now-meta").textContent = curEvent.meta;
    $("now-timer").textContent = formattedRemaining;
    setCardAccent($("card-now"), curEvent.colorVar);
  } else {
    // Escenario 4: Entre clases, antes del inicio o fin de jornada entre semana
    setCardAccent($("card-now"), null);
    $("now-timer").textContent = "";

    if (!todayList.length) {
      $("now-title").textContent = "Hoy no hay clase";
      $("now-meta").textContent = "Día libre";
    } else if (minutes < SCHOOL_DAY_START_MINUTES) {
      $("now-title").textContent = "Todavía no ha empezado";
      $("now-meta").textContent = `Empieza hoy a las ${todayList[0].start} · ${todayList[0].name}`;
    } else if (isAfterSchoolHours) {
      $("now-title").textContent = "Jornada terminada";
      if (nextFutureClass) {
        $("now-meta").textContent = `Próxima clase: ${nextFutureClass.when} a las ${nextFutureClass.event.start} [${nextFutureClass.event.name}]`;
      } else {
        $("now-meta").textContent = "No quedan más clases hoy";
      }
    } else {
      // Recreo o hueco intermedio
      $("now-title").textContent = "Descanso / Sin clase";
      $("now-meta").textContent = upcomingEvent ? `Siguiente a las ${upcomingEvent.start}` : "";
    }
  }

  const progressBar = $("now-progress");
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  // 2. Estado "Siguiente"
  const nextTarget = upcomingEvent
    ? { event: upcomingEvent, when: "Hoy" }
    : nextFutureClass;

  if (nextTarget) {
    $("next-title").textContent = nextTarget.event.name;
    $("next-meta").textContent = `${nextTarget.when} a las ${nextTarget.event.start} · ${nextTarget.event.meta}`;
    setCardAccent($("card-next"), nextTarget.event.colorVar);
  } else {
    $("next-title").textContent = "Sin próximas clases";
    $("next-meta").textContent = "";
    setCardAccent($("card-next"), null);
  }

  // 3. Auto-salto al día siguiente si la jornada finaliza mientras la app está abierta
  if (isAfterSchoolHours && lastAutoAdvancedDay !== day) {
    const smartTargetDay = getSmartInitialMobileDay(dateObj);
    if (getSelectedMobileDay() === day) {
      lastAutoAdvancedDay = day;
      setMobileDay(smartTargetDay);
    }
  }

  // 4. Actualización granular del timeline móvil
  updateTimelineStates(getSelectedMobileDay(), day, minutes);
}

/**
 * Bucle sincronizado al segundo exacto de cambio de minuto para máxima precisión y mínimo consumo.
 */
function runLoop() {
  tick();
  const n = new Date();
  const msToNextMinute = (60 - n.getSeconds()) * 1000 - n.getMilliseconds() + 50;
  setTimeout(runLoop, msToNextMinute);
}

/**
 * Gestión del cambio de viewport eficiente con MediaQueryList (sin layout thrashing por resize).
 */
function setupViewportObserver() {
  const mediaQuery = window.matchMedia('(max-width: 767px)');

  function handleViewportChange(e) {
    const isMobile = e.matches;
    const tableWrapper = document.querySelector('.table-wrapper');
    const timelineView = document.querySelector('.timeline-view');

    if (isMobile) {
      tableWrapper?.setAttribute('aria-hidden', 'true');
      tableWrapper?.removeAttribute('tabindex');
      timelineView?.removeAttribute('aria-hidden');
    } else {
      tableWrapper?.removeAttribute('aria-hidden');
      tableWrapper?.setAttribute('tabindex', '0');
      timelineView?.setAttribute('aria-hidden', 'true');
    }
  }

  mediaQuery.addEventListener('change', handleViewportChange);
  handleViewportChange(mediaQuery);
}

/**
 * Carga asíncrona no bloqueante de las próximas entregas desde el Edge Proxy de Aules.
 */
async function loadAulesAssignments() {
  try {
    const response = await fetch('/api/aules');
    if (!response.ok) {
      hideAssignmentsPanel();
      return;
    }
    const data = await response.json();
    if (data && data.success && Array.isArray(data.assignments) && data.assignments.length > 0) {
      renderAssignments(data.assignments);
    } else {
      hideAssignmentsPanel();
    }
  } catch {
    // Si no hay conexión o el endpoint falla, ocultar panel silenciosamente
    hideAssignmentsPanel();
  }
}

/**
 * Registro tolerante y seguro del Service Worker.
 */
function setupServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.info('Service Worker registrado correctamente:', reg.scope);
        })
        .catch(err => {
          console.warn('Registro de Service Worker omitido o fallido:', err);
        });
    });
  }
}

// ───────── Inicialización de la Aplicación ─────────
document.addEventListener("DOMContentLoaded", () => {
  const nowInfo = getNowInfo();
  // Selección inteligente del día móvil de inicio (auto-salto al día siguiente o lunes)
  const initialMobileDay = getSmartInitialMobileDay(nowInfo.dateObj);

  // 1. Inicializar tema visual
  initTheme();

  // 2. Renderizar tabla semanal y leyenda interactiva
  renderTableView(eventsByDay);
  renderLegend();

  // 3. Inicializar timeline móvil, tabs WAI-ARIA y soporte Swipe táctil
  initTimelineTabs(initialMobileDay, (newSelectedDay) => {
    const info = getNowInfo();
    renderTimelineCards(newSelectedDay, eventsByDay, info.day, info.minutes, info.dateObj);
  });
  renderTimelineCards(initialMobileDay, eventsByDay, nowInfo.day, nowInfo.minutes, nowInfo.dateObj);

  // 4. Diálogo de calendario (.ics)
  initCalendarModal();

  // 5. Observador de accesibilidad de viewport
  setupViewportObserver();

  // 6. Iniciar bucle de reloj reactivo
  runLoop();

  // 7. Carga en segundo plano de entregas de Aules (no bloqueante)
  loadAulesAssignments();

  // 8. Re-sincronizar cuando la pestaña vuelve al primer plano
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      tick();
    }
  });

  // 9. Service Worker
  setupServiceWorker();
});
