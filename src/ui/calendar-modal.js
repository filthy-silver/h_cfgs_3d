/**
 * @file calendar-modal.js
 * @description Diálogo accesible para suscribirse y descargar el feed de calendario iCal (.ics).
 */

import QRCode from '../utils/qrcode.min.js';

export function initCalendarModal() {
  const openBtn = document.getElementById("btn-open-calendar");
  const modal = document.getElementById("calendar-modal");
  const closeBtn = document.getElementById("btn-close-calendar");
  const copyBtn = document.getElementById("btn-copy-feed");
  const feedInput = document.getElementById("feed-url-input");
  const googleBtn = document.getElementById("btn-add-google");
  const appleBtn = document.getElementById("btn-add-apple");
  const downloadBtn = document.getElementById("btn-download-ics");
  const qrContainer = document.getElementById("calendar-qr-code-container");

  if (!openBtn || !modal) return;

  const currentOrigin = window.location.origin;
  const fullIcsUrl = `${currentOrigin}/api/calendar.ics`;
  const webcalUrl = fullIcsUrl.replace(/^https?:\/\//i, 'webcal://');

  if (feedInput) {
    feedInput.value = fullIcsUrl;
  }

  if (downloadBtn) {
    downloadBtn.href = fullIcsUrl;
  }

  if (googleBtn) {
    googleBtn.href = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(fullIcsUrl)}`;
    googleBtn.target = "_blank";
    googleBtn.rel = "noopener noreferrer";
  }

  if (appleBtn) {
    appleBtn.href = webcalUrl;
  }

  // Renderizar código QR del calendario (.ics / webcal://) para escaneo directo con móvil
  if (qrContainer) {
    try {
      const qrFn = typeof QRCode === 'function' ? QRCode : (QRCode?.QRCode || QRCode?.default);
      if (typeof qrFn === 'function') {
        const svgEl = qrFn({
          msg: webcalUrl,
          dim: 160,
          pad: 2,
          pal: ['#0f172a', '#ffffff']
        });
        if (svgEl) {
          const paths = svgEl.querySelectorAll('path');
          if (paths.length >= 2) {
            paths[0].setAttribute('fill', '#ffffff');
            paths[1].setAttribute('fill', '#0f172a');
          } else if (paths.length === 1) {
            paths[0].setAttribute('fill', '#0f172a');
          }
          qrContainer.innerHTML = '';
          qrContainer.appendChild(svgEl);
        }
      }
    } catch (err) {
      console.warn('[CalendarModal] Error al generar QR del calendario:', err);
    }
  }

  function openModal() {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    closeBtn?.focus();
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    openBtn?.focus();
  }

  openBtn.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });

  if (copyBtn && feedInput) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(fullIcsUrl);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "¡Copiado!";
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 2000);
      } catch {
        feedInput.select();
      }
    });
  }
}
