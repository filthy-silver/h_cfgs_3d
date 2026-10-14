/**
 * @file kanban-sync.js
 * @description Gestión de la vinculación y sincronización (Pairing Handshake)
 * entre dispositivos (PC Torre ↔ Móvil ↔ Portátil) mediante Enlace Directo Instantáneo
 * (Zero-Knowledge) o PIN temporal de 5 minutos en la nube.
 */

import {
  exportAllKanbanData,
  importAllKanbanData,
  encodeSyncPayload,
  decodeSyncPayload
} from './kanban-store.js';

let activePin = null;
let currentDirectLink = '';
let countdownInterval = null;
let pollInterval = null;
let remainingSeconds = 300;
let onSyncSuccessCallback = null;
let pendingIncomingData = null;

/**
 * Cambia a la pestaña de compartir tablero (genera código y enlace directo).
 */
export function switchToShareTab() {
  const tabShare = document.getElementById('tab-sync-share');
  const tabClaim = document.getElementById('tab-sync-claim');
  const viewShare = document.getElementById('view-sync-share');
  const viewClaim = document.getElementById('view-sync-claim');

  tabShare?.classList.add('active');
  tabClaim?.classList.remove('active');
  viewShare?.classList.remove('is-hidden');
  viewClaim?.classList.add('is-hidden');
  if (!activePin) {
    requestNewPin();
  }
}

/**
 * Cambia a la pestaña de canjear código o enlace en este dispositivo.
 */
export function switchToClaimTab() {
  const tabShare = document.getElementById('tab-sync-share');
  const tabClaim = document.getElementById('tab-sync-claim');
  const viewShare = document.getElementById('view-sync-share');
  const viewClaim = document.getElementById('view-sync-claim');
  const inputPin = document.getElementById('input-claim-pin');

  tabClaim?.classList.add('active');
  tabShare?.classList.remove('active');
  viewClaim?.classList.remove('is-hidden');
  viewShare?.classList.add('is-hidden');
  stopSharingTimers();
  setTimeout(() => inputPin?.focus(), 80);
}

/**
 * Abre el diálogo de sincronización y genera PIN / enlace si está en la pestaña compartir.
 */
export function openSyncModal() {
  const modal = document.getElementById('sync-modal');
  if (!modal) return;

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  const tabShare = document.getElementById('tab-sync-share');
  if (tabShare?.classList.contains('active')) {
    requestNewPin();
  }
}

/**
 * Cierra el diálogo y limpia temporizadores y sondeos activos.
 */
export function closeSyncModal() {
  const modal = document.getElementById('sync-modal');
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  stopSharingTimers();
  resetShareView();
}

/**
 * Abre el diálogo de confirmación cuando se recibe un tablero mediante enlace directo (#sync=...).
 * @param {Object} data
 */
export function openIncomingSyncModal(data) {
  pendingIncomingData = data;
  const modal = document.getElementById('incoming-sync-modal');
  const statsEl = document.getElementById('incoming-sync-stats');
  if (!modal) return;

  const tasksCount = Array.isArray(data.personalTasks) ? data.personalTasks.length : 0;
  const notesCount = Array.isArray(data.stickyNotes) ? data.stickyNotes.length : 0;
  const colsCount = data.columns && typeof data.columns === 'object' ? Object.keys(data.columns).length : 0;

  if (statsEl) {
    statsEl.innerHTML = `
      <strong>📦 Resumen del tablero recibido:</strong><br>
      • <strong>${tasksCount}</strong> tareas personales<br>
      • <strong>${notesCount}</strong> notas y recordatorios<br>
      • <strong>${colsCount}</strong> posiciones de columnas configuradas
    `;
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

/**
 * Cierra el modal de sincronización entrante y limpia la URL hash.
 */
export function closeIncomingSyncModal() {
  const modal = document.getElementById('incoming-sync-modal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
  pendingIncomingData = null;
  // Limpiar el hash de la URL sin recargar la página
  if (window.location.hash.includes('sync=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

// Exponer en window para llamadas de respaldo directas desde HTML / inline onclick
if (typeof window !== 'undefined') {
  window.__openSyncModal = openSyncModal;
  window.__closeSyncModal = closeSyncModal;
}

/**
 * Inicializa el gestor de sincronización de Kanban.
 * @param {Object} options
 * @param {Function} options.onDataRestored Callback al recibir datos para repintar el tablero
 */
export function initKanbanSync({ onDataRestored } = {}) {
  onSyncSuccessCallback = onDataRestored;

  const modal = document.getElementById('sync-modal');
  const formClaim = document.getElementById('form-sync-claim');
  const inputPin = document.getElementById('input-claim-pin');
  const btnRegen = document.getElementById('btn-regen-pin');
  const btnConfirmIncoming = document.getElementById('btn-confirm-incoming-sync');

  // Pre-calcular el enlace directo instantáneo para copia rápida
  try {
    const initialPayload = exportAllKanbanData();
    const initialToken = encodeSyncPayload(initialPayload);
    currentDirectLink = `${window.location.origin}${window.location.pathname}#sync=${initialToken}`;
  } catch (err) {
    console.warn('[KanbanSync] Error al preparar enlace inicial:', err);
  }

  // Delegación global en document para garantizar compatibilidad táctil / móvil
  document.addEventListener('click', (e) => {
    // Abrir modal de sincronización
    if (e.target.closest('#btn-open-sync')) {
      e.preventDefault();
      openSyncModal();
      return;
    }

    // Copiar enlace directo instantáneo
    if (e.target.closest('#btn-copy-sync-link')) {
      e.preventDefault();
      copyDirectSyncLink();
      return;
    }

    // Cerrar modal con botón de cierre
    if (e.target.closest('[data-close-sync-modal]')) {
      e.preventDefault();
      closeSyncModal();
      return;
    }

    // Cerrar modal de sincronización entrante
    if (e.target.closest('[data-close-incoming-sync]')) {
      e.preventDefault();
      closeIncomingSyncModal();
      return;
    }

    // Pestaña compartir
    if (e.target.closest('#tab-sync-share')) {
      e.preventDefault();
      switchToShareTab();
      return;
    }

    // Pestaña canjear
    if (e.target.closest('#tab-sync-claim')) {
      e.preventDefault();
      switchToClaimTab();
      return;
    }

    // Clic en el fondo del modal (backdrop)
    if (e.target === modal) {
      closeSyncModal();
    }
  });

  // Cerrar al pulsar Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modal?.classList.contains('is-open')) closeSyncModal();
      const incomingModal = document.getElementById('incoming-sync-modal');
      if (incomingModal?.classList.contains('is-open')) closeIncomingSyncModal();
    }
  });

  // Regenerar PIN si caducó
  btnRegen?.addEventListener('click', () => {
    requestNewPin();
  });

  // Confirmar importación de tablero entrante por enlace directo (#sync=...)
  btnConfirmIncoming?.addEventListener('click', () => {
    if (pendingIncomingData) {
      importAllKanbanData(pendingIncomingData);
      if (typeof onSyncSuccessCallback === 'function') {
        onSyncSuccessCallback();
      }
      closeIncomingSyncModal();
    }
  });

  // Envío del formulario de canje (soporta PIN de 6 dígitos o enlace directo pegado)
  formClaim?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawVal = (inputPin?.value || '').trim();
    if (!rawVal) return;

    await claimPin(rawVal);
  });

  // Comprobar si se abrió la página mediante un enlace de sincronización entrante (#sync=...)
  checkForIncomingSyncUrl();
}

/**
 * Comprueba si la URL actual contiene un hash #sync=... para invocar el asistente de importación.
 */
function checkForIncomingSyncUrl() {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash;
  if (hash && hash.includes('sync=')) {
    const data = decodeSyncPayload(hash);
    if (data) {
      // Pequeño retardo para asegurar que el DOM inicial y estilos estén cargados
      setTimeout(() => {
        openIncomingSyncModal(data);
      }, 150);
    }
  }
}

/**
 * Copia el enlace directo al portapapeles con confirmación visual.
 */
async function copyDirectSyncLink() {
  const feedbackEl = document.getElementById('copy-sync-feedback');

  if (!currentDirectLink) {
    const payload = exportAllKanbanData();
    const token = encodeSyncPayload(payload);
    currentDirectLink = `${window.location.origin}${window.location.pathname}#sync=${token}`;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(currentDirectLink);
    } else {
      // Fallback para navegadores antiguos o contextos no seguros
      const tempInput = document.createElement('textarea');
      tempInput.value = currentDirectLink;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }

    if (feedbackEl) {
      feedbackEl.classList.remove('is-hidden');
      setTimeout(() => {
        feedbackEl.classList.add('is-hidden');
      }, 3500);
    }
  } catch (err) {
    // Si falla el acceso al portapapeles, mostrar un prompt para copia manual
    window.prompt('Copia este enlace de sincronización para tu otro dispositivo:', currentDirectLink);
  }
}

/**
 * Detiene los temporizadores de cuenta atrás y de sondeo.
 */
function stopSharingTimers() {
  if (countdownInterval) clearInterval(countdownInterval);
  if (pollInterval) clearInterval(pollInterval);
  countdownInterval = null;
  pollInterval = null;
  activePin = null;
}

/**
 * Solicita al servidor un nuevo código PIN temporal (5 min) y genera el enlace directo.
 */
async function requestNewPin() {
  stopSharingTimers();
  resetShareView();

  const codeBox = document.getElementById('sync-code-display');
  const timerText = document.getElementById('sync-timer-text');
  const progressBar = document.getElementById('sync-timer-progress');
  const statusBox = document.getElementById('sync-status-msg');
  const expiredBox = document.getElementById('sync-expired-msg');

  if (codeBox) codeBox.textContent = '··· ···';
  if (statusBox) statusBox.textContent = 'Generando opciones de sincronización…';
  if (expiredBox) expiredBox.classList.add('is-hidden');
  if (codeBox) codeBox.classList.remove('is-expired');

  // 1. Generar enlace directo instantáneo (100% Zero-Knowledge y local)
  const payload = exportAllKanbanData();
  const token = encodeSyncPayload(payload);
  currentDirectLink = `${window.location.origin}${window.location.pathname}#sync=${token}`;

  // 2. Intentar registrar PIN temporal en Cloudflare API
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', data: payload })
    });

    if (!res.ok) throw new Error('Error al registrar PIN en servidor');
    const result = await res.json();

    if (result.success && result.pin) {
      activePin = result.pin;
      remainingSeconds = result.expiresIn || 300;

      // Formatear: "123 · 456"
      if (codeBox) {
        codeBox.textContent = `${activePin.slice(0, 3)} · ${activePin.slice(3)}`;
      }
      if (statusBox) {
        statusBox.innerHTML = `
          <span class="spinner-dot" aria-hidden="true"></span>
          Esperando a que introduzcas el PIN en tu otro dispositivo…
        `;
      }

      startCountdown(remainingSeconds);
      startStatusPolling(activePin);
    }
  } catch (err) {
    console.warn('[KanbanSync] Servidor de PIN no disponible, usando modo enlace directo:', err);
    if (codeBox) codeBox.textContent = 'OFFLINE';
    if (statusBox) {
      statusBox.textContent = 'Usa el botón "Copiar enlace de sincronización" para transferir tu tablero sin necesidad de servidor.';
    }
  }
}

/**
 * Inicia la cuenta atrás regresiva visual.
 * @param {number} totalSeconds
 */
function startCountdown(totalSeconds) {
  const timerText = document.getElementById('sync-timer-text');
  const progressBar = document.getElementById('sync-timer-progress');
  const expiredBox = document.getElementById('sync-expired-msg');
  const codeBox = document.getElementById('sync-code-display');
  const statusBox = document.getElementById('sync-status-msg');

  const updateUI = () => {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    if (timerText) {
      timerText.textContent = `Caduca en ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    if (progressBar) {
      const pct = Math.max(0, (remainingSeconds / totalSeconds) * 100);
      progressBar.style.width = `${pct}%`;
    }

    if (remainingSeconds <= 0) {
      stopSharingTimers();
      if (expiredBox) expiredBox.classList.remove('is-hidden');
      if (codeBox) codeBox.classList.add('is-expired');
      if (statusBox) statusBox.textContent = 'Código caducado.';
    }
  };

  updateUI();
  countdownInterval = setInterval(() => {
    remainingSeconds--;
    updateUI();
  }, 1000);
}

/**
 * Inicia el sondeo (polling cada 2s) para detectar si el receptor ya canjeó el PIN.
 * @param {string} pin
 */
function startStatusPolling(pin) {
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/sync?pin=${pin}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === 'claimed') {
        // ¡CÓDIGO CANJEADO!
        stopSharingTimers();
        showClaimSuccessAnimation();
      } else if (data.status === 'expired') {
        stopSharingTimers();
      }
    } catch (e) {
      // Ignorar fallos puntuales de red durante el polling
    }
  }, 2000);
}

/**
 * Muestra animación de confirmación y CIERRA AUTOMÁTICAMENTE la ventana tras 1.5s.
 */
function showClaimSuccessAnimation() {
  const contentEl = document.getElementById('sync-share-content');
  const successEl = document.getElementById('sync-share-success');
  if (contentEl) contentEl.classList.add('is-hidden');
  if (successEl) successEl.classList.remove('is-hidden');

  setTimeout(() => {
    closeSyncModal();
  }, 1600);
}


/**
 * Restaura la vista normal de compartir código.
 */
function resetShareView() {
  const contentEl = document.getElementById('sync-share-content');
  const successEl = document.getElementById('sync-share-success');
  const feedbackEl = document.getElementById('copy-sync-feedback');

  if (contentEl) contentEl.classList.remove('is-hidden');
  if (successEl) successEl.classList.add('is-hidden');
  if (feedbackEl) feedbackEl.classList.add('is-hidden');
}

/**
 * Canjea un código PIN de 6 dígitos o un enlace directo pegado en este dispositivo.
 * @param {string} rawInput
 */
async function claimPin(rawInput) {
  const btnSubmit = document.getElementById('btn-submit-claim');
  const errorBox = document.getElementById('claim-error-msg');
  const successBox = document.getElementById('claim-success-msg');

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Verificando…';
  }
  if (errorBox) errorBox.classList.add('is-hidden');
  if (successBox) successBox.classList.add('is-hidden');

  try {
    const trimmed = rawInput.trim();

    // 1. Detección de Enlace Directo pegado o Token Base64 (#sync=...)
    if (trimmed.includes('sync=') || trimmed.length > 20) {
      const decodedData = decodeSyncPayload(trimmed);
      if (!decodedData) {
        throw new Error('El enlace o código de transferencia pegado no es válido o está incompleto.');
      }

      importAllKanbanData(decodedData);

      if (successBox) {
        successBox.classList.remove('is-hidden');
        successBox.textContent = '¡Sincronizado con éxito! Actualizando tu tablero…';
      }

      if (typeof onSyncSuccessCallback === 'function') {
        onSyncSuccessCallback();
      }

      setTimeout(() => {
        closeSyncModal();
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = 'Canjear y sincronizar';
        }
      }, 1400);
      return;
    }

    // 2. Canje mediante código PIN de 6 dígitos
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length !== 6) {
      throw new Error('Por favor, introduce los 6 dígitos del PIN o pega el enlace completo.');
    }

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'claim', pin: digitsOnly })
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Código incorrecto o caducado.');
    }

    // Guardar los datos recibidos en localStorage
    importAllKanbanData(result.data);

    if (successBox) {
      successBox.classList.remove('is-hidden');
      successBox.textContent = '¡Sincronizado! Actualizando tu tablero…';
    }

    if (typeof onSyncSuccessCallback === 'function') {
      onSyncSuccessCallback();
    }

    setTimeout(() => {
      closeSyncModal();
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Canjear y sincronizar';
      }
    }, 1400);

  } catch (err) {
    if (errorBox) {
      errorBox.classList.remove('is-hidden');
      errorBox.textContent = err.message || 'Error al validar el código';
    }
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Canjear y sincronizar';
    }
  }
}
