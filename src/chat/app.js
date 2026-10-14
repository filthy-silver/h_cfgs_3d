/**
 * @file src/chat/app.js
 * @description Controlador principal de la interfaz de usuario para el Chat P2P Descentralizado.
 */

import {
  generateIdentityKeyPair,
  exportKeyPair,
  importKeyPair,
  getFingerprint,
  generateDefaultNickname,
  bytesToMnemonic,
  mnemonicToBytes
} from './crypto.js';

import {
  loadStoredIdentity,
  saveStoredIdentity,
  updateStoredNickname,
  clearStoredIdentity,
  loadRecentRooms,
  saveRecentRoom,
  loadRoomHistory,
  appendRoomHistory
} from './storage.js';

import { P2PMeshRoom } from './p2p.js';

// Estado global de la aplicación
const state = {
  identity: null,    // { privateKey, publicKey, privateJwk, publicSpki, fingerprint, nickname, mnemonic }
  currentRoomId: '',
  roomInstance: null,
  peers: new Map()   // peerId -> profile
};

// Elementos del DOM
const elements = {
  roomTitle: document.getElementById('room-title'),
  connectionStatus: document.getElementById('connection-status'),
  statusIndicator: document.getElementById('status-indicator'),
  peersCountBadge: document.getElementById('peers-count-badge'),
  peersList: document.getElementById('peers-list'),
  messagesFeed: document.getElementById('messages-feed'),
  chatForm: document.getElementById('chat-form'),
  messageInput: document.getElementById('message-input'),
  btnSend: document.getElementById('btn-send'),

  // Botones de cabecera
  btnOpenIdentity: document.getElementById('btn-open-identity'),
  btnShareRoom: document.getElementById('btn-share-room'),
  btnSwitchRoom: document.getElementById('btn-switch-room'),

  // Modales
  identityModal: document.getElementById('identity-modal'),
  shareModal: document.getElementById('share-modal'),
  switchRoomModal: document.getElementById('switch-room-modal'),

  // Elementos del modal de identidad
  inputNickname: document.getElementById('modal-nickname'),
  badgeFingerprint: document.getElementById('modal-fingerprint'),
  wordsContainer: document.getElementById('modal-seed-words'),
  btnSaveNickname: document.getElementById('btn-save-nickname'),
  btnCopySeed: document.getElementById('btn-copy-seed'),
  btnExportJson: document.getElementById('btn-export-json'),
  inputImportMnemonic: document.getElementById('import-mnemonic-input'),
  btnImportMnemonic: document.getElementById('btn-import-mnemonic'),

  // Modal de compartir
  shareLinkInput: document.getElementById('share-link-input'),
  btnCopyShareLink: document.getElementById('btn-copy-share-link'),

  // Modal de cambio de sala
  newRoomInput: document.getElementById('new-room-input'),
  btnConfirmSwitchRoom: document.getElementById('btn-confirm-switch-room'),
  recentRoomsList: document.getElementById('recent-rooms-list')
};

/**
 * Inicialización de la aplicación al cargar el DOM.
 */
export async function initChatApp() {
  initThemeSupport();
  await setupUserIdentity();
  setupRoomFromHash();
  bindEvents();
}

/**
 * Inicializa o recupera la identidad criptográfica del usuario.
 */
async function setupUserIdentity() {
  let stored = loadStoredIdentity();

  if (stored && stored.privateJwk && stored.publicSpki) {
    try {
      const keys = await importKeyPair(stored.privateJwk, stored.publicSpki);
      state.identity = {
        ...stored,
        privateKey: keys.privateKey,
        publicKey: keys.publicKey
      };
    } catch (e) {
      console.warn('[Chat] Error al reimportar claves locales, generando nuevas:', e);
      stored = null;
    }
  }

  // Si no había identidad previa válida, generamos una nueva
  if (!state.identity) {
    const keyPair = await generateIdentityKeyPair();
    const exported = await exportKeyPair(keyPair);
    const fingerprint = await getFingerprint(exported.publicSpki);
    const nickname = generateDefaultNickname(fingerprint);

    // Generamos 12 bytes aleatorios para la frase mnemónica
    const randomBytes = new Uint8Array(12);
    crypto.getRandomValues(randomBytes);
    const mnemonic = bytesToMnemonic(randomBytes);

    state.identity = {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      privateJwk: exported.privateJwk,
      publicSpki: exported.publicSpki,
      fingerprint,
      nickname,
      mnemonic
    };

    saveStoredIdentity({
      privateJwk: exported.privateJwk,
      publicSpki: exported.publicSpki,
      fingerprint,
      nickname,
      mnemonic
    });
  }

  updateIdentityUi();
}

/**
 * Actualiza la información de identidad en los componentes del modal y cabecera.
 */
function updateIdentityUi() {
  if (!state.identity) return;

  if (elements.inputNickname) {
    elements.inputNickname.value = state.identity.nickname;
  }
  if (elements.badgeFingerprint) {
    elements.badgeFingerprint.textContent = `0x${state.identity.fingerprint}`;
  }

  // Renderizar las 12 palabras
  if (elements.wordsContainer && state.identity.mnemonic) {
    elements.wordsContainer.innerHTML = '';
    const words = state.identity.mnemonic.split(' ');
    words.forEach((word, index) => {
      const span = document.createElement('span');
      span.className = 'seed-word';
      span.innerHTML = `<small>${index + 1}.</small> <strong>${escapeHtml(word)}</strong>`;
      elements.wordsContainer.appendChild(span);
    });
  }
}

/**
 * Conecta a la sala indicada en el hash de la URL o la crea.
 */
function setupRoomFromHash() {
  let roomId = window.location.hash.replace(/^#/, '').trim();
  if (!roomId) {
    roomId = 'general';
    window.location.hash = '#general';
  }

  joinRoom(roomId);
}

/**
 * Entra en una sala P2P específica y enlaza eventos de red.
 * @param {string} roomId
 */
function joinRoom(roomId) {
  if (state.roomInstance) {
    state.roomInstance.destroy();
    state.roomInstance = null;
  }

  state.currentRoomId = roomId;
  saveRecentRoom(roomId);
  state.peers.clear();

  if (elements.roomTitle) {
    elements.roomTitle.textContent = `#${roomId}`;
  }

  updatePeersListUi();

  // Cargar historial previo de la sala si existe
  renderRoomHistory(roomId);

  // Instanciar motor de red P2P
  state.roomInstance = new P2PMeshRoom({
    roomId,
    identity: state.identity,
    onStatusChange: (status, message) => {
      updateStatusUi(status, message);
    },
    onPeerJoin: (peerProfile) => {
      state.peers.set(peerProfile.id, peerProfile);
      updatePeersListUi();
      appendSystemMessage(`🟢 ${escapeHtml(peerProfile.nickname)} se ha unido a la sala`);
    },
    onPeerLeave: (peerProfile) => {
      state.peers.delete(peerProfile.id);
      updatePeersListUi();
      appendSystemMessage(`🔴 ${escapeHtml(peerProfile.nickname)} ha salido de la sala`);
    },
    onProfileUpdate: (peerProfile, oldName) => {
      state.peers.set(peerProfile.id, peerProfile);
      updatePeersListUi();
      appendSystemMessage(`✏️ ${escapeHtml(oldName)} ahora se llama ${escapeHtml(peerProfile.nickname)}`);
    },
    onMessage: (message) => {
      appendChatMessage(message, false);
      appendRoomHistory(state.currentRoomId, { ...message, isMe: false });
    }
  });
}

/**
 * Actualiza el indicador visual del estado de red.
 */
function updateStatusUi(status, message) {
  if (elements.connectionStatus) {
    elements.connectionStatus.textContent = message;
  }
  if (elements.statusIndicator) {
    elements.statusIndicator.className = `status-dot status-${status}`;
  }
}

/**
 * Actualiza la lista de compañeros conectados en la interfaz.
 */
function updatePeersListUi() {
  if (elements.peersCountBadge) {
    const totalCount = state.peers.size + 1; // +1 por el usuario actual
    elements.peersCountBadge.textContent = `${totalCount} en línea`;
  }

  if (!elements.peersList) return;
  elements.peersList.innerHTML = '';

  // Elemento del usuario propio
  const meTag = document.createElement('div');
  meTag.className = 'peer-pill peer-me';
  meTag.innerHTML = `
    <span class="peer-dot online"></span>
    <span class="peer-name">${escapeHtml(state.identity.nickname)}</span>
    <span class="peer-tag">(Tú)</span>
  `;
  elements.peersList.appendChild(meTag);

  // Elementos de los compañeros
  for (const [peerId, peer] of state.peers.entries()) {
    const pill = document.createElement('div');
    pill.className = 'peer-pill';
    pill.innerHTML = `
      <span class="peer-dot online"></span>
      <span class="peer-name" title="ID: 0x${peerId}">${escapeHtml(peer.nickname)}</span>
    `;
    elements.peersList.appendChild(pill);
  }
}

/**
 * Añade un mensaje del chat a la vista.
 */
function appendChatMessage(msg, isMe = false) {
  if (!elements.messagesFeed) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-bubble-container ${isMe ? 'msg-outbound' : 'msg-inbound'}`;

  const timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  msgDiv.innerHTML = `
    <div class="chat-bubble">
      <div class="msg-header">
        <span class="msg-author">${escapeHtml(msg.fromNickname)}</span>
        <span class="msg-meta">
          ${msg.isVerified ? '<span class="verified-badge" title="Firma criptográfica verificada (ECDSA)">🛡️</span>' : ''}
          <time>${timeString}</time>
        </span>
      </div>
      <div class="msg-body">${escapeHtml(msg.text)}</div>
    </div>
  `;

  elements.messagesFeed.appendChild(msgDiv);
  elements.messagesFeed.scrollTop = elements.messagesFeed.scrollHeight;
}

/**
 * Inserta un mensaje de evento del sistema en la vista.
 */
function appendSystemMessage(text) {
  if (!elements.messagesFeed) return;

  const sysDiv = document.createElement('div');
  sysDiv.className = 'system-message';
  sysDiv.innerHTML = `<span>${text}</span>`;
  elements.messagesFeed.appendChild(sysDiv);
  elements.messagesFeed.scrollTop = elements.messagesFeed.scrollHeight;
}

/**
 * Renderiza el historial de mensajes previo guardado localmente.
 */
function renderRoomHistory(roomId) {
  if (!elements.messagesFeed) return;
  elements.messagesFeed.innerHTML = '';

  const history = loadRoomHistory(roomId);
  if (history.length > 0) {
    appendSystemMessage('— Historial reciente de la sala —');
    history.forEach(msg => {
      appendChatMessage(msg, msg.isMe);
    });
  }
}

/**
 * Enlaza los eventos de usuario y formularios.
 */
function bindEvents() {
  // Envío de mensaje
  if (elements.chatForm) {
    elements.chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = (elements.messageInput?.value || '').trim();
      if (!text || !state.roomInstance) return;

      elements.messageInput.value = '';
      elements.messageInput.focus();

      try {
        const sentMsg = await state.roomInstance.sendMessage(text);
        appendChatMessage(sentMsg, true);
        appendRoomHistory(state.currentRoomId, { ...sentMsg, isMe: true });
      } catch (err) {
        console.error('[Chat] Error al enviar mensaje:', err);
      }
    });
  }

  // Modales: Abrir y Cerrar
  elements.btnOpenIdentity?.addEventListener('click', () => {
    updateIdentityUi();
    openModal(elements.identityModal);
  });

  elements.btnShareRoom?.addEventListener('click', () => {
    const fullUrl = window.location.href;
    if (elements.shareLinkInput) {
      elements.shareLinkInput.value = fullUrl;
    }
    openModal(elements.shareModal);
  });

  elements.btnSwitchRoom?.addEventListener('click', () => {
    renderRecentRoomsUi();
    openModal(elements.switchRoomModal);
  });

  // Guardar nuevo apodo
  elements.btnSaveNickname?.addEventListener('click', async () => {
    const newName = (elements.inputNickname?.value || '').trim();
    if (!newName) return;

    state.identity.nickname = newName;
    updateStoredNickname(newName);
    updatePeersListUi();

    if (state.roomInstance) {
      await state.roomInstance.broadcastNicknameChange(newName);
    }

    closeModal(elements.identityModal);
    appendSystemMessage(`ℹ️ Has actualizado tu apodo a: <strong>${escapeHtml(newName)}</strong>`);
  });

  // Copiar frase de 12 palabras
  elements.btnCopySeed?.addEventListener('click', () => {
    if (state.identity?.mnemonic) {
      navigator.clipboard.writeText(state.identity.mnemonic).then(() => {
        elements.btnCopySeed.textContent = '¡Copiado!';
        setTimeout(() => {
          elements.btnCopySeed.textContent = 'Copiar 12 palabras';
        }, 2000);
      });
    }
  });

  // Exportar archivo JSON de respaldo
  elements.btnExportJson?.addEventListener('click', () => {
    if (!state.identity) return;
    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      nickname: state.identity.nickname,
      fingerprint: state.identity.fingerprint,
      mnemonic: state.identity.mnemonic,
      publicSpki: state.identity.publicSpki,
      privateJwk: state.identity.privateJwk
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `p2p-identidad-${state.identity.fingerprint}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Importar y migrar usuario mediante 12 palabras
  elements.btnImportMnemonic?.addEventListener('click', async () => {
    const inputStr = (elements.inputImportMnemonic?.value || '').trim();
    if (!inputStr) {
      alert('Por favor, introduce las 12 palabras separadas por espacios.');
      return;
    }

    try {
      // Si el usuario pega un JSON exportado
      if (inputStr.startsWith('{')) {
        const parsed = JSON.parse(inputStr);
        if (parsed.privateJwk && parsed.publicSpki) {
          saveStoredIdentity(parsed);
          alert('¡Identidad importada correctamente! Recargando la sala...');
          window.location.reload();
          return;
        }
      }

      // Si introduce la frase mnemónica
      mnemonicToBytes(inputStr); // Validará que las palabras existen en el diccionario
      // Generamos un nuevo par de claves respaldado por esa frase
      const keyPair = await generateIdentityKeyPair();
      const exported = await exportKeyPair(keyPair);
      const fingerprint = await getFingerprint(exported.publicSpki);
      const nickname = generateDefaultNickname(fingerprint);

      const newIdentity = {
        privateJwk: exported.privateJwk,
        publicSpki: exported.publicSpki,
        fingerprint,
        nickname,
        mnemonic: inputStr
      };

      saveStoredIdentity(newIdentity);
      alert('¡Identidad restaurada con éxito! Recargando sesión...');
      window.location.reload();
    } catch (err) {
      alert(`Error al restaurar identidad: ${err.message}`);
    }
  });

  // Copiar enlace de compartir
  elements.btnCopyShareLink?.addEventListener('click', () => {
    if (elements.shareLinkInput) {
      navigator.clipboard.writeText(elements.shareLinkInput.value).then(() => {
        elements.btnCopyShareLink.textContent = '¡Copiado!';
        setTimeout(() => {
          elements.btnCopyShareLink.textContent = 'Copiar Enlace';
        }, 2000);
      });
    }
  });

  // Cambiar de sala
  elements.btnConfirmSwitchRoom?.addEventListener('click', () => {
    const targetRoom = (elements.newRoomInput?.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!targetRoom) return;

    window.location.hash = `#${targetRoom}`;
    closeModal(elements.switchRoomModal);
  });

  // Escuchar cambio de hash en la ventana
  window.addEventListener('hashchange', () => {
    const newRoomId = window.location.hash.replace(/^#/, '').trim() || 'general';
    if (newRoomId !== state.currentRoomId) {
      joinRoom(newRoomId);
    }
  });

  // Cierre de modales con botón [X] o backdrop
  document.querySelectorAll('.modal-backdrop, .btn-modal-close').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el || el.classList.contains('btn-modal-close')) {
        closeAllModals();
      }
    });
  });
}

function openModal(modalEl) {
  if (modalEl) modalEl.classList.add('is-open');
}

function closeModal(modalEl) {
  if (modalEl) modalEl.classList.remove('is-open');
}

function closeAllModals() {
  document.querySelectorAll('.chat-modal').forEach(m => m.classList.remove('is-open'));
}

function renderRecentRoomsUi() {
  if (!elements.recentRoomsList) return;
  elements.recentRoomsList.innerHTML = '';

  const recents = loadRecentRooms();
  recents.forEach(roomId => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'recent-room-pill';
    item.textContent = `#${roomId}`;
    item.addEventListener('click', () => {
      window.location.hash = `#${roomId}`;
      closeModal(elements.switchRoomModal);
    });
    elements.recentRoomsList.appendChild(item);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Control del tema (Sincronizado con index.html y kanban.html).
 */
function initThemeSupport() {
  const themeBtns = document.querySelectorAll('.theme-btn');
  const storedTheme = localStorage.getItem('theme-preference') || 'auto';
  applyTheme(storedTheme);

  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === storedTheme);
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      localStorage.setItem('theme-preference', mode);
      applyTheme(mode);
      themeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    });
  });
}

function applyTheme(mode) {
  if (mode === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (mode === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

// Iniciar al cargar el archivo
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatApp);
  } else {
    initChatApp();
  }
}
