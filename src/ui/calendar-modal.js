/**
 * @file calendar-modal.js
 * @description Diálogo accesible para suscribirse y descargar el feed de calendario iCal (.ics).
 */

export function initCalendarModal() {
  const openBtn = document.getElementById("btn-open-calendar");
  const modal = document.getElementById("calendar-modal");
  const closeBtn = document.getElementById("btn-close-calendar");
  const copyBtn = document.getElementById("btn-copy-feed");
  const feedInput = document.getElementById("feed-url-input");
  const googleBtn = document.getElementById("btn-add-google");
  const appleBtn = document.getElementById("btn-add-apple");
  const downloadBtn = document.getElementById("btn-download-ics");

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
