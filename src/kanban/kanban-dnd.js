/**
 * @file kanban-dnd.js
 * @description Implementación nativa de Drag & Drop (HTML5) para el tablero Kanban
 * sin dependencias externas, con soporte para reordenación, recuperación ante cancelación y actualización de columnas.
 */

/**
 * Inicializa los controladores de Drag & Drop nativo de HTML5 en las columnas y tarjetas.
 * @param {Object} options
 * @param {Function} options.onCardMoved Callback cuando una tarjeta cambia de columna o posición: (cardId, newColumnId) => void
 */
export function initKanbanDnD({ onCardMoved }) {
  let draggedCard = null;
  let draggedCardId = null;
  let sourceParent = null;
  let sourceNextSibling = null;
  let dropOccurred = false;

  // 1. Delegación de eventos en las tarjetas
  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;

    draggedCard = card;
    draggedCardId = card.dataset.id;
    sourceParent = card.parentElement;
    sourceNextSibling = card.nextSibling;
    dropOccurred = false;

    e.dataTransfer.setData('text/plain', draggedCardId);
    e.dataTransfer.effectAllowed = 'move';

    // Añadir clase visual con retardo para permitir preview nativo
    requestAnimationFrame(() => {
      card.classList.add('is-dragging');
    });
  });

  document.addEventListener('dragend', () => {
    if (draggedCard) {
      draggedCard.classList.remove('is-dragging');

      // Si no se completó el drop (arrastre cancelado o soltado fuera), restaurar posición original
      if (!dropOccurred && sourceParent && draggedCard.parentElement !== sourceParent) {
        if (sourceNextSibling && sourceParent.contains(sourceNextSibling)) {
          sourceParent.insertBefore(draggedCard, sourceNextSibling);
        } else {
          sourceParent.appendChild(draggedCard);
        }
      }
    }

    // Limpiar resaltados de todas las columnas
    document.querySelectorAll('.kanban-column').forEach(col => {
      col.classList.remove('drag-over');
    });

    draggedCard = null;
    draggedCardId = null;
    sourceParent = null;
    sourceNextSibling = null;
    dropOccurred = false;
  });

  // 2. Controladores en las columnas de destino
  const columns = document.querySelectorAll('.kanban-column');

  columns.forEach(column => {
    const cardList = column.querySelector('.column-cards-list');
    const targetColumnId = column.dataset.column;

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (!column.classList.contains('drag-over')) {
        column.classList.add('drag-over');
      }

      // Determinar posición relativa entre tarjetas
      const draggingElement = document.querySelector('.is-dragging');
      if (draggingElement && cardList) {
        const afterElement = getDragAfterElement(cardList, e.clientY);
        if (afterElement == null) {
          cardList.appendChild(draggingElement);
        } else {
          cardList.insertBefore(draggingElement, afterElement);
        }
      }
    });

    column.addEventListener('dragleave', (e) => {
      const rect = column.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX >= rect.right ||
        e.clientY < rect.top ||
        e.clientY >= rect.bottom
      ) {
        column.classList.remove('drag-over');
      }
    });

    column.addEventListener('drop', (e) => {
      e.preventDefault();
      dropOccurred = true;
      column.classList.remove('drag-over');

      const cardId = e.dataTransfer.getData('text/plain') || draggedCardId;
      if (!cardId) return;

      const card = document.getElementById(`card-${cardId}`);
      if (card) {
        card.dataset.column = targetColumnId;
        // Sincronizar el selector de accesibilidad de la tarjeta
        const select = card.querySelector('.card-move-select');
        if (select) {
          select.value = targetColumnId;
        }
      }

      if (typeof onCardMoved === 'function') {
        onCardMoved(cardId, targetColumnId);
      }
    });
  });
}

/**
 * Calcula qué tarjeta debe ir inmediatamente después de la posición actual del cursor.
 * @param {HTMLElement} container
 * @param {number} y
 * @returns {HTMLElement|null}
 */
function getDragAfterElement(container, y) {
  if (!container) return null;
  const draggableElements = [...container.querySelectorAll('.kanban-card:not(.is-dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}
