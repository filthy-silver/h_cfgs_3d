/**
 * @file admin-modal.js
 * @description Gestor de autenticación por PIN y diálogo modal para crear, editar y eliminar exámenes.
 */

import { SUBJECTS } from '../data/schedule.data.js';

let cachedPin = sessionStorage.getItem('admin_pin') || null;
let currentExamsList = [];
let onExamsChangedCallback = null;
let onAdminStateChangedCallback = null;

/**
 * Consulta si el modo administrador está activo en la sesión actual.
 * @returns {boolean}
 */
export function isUserAdmin() {
  return Boolean(cachedPin);
}

/**
 * Obtiene el PIN actual guardado en sesión.
 * @returns {string|null}
 */
export function getAdminPin() {
  return cachedPin;
}

/**
 * Registra la lista actual de exámenes en memoria para permitir editar por ID.
 * @param {Array<Object>} exams
 */
export function setCachedExams(exams) {
  currentExamsList = Array.isArray(exams) ? exams : [];
}

/**
 * Abre un modal por ID y gestiona accesibilidad.
 * @param {string} modalId
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

/**
 * Cierra un modal por ID.
 * @param {string} modalId
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/**
 * Abre el diálogo de introducción de PIN o el panel de estado si ya está autenticado.
 */
export function openAdminLoginDialog() {
  if (isUserAdmin()) {
    openModal('admin-session-modal');
  } else {
    const errorEl = document.getElementById('admin-pin-error');
    if (errorEl) errorEl.textContent = '';
    const inputEl = document.getElementById('admin-pin-input');
    if (inputEl) {
      inputEl.value = '';
      setTimeout(() => inputEl.focus(), 50);
    }
    openModal('admin-login-modal');
  }
}

/**
 * Cierra la sesión de administrador.
 */
export function logoutAdmin() {
  cachedPin = null;
  sessionStorage.removeItem('admin_pin');
  updateAdminButtonUi();
  closeModal('admin-session-modal');
  if (onAdminStateChangedCallback) {
    onAdminStateChangedCallback(false);
  }
}

/**
 * Actualiza el indicador visual del botón de administración en la cabecera.
 */
function updateAdminButtonUi() {
  const btn = document.getElementById('btn-open-admin');
  if (!btn) return;
  if (isUserAdmin()) {
    btn.classList.add('is-active');
    btn.setAttribute('title', 'Modo Administrador activo (clic para opciones)');
  } else {
    btn.classList.remove('is-active');
    btn.setAttribute('title', 'Acceso de profesor/delegado con PIN');
  }
}

/**
 * Abre el formulario para añadir un nuevo examen o editar uno existente.
 * @param {string|null} [examId=null] ID del examen a editar o null para nuevo.
 */
export function openExamFormDialog(examId = null) {
  if (!isUserAdmin()) {
    openAdminLoginDialog();
    return;
  }

  const formModal = document.getElementById('exam-form-modal');
  if (!formModal) return;

  const idInput = document.getElementById('exam-id-input');
  const titleInput = document.getElementById('exam-title-input');
  const modSelect = document.getElementById('exam-mod-select');
  const dateInput = document.getElementById('exam-date-input');
  const timeInput = document.getElementById('exam-time-input');
  const notesInput = document.getElementById('exam-notes-input');
  const formTitle = document.getElementById('exam-form-title');
  const errorEl = document.getElementById('exam-form-error');

  if (errorEl) errorEl.textContent = '';

  // Rellenar selector de asignaturas si está vacío
  if (modSelect && modSelect.options.length <= 1) {
    modSelect.innerHTML = Object.entries(SUBJECTS)
      .filter(([key]) => key !== 'recreo')
      .map(([key, s]) => `<option value="${key}">${s.legend || s.name}</option>`)
      .join('');
  }

  if (examId) {
    // Modo Edición
    const exam = currentExamsList.find(e => e.id === examId);
    if (!exam) {
      alert('No se encontró el examen a editar.');
      return;
    }
    if (formTitle) formTitle.textContent = 'Editar Examen';
    if (idInput) idInput.value = exam.id;
    if (titleInput) titleInput.value = exam.title || '';
    if (modSelect) modSelect.value = exam.mod || 'proye';
    if (dateInput) dateInput.value = exam.date || '';
    if (timeInput) timeInput.value = exam.time || '15:45';
    if (notesInput) notesInput.value = exam.notes || '';
  } else {
    // Modo Nuevo Examen
    if (formTitle) formTitle.textContent = 'Publicar Nuevo Examen';
    if (idInput) idInput.value = '';
    if (titleInput) titleInput.value = '';
    if (modSelect) modSelect.value = 'proye';
    
    // Sugerir fecha de mañana por defecto
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    if (dateInput) dateInput.value = `${yyyy}-${mm}-${dd}`;
    if (timeInput) timeInput.value = '15:45';
    if (notesInput) notesInput.value = '';
  }

  openModal('exam-form-modal');
  setTimeout(() => titleInput?.focus(), 50);
}

/**
 * Solicita confirmación y elimina un examen llamando a la API.
 * @param {string} examId
 */
export async function deleteExam(examId) {
  if (!isUserAdmin()) {
    openAdminLoginDialog();
    return;
  }

  const exam = currentExamsList.find(e => e.id === examId);
  const examName = exam ? `"${exam.title}"` : 'este examen';

  if (!window.confirm(`¿Estás seguro de que deseas eliminar ${examName}?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/events?id=${encodeURIComponent(examId)}`, {
      method: 'DELETE',
      headers: {
        'X-Admin-Pin': cachedPin
      }
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'No se pudo eliminar el examen');
    }

    if (onExamsChangedCallback) {
      await onExamsChangedCallback();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

/**
 * Inicializa los eventos del módulo de administración y modales.
 * @param {Object} options
 * @param {Function} options.onExamsChanged Callback asíncrono para recargar exámenes tras crear/editar/eliminar.
 * @param {Function} options.onAdminStateChanged Callback invocado al entrar o salir del modo admin.
 */
export function initAdminManager({ onExamsChanged, onAdminStateChanged }) {
  onExamsChangedCallback = onExamsChanged;
  onAdminStateChangedCallback = onAdminStateChanged;

  updateAdminButtonUi();

  // 1. Botón de acceso en la barra superior
  const openAdminBtn = document.getElementById('btn-open-admin');
  if (openAdminBtn) {
    openAdminBtn.addEventListener('click', () => {
      openAdminLoginDialog();
    });
  }

  // 2. Formulario de introducción de PIN
  const pinForm = document.getElementById('admin-pin-form');
  if (pinForm) {
    pinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputEl = document.getElementById('admin-pin-input');
      const errorEl = document.getElementById('admin-pin-error');
      const submitBtn = pinForm.querySelector('button[type="submit"]');
      const enteredPin = inputEl?.value?.trim() || '';

      if (!enteredPin) return;

      if (errorEl) errorEl.textContent = '';
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Pin': enteredPin
          },
          body: JSON.stringify({ action: 'verify' })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'PIN incorrecto');
        }

        // Autenticación correcta
        cachedPin = enteredPin;
        sessionStorage.setItem('admin_pin', enteredPin);
        updateAdminButtonUi();
        closeModal('admin-login-modal');

        if (onAdminStateChangedCallback) {
          onAdminStateChangedCallback(true);
        }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || 'Error al validar el PIN';
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // 3. Modal de sesión activa (Cerrar sesión / Nuevo examen)
  const btnLogout = document.getElementById('btn-admin-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      logoutAdmin();
    });
  }

  const btnSessionAdd = document.getElementById('btn-session-add-exam');
  if (btnSessionAdd) {
    btnSessionAdd.addEventListener('click', () => {
      closeModal('admin-session-modal');
      openExamFormDialog();
    });
  }

  // 4. Formulario de creación / edición de examen
  const examForm = document.getElementById('exam-crud-form');
  if (examForm) {
    examForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('exam-form-error');
      const submitBtn = examForm.querySelector('button[type="submit"]');

      const id = document.getElementById('exam-id-input')?.value || null;
      const title = document.getElementById('exam-title-input')?.value?.trim();
      const mod = document.getElementById('exam-mod-select')?.value;
      const date = document.getElementById('exam-date-input')?.value;
      const time = document.getElementById('exam-time-input')?.value || '15:45';
      const notes = document.getElementById('exam-notes-input')?.value?.trim() || '';

      if (!title || !mod || !date) {
        if (errorEl) errorEl.textContent = 'Por favor completa título, asignatura y fecha.';
        return;
      }

      if (errorEl) errorEl.textContent = '';
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = { id, title, mod, date, time, notes };
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Pin': cachedPin
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Error al guardar el examen');
        }

        closeModal('exam-form-modal');

        if (onExamsChangedCallback) {
          await onExamsChangedCallback();
        }
      } catch (err) {
        if (errorEl) {
          errorEl.textContent = err.message || 'Error al guardar';
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // 5. Botones de cerrar en todos los modales con data-close-modal
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-close-modal');
      if (targetId) closeModal(targetId);
    });
  });

  // Cerrar al hacer clic en el backdrop exterior
  ['admin-login-modal', 'admin-session-modal', 'exam-form-modal'].forEach(modalId => {
    const el = document.getElementById(modalId);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) closeModal(modalId);
      });
    }
  });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('admin-login-modal');
      closeModal('admin-session-modal');
      closeModal('exam-form-modal');
    }
  });
}
