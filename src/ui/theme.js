/**
 * @file theme.js
 * @description Gestión del tema visual (claro, oscuro, automático según sistema).
 */

const THEME_KEY = "user-theme-pref";
const VALID_MODES = ["auto", "dark", "light"];

const storage = {
  get() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      localStorage.setItem(THEME_KEY, value);
    } catch {
      // Ignorar fallos de cuota o cookies deshabilitadas
    }
  }
};

/**
 * Aplica el tema seleccionado en el documento y actualiza los botones de la UI.
 * @param {'auto'|'dark'|'light'} mode
 * @param {boolean} [save=true]
 */
export function applyTheme(mode, save = true) {
  const root = document.documentElement;
  const themeBtns = document.querySelectorAll(".theme-btn");

  if (mode === "auto") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", mode);
  }

  themeBtns.forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });

  if (save) {
    storage.set(mode);
  }
}

/**
 * Inicializa el tema recuperando la preferencia guardada y enlazando eventos.
 */
export function initTheme() {
  const savedMode = storage.get();
  const initialMode = VALID_MODES.includes(savedMode) ? savedMode : "auto";
  applyTheme(initialMode, false);

  const themeBtns = document.querySelectorAll(".theme-btn");
  themeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (VALID_MODES.includes(mode)) {
        applyTheme(mode, true);
      }
    });
  });
}
