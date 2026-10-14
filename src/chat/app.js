/**
 * @file src/chat/app.js
 * @description Controlador principal de la interfaz de usuario para el Chat P2P Descentralizado.
 * Incluye soporte para rutas limpias (/chat/:room), directorio de salas oficiales,
 * herramientas de moderación criptográfica (Kicks y Borrados de mensajes) y tokens de invitación.
 */

import {
  generateIdentityKeyPair,
  exportKeyPair,
  importKeyPair,
  getFingerprint,
  generateDefaultNickname,
  bytesToMnemonic,
  mnemonicToBytes,
  generateInviteToken,
  verifyInviteToken
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

// Salas oficiales fijadas de la comunidad
export const OFFICIAL_ROOMS = [
  { id: 'general', name: 'General', desc: 'Charla libre de la clase' },
  { id: 'dudas-3d', name: 'Dudas 3D', desc: 'Blender, Maya, texturas y modelado' },
  { id: 'entregas-aules', name: 'Entregas Aules', desc: 'Fechas límite y tareas pendientes' },
  { id: 'ocio-gaming', name: 'Ocio & Gaming', desc: 'Juegos y charlas fuera de clase' }
];

// Estado global de la aplicación
const state = {
  identity: null,    // { privateKey, publicKey, privateJwk, publicSpki, fingerprint, nickname, mnemonic }
  currentRoomId: '',
  roomInstance: null,
  peers: new Map(),  // peerId -> profile
  isAdmin: localStorage.getItem('p2p_chat_is_admin') === 'true',
  isKicked: false
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

  // Moderación en el modal de identidad
  btnToggleAdminMode: document.getElementById('btn-toggle-admin-mode'),
  adminStatusBadge: document.getElementById('admin-status-badge'),

  // Modal de compartir e invitaciones
  shareLinkInput: document.getElementById('share-link-input'),
  btnCopyShareLink: document.getElementById('btn-copy-share-link'),
  btnGenerateInviteToken: document.getElementById('btn-generate-invite-token'),
  inviteTokenContainer: document.getElementById('invite-token-container'),
  inviteTokenOutput: document.getElementById('invite-token-output'),
  btnCopyInviteToken: document.getElementById('btn-copy-invite-token'),

  // Modal de cambio de sala
  newRoomInput: document.getElementById('new-room-input'),
  btnConfirmSwitchRoom: document.getElementById('btn-confirm-switch-room'),
  recentRoomsList: document.getElementById('recent-rooms-list'),
  officialRoomsList: document.getElementById('official-rooms-list')
};

/**
 * Inicialización de la aplicación al cargar el DOM.
 */
export async function initChatApp() {
  initThemeSupport();
  await setupUserIdentity();
  await checkInviteUrlParam();
  setupRoomFromUrl();
  bindEvents();
}

/**
 * Detecta si el usuario entra a través de un enlace de invitación exclusiva (?invite=... o #invite=...)
 */
async function checkInviteUrlParam() {
  const hash = window.location.hash;
  const urlParams = new URLSearchParams(window.location.search);
  let inviteToken = urlParams.get('invite');

  if (!inviteToken && hash.includes('invite=')) {
    const match = hash.match(/invite=([^&]+)/);
    if (match) inviteToken = match[1];
  }

  if (inviteToken) {
    const result = await verifyInviteToken(inviteToken);
    if (result.valid) {
      localStorage.setItem('p2p_community_access_granted', 'true');
      appendSystemMessage(`🎉 ¡Bienvenido! Tu token de invitación oficial ha sido verificado.`);
    } else {
      console.warn('[Invite] Token inválido:', result.reason);
      appendSystemMessage(`⚠️ El enlace de invitación presentado no es válido: ${result.reason}`);
    }
  }
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

  // Indicador de modo moderador
  if (elements.adminStatusBadge) {
    elements.adminStatusBadge.textContent = state.isAdmin ? '🛡️ Moderador Activo' : '👤 Miembro Regular';
    elements.adminStatusBadge.style.color = state.isAdmin ? 'var(--warning)' : 'var(--muted)';
  }
  if (elements.btnToggleAdminMode) {
    elements.btnToggleAdminMode.textContent = state.isAdmin ? 'Desactivar Modo Admin' : 'Activar Modo Admin';
  }
}

/**
 * Obtiene el ID de la sala desde la ruta limpia (/chat/:room) o el hash (#:room).
 * @returns {string}
 */
export function getRoomIdFromLocation() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  // Si la ruta es /chat/sala o /chat.html
  if (pathParts.length >= 2 && pathParts[0] === 'chat') {
    return pathParts[1].toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  }

  const hash = window.location.hash.replace(/^#/, '').split('?')[0].split('&')[0].trim().toLowerCase();
  if (hash && !hash.startsWith('invite=')) {
    return hash.replace(/[^a-z0-9_-]/g, '-');
  }

  return 'general';
}

/**
 * Conecta a la sala indicada en la URL.
 */
function setupRoomFromUrl() {
  const roomId = getRoomIdFromLocation();
  joinRoom(roomId);
}

/**
 * Entra en una sala P2P específica y enlaza eventos de red y moderación.
 * @param {string} roomId
 */
function joinRoom(roomId) {
  if (state.isKicked) return;

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
  renderRoomHistory(roomId);

  // Instanciar motor de red P2P con soporte para moderación
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
    },
    onMessageDeleted: (messageId) => {
      handleUiMessageDeleted(messageId);
    },
    onKicked: (reason) => {
      state.isKicked = true;
      showKickedUi(reason);
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
      ${state.isAdmin ? `<button type="button" class="btn-kick-peer" data-peer-id="${peerId}" title="Expulsar a este usuario">⛔</button>` : ''}
    `;

    if (state.isAdmin) {
      const kickBtn = pill.querySelector('.btn-kick-peer');
      kickBtn?.addEventListener('click', () => {
        executeAdminKick(peerId, peer.nickname);
      });
    }

    elements.peersList.appendChild(pill);
  }
}

/**
 * Añade un mensaje del chat a la vista con soporte de moderación.
 */
function appendChatMessage(msg, isMe = false) {
  if (!elements.messagesFeed) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-bubble-container ${isMe ? 'msg-outbound' : 'msg-inbound'}`;
  msgDiv.dataset.msgId = msg.id;

  const timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  msgDiv.innerHTML = `
    <div class="chat-bubble">
      <div class="msg-header">
        <span class="msg-author">${escapeHtml(msg.fromNickname)}</span>
        <span class="msg-meta">
          ${msg.isVerified ? '<span class="verified-badge" title="Firma criptográfica verificada (ECDSA)">🛡️</span>' : ''}
          <time>${timeString}</time>
          ${state.isAdmin ? `<button type="button" class="btn-mod-delete" data-msg-id="${msg.id}" title="Eliminar mensaje como moderador">🗑️</button>` : ''}
        </span>
      </div>
      <div class="msg-body">${escapeHtml(msg.text)}</div>
    </div>
  `;

  if (state.isAdmin) {
    const delBtn = msgDiv.querySelector('.btn-mod-delete');
    delBtn?.addEventListener('click', () => {
      executeAdminDeleteMessage(msg.id);
    });
  }

  elements.messagesFeed.appendChild(msgDiv);
  elements.messagesFeed.scrollTop = elements.messagesFeed.scrollHeight;
}

/**
 * Maneja visualmente la eliminación de un mensaje por moderador.
 */
function handleUiMessageDeleted(messageId) {
  const msgEl = elements.messagesFeed?.querySelector(`[data-msg-id="${messageId}"]`);
  if (msgEl) {
    const bodyEl = msgEl.querySelector('.msg-body');
    if (bodyEl) {
      bodyEl.innerHTML = '<em style="color: var(--muted); font-size: 0.85rem;">🚫 Este mensaje ha sido eliminado por un moderador.</em>';
    }
  }
}

/**
 * Ejecuta la expulsión administrativa de un usuario.
 */
async function executeAdminKick(peerId, nickname) {
  if (!state.isAdmin || !state.roomInstance) return;
  const reason = prompt(`Motivo de expulsión para "${nickname}":`, 'Comportamiento no adecuado');
  if (reason === null) return;

  try {
    await state.roomInstance.broadcastAdminKick(
      peerId,
      reason,
      state.identity.privateKey,
      state.identity.publicSpki
    );
    appendSystemMessage(`⚡ Has expulsado a ${escapeHtml(nickname)} de la sala.`);
  } catch (err) {
    alert(`Error al expulsar: ${err.message}`);
  }
}

/**
 * Ejecuta el borrado administrativo de un mensaje.
 */
async function executeAdminDeleteMessage(messageId) {
  if (!state.isAdmin || !state.roomInstance) return;
  if (!confirm('¿Eliminar este mensaje de la vista de todos los participantes?')) return;

  try {
    await state.roomInstance.broadcastAdminDelete(
      messageId,
      state.identity.privateKey,
      state.identity.publicSpki
    );
  } catch (err) {
    alert(`Error al eliminar mensaje: ${err.message}`);
  }
}

/**
 * Muestra el bloqueo cuando un usuario es expulsado.
 */
function showKickedUi(reason) {
  if (elements.messagesFeed) {
    elements.messagesFeed.innerHTML = `
      <div style="text-align: center; margin: 3rem auto; max-width: 450px; padding: 2rem; background: var(--surface); border: 1px solid var(--danger); border-radius: 12px;">
        <h2 style="color: var(--danger); margin-bottom: 0.75rem;">⛔ Acceso denegado</h2>
        <p style="font-size: 0.95rem; margin-bottom: 1rem;">Has sido expulsado de esta sala por un moderador.</p>
        <p style="font-size: 0.85rem; color: var(--muted);"><strong>Motivo:</strong> ${escapeHtml(reason)}</p>
      </div>
    `;
  }
  if (elements.messageInput) elements.messageInput.disabled = true;
  if (elements.btnSend) elements.btnSend.disabled = true;
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
      if (state.isKicked) return;

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
    renderOfficialRoomsUi();
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

  // Alternar modo administrador
  elements.btnToggleAdminMode?.addEventListener('click', () => {
    if (state.isAdmin) {
      state.isAdmin = false;
      localStorage.setItem('p2p_chat_is_admin', 'false');
      alert('Modo administrador desactivado.');
    } else {
      const pass = prompt('Introduce la contraseña o código de moderación de filthysilver.net:');
      if (pass === 'filthysilver3d' || pass === 'admin') {
        state.isAdmin = true;
        localStorage.setItem('p2p_chat_is_admin', 'true');
        alert('🛡️ Modo moderador activado.');
      } else if (pass !== null) {
        alert('Código incorrecto.');
      }
    }
    updateIdentityUi();
    updatePeersListUi();
  });

  // Generar token de invitación (Invite-Only)
  elements.btnGenerateInviteToken?.addEventListener('click', async () => {
    if (!state.identity) return;
    const guestLabel = prompt('Identificador o nombre para el invitado:', 'compañero_3d');
    if (!guestLabel) return;

    try {
      const token = await generateInviteToken(
        state.identity.privateKey,
        state.identity.publicSpki,
        state.identity.fingerprint,
        guestLabel
      );

      const inviteLink = `${window.location.origin}/chat/${state.currentRoomId}#invite=${token}`;
      if (elements.inviteTokenOutput) {
        elements.inviteTokenOutput.value = inviteLink;
      }
      if (elements.inviteTokenContainer) {
        elements.inviteTokenContainer.style.display = 'block';
      }
    } catch (e) {
      alert(`Error generando invitación: ${e.message}`);
    }
  });

  elements.btnCopyInviteToken?.addEventListener('click', () => {
    if (elements.inviteTokenOutput) {
      navigator.clipboard.writeText(elements.inviteTokenOutput.value).then(() => {
        elements.btnCopyInviteToken.textContent = '¡Copiado!';
        setTimeout(() => {
          elements.btnCopyInviteToken.textContent = 'Copiar Enlace Exclusivo';
        }, 2000);
      });
    }
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
      alert('Por favor, introduce las 12 palabras separadas por espacios o el JSON.');
      return;
    }

    try {
      if (inputStr.startsWith('{')) {
        const parsed = JSON.parse(inputStr);
        if (parsed.privateJwk && parsed.publicSpki) {
          saveStoredIdentity(parsed);
          alert('¡Identidad importada correctamente! Recargando...');
          window.location.reload();
          return;
        }
      }

      mnemonicToBytes(inputStr);
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
      alert('¡Identidad restaurada con éxito!');
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

  // Cambiar de sala personalizada
  elements.btnConfirmSwitchRoom?.addEventListener('click', () => {
    const targetRoom = (elements.newRoomInput?.value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!targetRoom) return;

    navigateToRoom(targetRoom);
    closeModal(elements.switchRoomModal);
  });

  // Escuchar cambio de hash en la ventana
  window.addEventListener('hashchange', () => {
    const newRoomId = getRoomIdFromLocation();
    if (newRoomId !== state.currentRoomId) {
      joinRoom(newRoomId);
    }
  });

  // Cierre de modales
  document.querySelectorAll('.modal-backdrop, .btn-modal-close').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el || el.classList.contains('btn-modal-close')) {
        closeAllModals();
      }
    });
  });
}

function navigateToRoom(roomId) {
  if (window.history.pushState) {
    const newPath = `/chat/${roomId}`;
    window.history.pushState(null, '', newPath);
  }
  window.location.hash = `#${roomId}`;
  joinRoom(roomId);
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

function renderOfficialRoomsUi() {
  if (!elements.officialRoomsList) return;
  elements.officialRoomsList.innerHTML = '';

  OFFICIAL_ROOMS.forEach(room => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'official-room-card';
    btn.innerHTML = `
      <div class="room-card-title">#${escapeHtml(room.id)}</div>
      <div class="room-card-desc">${escapeHtml(room.desc)}</div>
    `;
    btn.addEventListener('click', () => {
      navigateToRoom(room.id);
      closeModal(elements.switchRoomModal);
    });
    elements.officialRoomsList.appendChild(btn);
  });
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
      navigateToRoom(roomId);
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
