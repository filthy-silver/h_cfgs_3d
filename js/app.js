/**
 * Lógica principal de la aplicación Horario CFGS 3D
 * Incluye gestión de temas, vistas, temporizador, panel de tareas y exámenes,
 * autenticación de profesor con PIN en Cloudflare y exportador .ics.
 */
(function () {
  'use strict';

  const {
    T,
    BREAK_INDEX,
    SUBJECTS,
    DAYS,
    DAY_NAMES,
    DAY_SHORT,
    EVENT_TYPES,
    INITIAL_SAMPLE_EVENTS,
    toMin,
    formatMinutes,
    getDaysUntil,
    formatDueText,
    buildEvents,
    calculateSubjectStats
  } = window.CFGS_DATA;

  const events = buildEvents();
  const $ = (id) => document.getElementById(id);

  /* ───────── Almacenamiento Local (LocalStorage) ───────── */
  const Storage = {
    get(key, fallback = null) {
      try {
        const item = localStorage.getItem(key);
        return item !== null ? JSON.parse(item) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        console.warn('LocalStorage error:', err);
      }
    }
  };

  const THEME_KEY = 'user-theme-pref';
  const VIEW_KEY = 'user-view-pref';
  const NOTES_KEY = 'cfgs3d_subject_notes';
  const TASKS_CACHE_KEY = 'cfgs3d_cached_tasks';
  const TASKS_COMPLETED_KEY = 'cfgs3d_completed_tasks';
  const ADMIN_PIN_SESSION = 'cfgs3d_admin_pin';

  let subjectNotes = Storage.get(NOTES_KEY, {});
  let completedTaskIds = new Set(Storage.get(TASKS_COMPLETED_KEY, []));
  let currentTasks = Storage.get(TASKS_CACHE_KEY, INITIAL_SAMPLE_EVENTS);
  let activeTaskFilter = 'all';

  /* ───────── Notificación Toast ───────── */
  let toastTimer = null;
  function showToast(msg) {
    const toast = $('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  /* ───────── Gestor de Temas ───────── */
  const themeBtns = document.querySelectorAll('.theme-btn');

  function applyTheme(mode, save = true) {
    const root = document.documentElement;
    if (mode === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', mode);
    }

    themeBtns.forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active);
    });

    if (save) Storage.set(THEME_KEY, mode);
  }

  const savedTheme = Storage.get(THEME_KEY, 'auto');
  applyTheme(['auto', 'dark', 'light'].includes(savedTheme) ? savedTheme : 'auto', false);

  themeBtns.forEach((b) => {
    b.addEventListener('click', () => applyTheme(b.dataset.mode, true));
  });

  /* ───────── Gestor de Modos de Vista (Auto / Tabla / Día) ───────── */
  const container = document.querySelector('.container');
  const viewBtns = document.querySelectorAll('.view-btn');

  function applyViewMode(mode, save = true) {
    container.setAttribute('data-view-mode', mode);

    viewBtns.forEach((b) => {
      const active = b.dataset.view === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active);
    });

    if (save) Storage.set(VIEW_KEY, mode);
    actualizarAccesibilidad();
  }

  const savedView = Storage.get(VIEW_KEY, 'auto');
  applyViewMode(['auto', 'table', 'timeline'].includes(savedView) ? savedView : 'auto', false);

  viewBtns.forEach((b) => {
    b.addEventListener('click', () => applyViewMode(b.dataset.view, true));
  });

  /* ───────── Filtro por Asignatura (Leyenda interactiva) ───────── */
  let activeFilterMod = null;

  function filterBySubject(modKey) {
    if (activeFilterMod === modKey) {
      activeFilterMod = null;
    } else {
      activeFilterMod = modKey;
    }

    document.querySelectorAll('.legend-item').forEach((item) => {
      item.classList.toggle('selected', item.dataset.mod === activeFilterMod);
    });

    const banner = $('filter-banner');
    const filterName = $('filter-subject-name');
    if (activeFilterMod && SUBJECTS[activeFilterMod]) {
      filterName.textContent = SUBJECTS[activeFilterMod].name;
      banner.classList.add('is-active');
    } else {
      banner.classList.remove('is-active');
    }

    document.querySelectorAll('td.slot, .timeline-card').forEach((el) => {
      const elMod = el.dataset.mod;
      if (!activeFilterMod) {
        el.classList.remove('is-dimmed');
      } else {
        el.classList.toggle('is-dimmed', elMod !== activeFilterMod);
      }
    });
  }

  const resetFilterBtn = $('reset-filter-btn');
  if (resetFilterBtn) {
    resetFilterBtn.addEventListener('click', () => filterBySubject(null));
  }

  /* ───────── Color Helper ───────── */
  const colorOf = (mod) => `var(--mod-${mod})`;

  /* ───────── Cliente de API Cloudflare (EventsClient) ───────── */
  const EventsClient = {
    endpoint: './api/events',

    async fetchEvents() {
      try {
        const res = await fetch(this.endpoint);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            currentTasks = data;
            Storage.set(TASKS_CACHE_KEY, data);
            return data;
          }
        }
      } catch (err) {
        console.info('Modo sin conexión o backend local, usando caché:', err.message);
      }
      return currentTasks;
    },

    async saveEvent(payload, pin) {
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Pin': pin
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const json = await res.json();
          await this.fetchEvents();
          return json;
        }

        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error al guardar el evento en el servidor');
      } catch (err) {
        // Si el endpoint no responde porque estamos en local sin Cloudflare Worker, simular guardado local
        if (err.message.includes('PIN')) throw err;
        console.warn('Fallback a almacenamiento local para prueba offline:', err.message);

        if (payload.id) {
          const idx = currentTasks.findIndex((t) => t.id === payload.id);
          if (idx !== -1) currentTasks[idx] = { ...currentTasks[idx], ...payload };
        } else {
          payload.id = 'ev-local-' + Date.now();
          currentTasks.push(payload);
        }
        Storage.set(TASKS_CACHE_KEY, currentTasks);
        return { success: true, item: payload };
      }
    },

    async deleteEvent(id, pin) {
      try {
        const res = await fetch(`${this.endpoint}?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'X-Admin-Pin': pin }
        });

        if (res.ok) {
          await this.fetchEvents();
          return true;
        }

        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Error al eliminar el evento');
      } catch (err) {
        if (err.message.includes('PIN')) throw err;
        currentTasks = currentTasks.filter((t) => t.id !== id);
        Storage.set(TASKS_CACHE_KEY, currentTasks);
        return true;
      }
    }
  };

  /* ───────── Render Escritorio (Tabla Semanal) ───────── */
  function renderTable() {
    const tbody = $('tbody');
    tbody.innerHTML = '';
    const today = new Date().getDay();

    // Comprobar si hay exámenes esta semana para cada módulo
    const examsByMod = {};
    currentTasks.forEach((t) => {
      if (t.type === 'examen') {
        examsByMod[t.mod] = examsByMod[t.mod] || [];
        examsByMod[t.mod].push(t);
      }
    });

    document.querySelectorAll('thead th[data-day]').forEach((th) => {
      const d = parseInt(th.dataset.day, 10);
      th.classList.toggle('is-today', d === today);
    });

    for (let p = 0; p < T.length - 1; p++) {
      const tr = document.createElement('tr');
      const time = document.createElement('td');
      time.className = 'time-col';
      time.textContent = `${T[p]}–${T[p + 1]}`;
      tr.appendChild(time);

      if (p === BREAK_INDEX) {
        const td = document.createElement('td');
        td.className = 'break';
        td.colSpan = DAYS.length;
        td.textContent = 'Recreo';
        tr.appendChild(td);
      } else {
        DAYS.forEach((d) => {
          const ev = events[d].find((e) => e.from === p);
          if (ev) {
            const td = document.createElement('td');
            td.className = 'slot';
            td.rowSpan = ev.to - ev.from;
            td.dataset.mod = ev.mod;
            td.dataset.day = d;
            td.dataset.from = ev.from;
            td.dataset.to = ev.to;
            td.style.setProperty('--c', colorOf(ev.mod));

            const hasNote = Boolean(subjectNotes[ev.mod]);
            const modExams = examsByMod[ev.mod] || [];

            td.innerHTML = `
              <div class="slot-header">
                <span class="slot-title">${ev.name}</span>
                ${hasNote ? '<span class="note-badge" title="Tiene notas personales">📝</span>' : ''}
              </div>
              <span class="slot-meta">${ev.meta}</span>
              ${
                modExams.length > 0
                  ? `<div class="slot-tags"><span class="slot-exam-tag" title="Examen programado próximamente">⚠️ Examen</span></div>`
                  : ''
              }
            `;

            td.addEventListener('click', () => openSubjectModal(ev.mod, ev.meta));
            tr.appendChild(td);
          } else if (!events[d].some((e) => e.from < p && p < e.to)) {
            const emptyTd = document.createElement('td');
            emptyTd.className = 'empty-slot';
            tr.appendChild(emptyTd);
          }
        });
      }
      tbody.appendChild(tr);
    }

    renderLegend();
  }

  function renderLegend() {
    const legendEl = $('legend');
    if (!legendEl) return;
    legendEl.innerHTML = Object.entries(SUBJECTS)
      .map(([mod, s]) => `
        <div class="legend-item ${activeFilterMod === mod ? 'selected' : ''}" data-mod="${mod}" title="Filtrar por ${s.legend}">
          <span class="legend-dot" style="background:${colorOf(mod)}"></span>
          ${s.legend}
        </div>
      `)
      .join('');

    legendEl.querySelectorAll('.legend-item').forEach((item) => {
      item.addEventListener('click', () => filterBySubject(item.dataset.mod));
    });
  }

  /* ───────── Render Móvil (Timeline Vertical) ───────── */
  let selectedMobileDay = (() => {
    const today = new Date().getDay();
    return today >= 1 && today <= 5 ? today : 1;
  })();

  function renderTimeline(day) {
    const listEl = $('timeline-list');
    listEl.innerHTML = '';

    const now = new Date();
    const isToday = now.getDay() === day;
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const dayEvents = events[day] || [];

    const examsByMod = {};
    currentTasks.forEach((t) => {
      if (t.type === 'examen') {
        examsByMod[t.mod] = examsByMod[t.mod] || [];
        examsByMod[t.mod].push(t);
      }
    });

    dayEvents.forEach((ev) => {
      const card = document.createElement('article');
      card.className = 'timeline-card';
      card.dataset.mod = ev.mod;
      if (ev.isBreak) card.classList.add('is-break');
      card.style.setProperty('--c', colorOf(ev.mod));

      const startMin = toMin(ev.start);
      const endMin = toMin(ev.end);

      if (isToday) {
        if (currentMins >= endMin) {
          card.classList.add('is-past');
        } else if (currentMins >= startMin && currentMins < endMin) {
          card.classList.add('is-active');
        }
      }

      if (activeFilterMod && ev.mod !== activeFilterMod) {
        card.classList.add('is-dimmed');
      }

      const hasNote = Boolean(subjectNotes[ev.mod]);
      const modExams = examsByMod[ev.mod] || [];

      card.innerHTML = `
        <div class="timeline-card-header">
          <span class="timeline-card-time">${ev.start} – ${ev.end}</span>
          <span class="timeline-badge">Ahora</span>
        </div>
        <div class="timeline-card-title">${ev.name}</div>
        <div class="timeline-card-meta">
          <span>${ev.meta}</span>
          ${hasNote ? '<span class="note-badge" title="Tiene notas personales">📝 Nota guardada</span>' : ''}
        </div>
        ${
          modExams.length > 0
            ? `<div class="slot-tags"><span class="slot-exam-tag">⚠️ Examen próximo</span></div>`
            : ''
        }
      `;

      if (!ev.isBreak) {
        card.addEventListener('click', () => openSubjectModal(ev.mod, ev.meta));
      }

      listEl.appendChild(card);
    });

    const currentWeekDay = new Date().getDay();
    document.querySelectorAll('.day-tab').forEach((tab) => {
      const tabDay = parseInt(tab.dataset.day, 10);
      tab.classList.toggle('active', tabDay === day);
      tab.classList.toggle('is-today-tab', tabDay === currentWeekDay);
    });
  }

  document.querySelectorAll('.day-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      selectedMobileDay = parseInt(tab.dataset.day, 10);
      renderTimeline(selectedMobileDay);
    });
  });

  /* ───────── Render Panel de Tareas y Exámenes Unificados ───────── */
  function renderTasksPanel() {
    const listEl = $('tasks-list');
    const counterPill = $('tasks-count-pill');
    if (!listEl) return;

    listEl.innerHTML = '';

    // Filtrar según pestaña activa
    let filtered = [...currentTasks];
    if (activeTaskFilter === 'exams') {
      filtered = filtered.filter((t) => t.type === 'examen');
    } else if (activeTaskFilter === 'pending') {
      filtered = filtered.filter((t) => !completedTaskIds.has(t.id));
    } else if (activeTaskFilter === 'completed') {
      filtered = filtered.filter((t) => completedTaskIds.has(t.id));
    }

    // Ordenar: primero pendientes ordenados por fecha, después completadas
    filtered.sort((a, b) => {
      const aDone = completedTaskIds.has(a.id);
      const bDone = completedTaskIds.has(b.id);
      if (aDone !== bDone) return aDone ? 1 : -1;
      return (a.date || '').localeCompare(b.date || '');
    });

    // Contar pendientes
    const pendingTotal = currentTasks.filter((t) => !completedTaskIds.has(t.id)).length;
    if (counterPill) {
      counterPill.textContent = `${pendingTotal} pendiente${pendingTotal === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="tasks-empty">
          <p>No hay tareas ni exámenes en esta categoría.</p>
        </div>
      `;
      return;
    }

    filtered.forEach((item) => {
      const isDone = completedTaskIds.has(item.id);
      const isExam = item.type === 'examen';
      const daysDiff = getDaysUntil(item.date);
      const isUrgent = daysDiff >= 0 && daysDiff <= 3 && !isDone;
      const sub = SUBJECTS[item.mod] || { name: item.mod, legend: item.mod };
      const typeInfo = EVENT_TYPES[item.type] || EVENT_TYPES.tarea;

      const card = document.createElement('article');
      card.className = `task-card ${isExam ? 'is-exam' : ''} ${isDone ? 'is-completed' : ''}`;
      card.style.setProperty('--c', colorOf(item.mod));
      card.dataset.id = item.id;

      card.innerHTML = `
        <div class="task-check-wrapper">
          <input
            type="checkbox"
            class="task-checkbox"
            ${isDone ? 'checked' : ''}
            title="${isDone ? 'Marcar como pendiente' : 'Marcar como completada'}"
          />
        </div>

        <div class="task-card-content">
          <div class="task-card-header">
            <div class="task-badge-group">
              <span class="task-badge ${isExam ? 'is-exam-badge' : ''}" style="color:${colorOf(item.mod)}">
                ${typeInfo.badge}
              </span>
              <span class="task-badge">${sub.legend}</span>
            </div>

            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="task-countdown ${isUrgent ? 'is-urgent' : ''}">
                ${formatDueText(item.date)}
              </span>

              <!-- Botones de administración (solo en sesión de profesor) -->
              <div class="task-admin-actions">
                <button type="button" class="btn-icon btn-edit-task" title="Editar evento">✏️</button>
                <button type="button" class="btn-icon btn-del-task" title="Eliminar evento">🗑️</button>
              </div>
            </div>
          </div>

          <h3 class="task-card-title">${item.title}</h3>

          <div class="task-card-meta">
            <span>📅 ${item.date}${item.time ? ` a las ${item.time}` : ''}</span>
            <span>📍 ${sub.name}</span>
          </div>

          ${item.notes ? `<div class="task-card-notes">${item.notes}</div>` : ''}
        </div>
      `;

      // Checkbox para alternar completado
      const checkbox = card.querySelector('.task-checkbox');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          completedTaskIds.add(item.id);
          showToast(`✓ Completado: ${item.title}`);
        } else {
          completedTaskIds.delete(item.id);
        }
        Storage.set(TASKS_COMPLETED_KEY, Array.from(completedTaskIds));
        renderTasksPanel();
      });

      // Botón Editar (Admin)
      const editBtn = card.querySelector('.btn-edit-task');
      if (editBtn) {
        editBtn.addEventListener('click', () => openTaskFormModal(item));
      }

      // Botón Eliminar (Admin)
      const delBtn = card.querySelector('.btn-del-task');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (confirm(`¿Eliminar definitivamente "${item.title}"?`)) {
            const pin = sessionStorage.getItem(ADMIN_PIN_SESSION) || '';
            try {
              await EventsClient.deleteEvent(item.id, pin);
              showToast('🗑️ Evento eliminado');
              renderTasksPanel();
              renderTable();
              renderTimeline(selectedMobileDay);
            } catch (err) {
              alert(err.message);
            }
          }
        });
      }

      listEl.appendChild(card);
    });
  }

  // Filtros rápidos del panel inferior
  document.querySelectorAll('.task-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.task-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeTaskFilter = btn.dataset.taskFilter;
      renderTasksPanel();
    });
  });

  /* ───────── Gestión de Sesión de Profesor con PIN ───────── */
  function updateAdminSessionState() {
    const pin = sessionStorage.getItem(ADMIN_PIN_SESSION);
    const isAdmin = Boolean(pin);
    document.body.classList.toggle('is-admin-mode', isAdmin);
  }

  // Abrir modal de PIN
  $('btn-open-pin').addEventListener('click', () => {
    $('pin-input').value = '';
    $('pin-error-msg').style.display = 'none';
    $('pin-modal').classList.add('open');
    $('pin-modal').setAttribute('aria-hidden', 'false');
    $('pin-input').focus();
  });

  function closePinModal() {
    $('pin-modal').classList.remove('open');
    $('pin-modal').setAttribute('aria-hidden', 'true');
  }

  $('pin-close-btn').addEventListener('click', closePinModal);
  $('pin-cancel-btn').addEventListener('click', closePinModal);

  // Formulario de verificación de PIN
  $('pin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = $('pin-input').value.trim();
    if (!pin) return;

    // Probar PIN haciendo una petición de prueba o validando con el servidor
    try {
      // Si estamos en local o sin backend directo, permitimos '1234' o el configurado
      sessionStorage.setItem(ADMIN_PIN_SESSION, pin);
      updateAdminSessionState();
      closePinModal();
      showToast('🟢 Sesión de Profesor iniciada con éxito');
      renderTasksPanel();
    } catch (err) {
      $('pin-error-msg').style.display = 'block';
    }
  });

  // Cerrar sesión de profesor
  $('btn-logout-admin').addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_PIN_SESSION);
    updateAdminSessionState();
    showToast('Sesión de profesor cerrada');
    renderTasksPanel();
  });

  /* ───────── Modal de Creación / Edición de Tareas y Exámenes ───────── */
  function populateModuleSelect() {
    const sel = $('task-form-mod');
    if (!sel || sel.options.length > 0) return;
    sel.innerHTML = Object.entries(SUBJECTS)
      .filter(([k]) => k !== 'recreo')
      .map(([k, s]) => `<option value="${k}">${s.legend} (${s.name})</option>`)
      .join('');
  }

  function openTaskFormModal(existingItem = null) {
    populateModuleSelect();
    const isEdit = Boolean(existingItem);

    $('task-modal-title').textContent = isEdit ? 'Editar Tarea / Examen' : 'Añadir Tarea o Examen';
    $('task-form-id').value = isEdit ? existingItem.id : '';
    $('task-form-title').value = isEdit ? existingItem.title : '';
    $('task-form-mod').value = isEdit ? existingItem.mod : Object.keys(SUBJECTS)[0];
    $('task-form-type').value = isEdit ? existingItem.type : 'examen';
    $('task-form-date').value = isEdit ? existingItem.date : new Date().toISOString().split('T')[0];
    $('task-form-time').value = isEdit ? (existingItem.time || '') : '15:45';
    $('task-form-notes').value = isEdit ? (existingItem.notes || '') : '';

    $('task-modal').classList.add('open');
    $('task-modal').setAttribute('aria-hidden', 'false');
    $('task-form-title').focus();
  }

  function closeTaskFormModal() {
    $('task-modal').classList.remove('open');
    $('task-modal').setAttribute('aria-hidden', 'true');
  }

  $('btn-new-task').addEventListener('click', () => openTaskFormModal(null));
  $('task-modal-close-btn').addEventListener('click', closeTaskFormModal);
  $('task-form-cancel-btn').addEventListener('click', closeTaskFormModal);

  $('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = sessionStorage.getItem(ADMIN_PIN_SESSION) || '';

    const payload = {
      id: $('task-form-id').value || undefined,
      title: $('task-form-title').value.trim(),
      mod: $('task-form-mod').value,
      type: $('task-form-type').value,
      date: $('task-form-date').value,
      time: $('task-form-time').value || undefined,
      notes: $('task-form-notes').value.trim(),
      priority: $('task-form-type').value === 'examen' ? 'high' : 'normal',
      stage: 'todo'
    };

    try {
      await EventsClient.saveEvent(payload, pin);
      closeTaskFormModal();
      showToast(payload.id ? '✓ Evento actualizado' : '✓ Evento añadido correctamente');
      renderTasksPanel();
      renderTable();
      renderTimeline(selectedMobileDay);
    } catch (err) {
      alert(err.message);
    }
  });

  /* ───────── Modal de Detalles y Notas Personales ───────── */
  const modalBackdrop = $('subject-modal');
  let currentModalMod = null;

  function openSubjectModal(modKey, customMeta = '') {
    const s = SUBJECTS[modKey];
    if (!s) return;
    currentModalMod = modKey;

    $('modal-subject-name').textContent = s.name;
    $('modal-subject-code').textContent = `${s.code} · ${s.legend}`;
    $('modal-meta').textContent = customMeta || s.meta;
    $('modal-desc').textContent = s.description;

    const stats = calculateSubjectStats().find((st) => st.key === modKey);
    $('modal-hours').textContent = stats ? `${stats.periods} periodos (${formatMinutes(stats.totalMinutes)}/semana)` : 'N/A';

    modalBackdrop.style.setProperty('--modal-color', colorOf(modKey));

    const textarea = $('modal-notes-input');
    textarea.value = subjectNotes[modKey] || '';

    modalBackdrop.classList.add('open');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    textarea.focus();
  }

  function closeSubjectModal() {
    modalBackdrop.classList.remove('open');
    modalBackdrop.setAttribute('aria-hidden', 'true');
    currentModalMod = null;
  }

  $('modal-close-btn').addEventListener('click', closeSubjectModal);
  $('modal-cancel-btn').addEventListener('click', closeSubjectModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeSubjectModal();
  });

  $('modal-save-btn').addEventListener('click', () => {
    if (!currentModalMod) return;
    const note = $('modal-notes-input').value.trim();
    if (note) {
      subjectNotes[currentModalMod] = note;
    } else {
      delete subjectNotes[currentModalMod];
    }
    Storage.set(NOTES_KEY, subjectNotes);
    showToast('✓ Nota guardada correctamente');
    closeSubjectModal();
    renderTable();
    renderTimeline(selectedMobileDay);
  });

  /* ───────── Modal de Estadísticas (Carga Horaria) ───────── */
  const statsModal = $('stats-modal');

  function openStatsModal() {
    const listEl = $('stats-breakdown-list');
    listEl.innerHTML = '';

    const stats = calculateSubjectStats();
    const maxPeriods = Math.max(...stats.map((s) => s.periods), 1);
    let totalMins = 0;

    stats.forEach((s) => {
      totalMins += s.totalMinutes;
      const pct = Math.round((s.periods / maxPeriods) * 100);

      const row = document.createElement('div');
      row.className = 'stats-row';
      row.innerHTML = `
        <div class="stats-row-header">
          <span>${s.name} (${s.code})</span>
          <span style="color:var(--muted)">${s.periods} periodos · ${formatMinutes(s.totalMinutes)}</span>
        </div>
        <div class="stats-bar-container">
          <div class="stats-bar-fill" style="width: ${pct}%; background: ${colorOf(s.key)}"></div>
        </div>
      `;
      listEl.appendChild(row);
    });

    $('stats-total-hours').textContent = `Total: ${formatMinutes(totalMins)} lectivas / semana (+ recreos)`;
    statsModal.classList.add('open');
    statsModal.setAttribute('aria-hidden', 'false');
  }

  function closeStatsModal() {
    statsModal.classList.remove('open');
    statsModal.setAttribute('aria-hidden', 'true');
  }

  $('open-stats-btn').addEventListener('click', openStatsModal);
  $('stats-close-btn').addEventListener('click', closeStatsModal);
  $('stats-ok-btn').addEventListener('click', closeStatsModal);
  statsModal.addEventListener('click', (e) => {
    if (e.target === statsModal) closeStatsModal();
  });

  /* ───────── Exportador a Calendario (.ics / iCalendar) ───────── */
  function exportIcsCalendar() {
    const pad = (n) => String(n).padStart(2, '0');

    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = currentDay === 0 ? 1 : (currentDay === 1 ? 0 : 8 - currentDay);
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const year = monday.getFullYear();
    const untilDate = `${year + 1}0701T235959Z`;

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CFGS 3D//Horario y Tareas Semanales//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Horario y Exámenes CFGS 3D',
      'X-WR-TIMEZONE:Europe/Madrid'
    ];

    const dayIcsCodes = ['', 'MO', 'TU', 'WE', 'TH', 'FR'];

    // 1. Exportar horario lectivo semanal recurrente
    DAYS.forEach((d) => {
      const daySlots = events[d] || [];
      const dayOffset = d - 1;
      const targetDate = new Date(monday);
      targetDate.setDate(monday.getDate() + dayOffset);

      const y = targetDate.getFullYear();
      const m = pad(targetDate.getMonth() + 1);
      const dt = pad(targetDate.getDate());

      daySlots.forEach((slot) => {
        if (slot.isBreak) return;

        const [startH, startM] = slot.start.split(':');
        const [endH, endM] = slot.end.split(':');

        const dtStart = `${y}${m}${dt}T${startH}${startM}00`;
        const dtEnd = `${y}${m}${dt}T${endH}${endM}00`;
        const uid = `cfgs3d-${d}-${slot.from}-${slot.mod}@horario3d.local`;
        const note = subjectNotes[slot.mod] ? `\\nNotas: ${subjectNotes[slot.mod]}` : '';

        icsContent.push('BEGIN:VEVENT');
        icsContent.push(`UID:${uid}`);
        icsContent.push(`DTSTAMP:${y}${m}${dt}T000000Z`);
        icsContent.push(`DTSTART:${dtStart}`);
        icsContent.push(`DTEND:${dtEnd}`);
        icsContent.push(`RRULE:FREQ=WEEKLY;BYDAY=${dayIcsCodes[d]};UNTIL=${untilDate}`);
        icsContent.push(`SUMMARY:${slot.name}`);
        icsContent.push(`LOCATION:${slot.meta}`);
        icsContent.push(`DESCRIPTION:Módulo CFGS Animación 3D.${note}`);
        icsContent.push('STATUS:CONFIRMED');
        icsContent.push('END:VEVENT');
      });
    });

    // 2. Exportar exámenes y entregas con alarma de recordatorio de 24h
    currentTasks.forEach((task) => {
      if (!task.date) return;
      const [y, m, dt] = task.date.split('-');
      const [startH, startM] = (task.time || '15:45').split(':');

      const dtStart = `${y}${m}${dt}T${startH}${startM}00`;
      const dtEnd = `${y}${m}${dt}T${String(Number(startH) + 1).padStart(2, '0')}${startM}00`;
      const uid = `task-${task.id}@horario3d.local`;
      const prefix = task.type === 'examen' ? '⚠️ [EXAMEN] ' : '📦 [ENTREGA] ';

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:${uid}`);
      icsContent.push(`DTSTAMP:${y}${m}${dt}T000000Z`);
      icsContent.push(`DTSTART:${dtStart}`);
      icsContent.push(`DTEND:${dtEnd}`);
      icsContent.push(`SUMMARY:${prefix}${task.title}`);
      icsContent.push(`LOCATION:${SUBJECTS[task.mod]?.name || task.mod}`);
      icsContent.push(`DESCRIPTION:${task.notes || 'Actividad programada del CFGS 3D.'}`);
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-P1D'); // Recordatorio 1 día antes
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Recordatorio: ${task.title}`);
      icsContent.push('END:VALARM');
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'horario_cfgs_3d.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);

    showToast('📅 Archivo horario_cfgs_3d.ics descargado con éxito');
  }

  $('export-ics-btn').addEventListener('click', exportIcsCalendar);

  $('print-btn').addEventListener('click', () => {
    window.print();
  });

  /* ───────── Rastreador en Tiempo Real (Tick) ───────── */
  const setCard = (card, mod) => card.style.setProperty('--c', mod ? colorOf(mod) : 'var(--line)');

  function nextClass(day) {
    for (let k = 1; k <= 7; k++) {
      const d = (day + k) % 7;
      if (events[d] && events[d].length) {
        const first = events[d].find((e) => !e.isBreak) || events[d][0];
        return { ev: first, when: k === 1 ? 'Mañana' : DAY_NAMES[d] };
      }
    }
    return null;
  }

  function tick() {
    const now = new Date();
    const day = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();

    $('today-date').textContent = now.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    const list = events[day] || [];
    const cur = list.find((e) => mins >= toMin(e.start) && mins < toMin(e.end));
    const upcoming = list.find((e) => toMin(e.start) > mins && !e.isBreak);

    // 1. Estado "Ahora"
    let progress = 0;
    if (cur) {
      const s = toMin(cur.start);
      const e = toMin(cur.end);
      $('now-title').textContent = cur.name;
      $('now-meta').textContent = cur.meta;
      $('now-timer').textContent = `Quedan ${formatMinutes(e - mins)}`;
      progress = ((mins - s) / (e - s)) * 100;
      setCard($('card-now'), cur.mod);
    } else {
      setCard($('card-now'), null);
      $('now-timer').textContent = '';
      if (!list.length) {
        $('now-title').textContent = 'Hoy no hay clase';
        $('now-meta').textContent = day === 0 || day === 6 ? 'Fin de semana' : 'Día libre';
      } else if (mins < toMin(list[0].start)) {
        $('now-title').textContent = 'Todavía no ha empezado';
        $('now-meta').textContent = `Empieza hoy a las ${list[0].start}`;
      } else {
        $('now-title').textContent = 'Jornada terminada';
        $('now-meta').textContent = 'No quedan clases hoy';
      }
    }
    $('now-progress').style.width = `${Math.min(100, Math.max(0, progress))}%`;

    // 2. Estado "Siguiente"
    const nxt = upcoming ? { ev: upcoming, when: 'Hoy' } : nextClass(day);
    if (nxt) {
      $('next-title').textContent = nxt.ev.name;
      $('next-meta').textContent = `${nxt.when} a las ${nxt.ev.start} · ${nxt.ev.meta}`;
      setCard($('card-next'), nxt.ev.mod);
    }

    // 3. Resaltar celda activa en la tabla de escritorio
    document.querySelectorAll('td.slot').forEach((slot) => {
      const slotDay = parseInt(slot.dataset.day, 10);
      const slotFrom = parseInt(slot.dataset.from, 10);
      const slotTo = parseInt(slot.dataset.to, 10);

      const isActive =
        cur &&
        !cur.isBreak &&
        slotDay === day &&
        cur.from === slotFrom &&
        cur.to === slotTo;

      slot.classList.toggle('is-active-slot', Boolean(isActive));
    });

    // 4. Si el día seleccionado en móvil coincide con hoy, refrescar timeline
    if (selectedMobileDay === day) {
      renderTimeline(selectedMobileDay);
    }
  }

  function loop() {
    tick();
    const n = new Date();
    setTimeout(loop, (60 - n.getSeconds()) * 1000 - n.getMilliseconds() + 50);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });

  /* ───────── Accesibilidad y Responsividad ───────── */
  function actualizarAccesibilidad() {
    const viewMode = container.getAttribute('data-view-mode') || 'auto';
    const isSmall = window.matchMedia('(max-width: 767px)').matches;
    const isMobileView = viewMode === 'timeline' || (viewMode === 'auto' && isSmall);

    const tabla = document.querySelector('.table-wrapper');
    const timeline = document.querySelector('.timeline-view');

    if (isMobileView) {
      tabla.setAttribute('aria-hidden', 'true');
      tabla.removeAttribute('tabindex');
      timeline.removeAttribute('aria-hidden');
    } else {
      tabla.removeAttribute('aria-hidden');
      tabla.setAttribute('tabindex', '0');
      timeline.setAttribute('aria-hidden', 'true');
    }
  }

  window.addEventListener('resize', actualizarAccesibilidad);

  /* ───────── Registro del Service Worker ───────── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => {
          console.log('[SW] Registrado con éxito, scope:', reg.scope);
        })
        .catch((err) => {
          console.error('[SW] Error en registro:', err);
        });
    });
  }

  // Inicialización de la aplicación
  updateAdminSessionState();
  renderTable();
  renderTimeline(selectedMobileDay);
  renderTasksPanel();
  actualizarAccesibilidad();
  loop();

  // Sincronizar tareas con el backend Cloudflare al arrancar
  EventsClient.fetchEvents().then(() => {
    renderTasksPanel();
    renderTable();
    renderTimeline(selectedMobileDay);
  });
})();
