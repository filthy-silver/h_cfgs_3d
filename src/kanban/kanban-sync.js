/**
 * @file kanban-sync.js
 * @description Gestión de la vinculación y sincronización en la nube (Pairing Handshake)
 * entre dispositivos (PC Torre ↔ Móvil) con PIN temporal de 5 minutos y cierre automático.
 */

import { exportAllKanbanData, importAllKanbanData } from './kanban-store.js';

let activePin = null;
let countdownInterval = null;
let pollInterval = null;
let remainingSeconds = 300;
let onSyncSuccessCallback = null;

/**
 * Inicializa el gestor de sincronización de Kanban.
 * @param {Object} options
 * @param {Function} options.onDataRestored Callback al recibir datos para repintar el tablero
 */
export function initKanbanSync({ onDataRestored } = {}) {
  onSyncSuccessCallback = onDataRestored;

  const btnOpen = document.getElementById('btn-open-sync');
  const modal = document.getElementById('sync-modal');
  const btnClose = modal?.querySelectorAll('[data-close-sync-modal]');
  const tabShare = document.getElementById('tab-sync-share');
  const tabClaim = document.getElementById('tab-sync-claim');
  const viewShare = document.getElementById('view-sync-share');
  const viewClaim = document.getElementById('view-sync-claim');
  const formClaim = document.getElementById('form-sync-claim');
  const inputPin = document.getElementById('input-claim-pin');
  const btnRegen = document.getElementById('btn-regen-pin');

  btnOpen?.addEventListener('click', () => {
    openSyncModal();
  });

  btnClose?.forEach(b => {
    b.addEventListener('click', () => {
      closeSyncModal();
    });
  });

  // Cerrar al pulsar Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('is-open')) {
      closeSyncModal();
    }
  });

  // Cerrar al pulsar el backdrop
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeSyncModal();
    }
  });

  // Pestañas (Compartir vs Canjear)
  tabShare?.addEventListener('click', () => {
    tabShare.classList.add('active');
    tabClaim?.classList.remove('active');
    viewShare?.classList.remove('is-hidden');
    viewClaim?.classList.add('is-hidden');
    if (!activePin) {
      requestNewPin();
    }
  });

  tabClaim?.addEventListener('click', () => {
    tabClaim.classList.add('active');
    tabShare?.classList.remove('active');
    viewClaim?.classList.remove('is-hidden');
    viewShare?.classList.add('is-hidden');
    stopSharingTimers();
    inputPin?.focus();
  });

  // Regenerar PIN si caducó
  btnRegen?.addEventListener('click', () => {
    requestNewPin();
  });

  // Formato y validación del input del PIN (sólo dígitos)
  inputPin?.addEventListener('input', (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = raw.length > 3 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw;
  });

  // Envío del formulario de canje
  formClaim?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawPin = (inputPin?.value || '').replace(/\D/g, '');
    if (rawPin.length !== 6) return;

    await claimPin(rawPin);
  });
}

/**
 * Abre el diálogo de sincronización y genera PIN si está en la pestaña compartir.
 */
function openSyncModal() {
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
function closeSyncModal() {
  const modal = document.getElementById('sync-modal');
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  stopSharingTimers();
  resetShareView();
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
 * Solicita al servidor un nuevo código PIN temporal (5 min).
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
  if (statusBox) statusBox.textContent = 'Generando código seguro…';
  if (expiredBox) expiredBox.classList.add('is-hidden');
  if (codeBox) codeBox.classList.remove('is-expired');

  try {
    const payload = exportAllKanbanData();
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', data: payload })
    });

    if (!res.ok) throw new Error('Error al generar código');
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
          Esperando a que introduzcas el código en el otro dispositivo…
        `;
      }

      startCountdown(remainingSeconds);
      startStatusPolling(activePin);
    }
  } catch (err) {
    console.warn('[KanbanSync] Fallo al crear PIN:', err);
    if (statusBox) statusBox.textContent = 'No se pudo conectar con el servidor de sincronización.';
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
  if (contentEl) contentEl.classList.remove('is-hidden');
  if (successEl) successEl.classList.add('is-hidden');
}

/**
 * Canjea un código PIN introducido en este dispositivo.
 * @param {string} rawPin
 */
async function claimPin(rawPin) {
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
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'claim', pin: rawPin })
    });

    const result = await res.json();

    if (!res.ok || !result.success) {
      throw new Error(result.error || 'Código incorrecto o caducado');
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
