/**
 * @file worker/index.js
 * @description Cloudflare Worker standalone para endpoints de API y despacho de feed iCalendar.
 */

import { generateIcsFeed } from '../functions/api/calendar.ics.js';
import { onRequest as handleAulesRequest } from '../functions/api/aules.js';
import { onRequest as handleEventsRequest } from '../functions/api/events.js';
import { onRequest as handleSyncRequest } from '../functions/api/sync.js';
import { onRequest as handleChatInvitesRequest } from '../functions/api/chat-invites.js';
import { onRequest as handleChatVaultRequest } from '../functions/api/chat-vault.js';
import { onRequest as handleChatSignalRequest } from '../functions/api/chat-signal.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Endpoint del Árbol de Invitaciones y Trazabilidad del Chat P2P
    if (url.pathname === '/api/chat/invites' || url.pathname.startsWith('/api/chat/invites/')) {
      return handleChatInvitesRequest({ request, env, ctx });
    }

    // Endpoint de Bóveda Criptográfica Zero-Knowledge (Respaldo y Restauración)
    if (url.pathname === '/api/chat/vault' || url.pathname.startsWith('/api/chat/vault/')) {
      return handleChatVaultRequest({ request, env, ctx });
    }

    // Endpoint de Señalización WebRTC nativa (WebSockets y Fallback HTTP)
    if (url.pathname === '/api/chat/signal' || url.pathname.startsWith('/api/chat/signal/')) {
      return handleChatSignalRequest({ request, env, ctx });
    }

    // Endpoint de sincronización y emparejamiento (Pairing Handshake)
    if (url.pathname === '/api/sync' || url.pathname.startsWith('/api/sync/')) {
      return handleSyncRequest({ request, env, ctx });
    }

    // Endpoint de gestión y consulta de exámenes
    if (url.pathname === '/api/events' || url.pathname.startsWith('/api/events/')) {
      return handleEventsRequest({ request, env, ctx });
    }

    // Endpoint de entregas de Aules (Moodle)
    if (url.pathname === '/api/aules') {
      return handleAulesRequest({ request, env, ctx });
    }

    // Endpoint de suscripción a calendario
    if (url.pathname === '/api/calendar.ics' || url.pathname === '/api/calendar') {
      const ics = generateIcsFeed();
      return new Response(ics, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'inline; filename="horario_cfgs_3d.ics"',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Health check del Worker
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok', time: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Bloqueo de archivos sensibles y código backend para que no se expongan como assets estáticos
    const SENSITIVE_PATTERNS = [
      /^\/\.dev\.vars/i,
      /^\/\.git/i,
      /^\/wrangler\.toml/i,
      /^\/package\.json/i,
      /^\/_headers/i,
      /^\/worker\//i,
      /^\/functions\//i
    ];
    if (SENSITIVE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
      return new Response('Not Found', { status: 404 });
    }

    // Despacho del Chat P2P (Rutas limpias /chat, /chat/* o subdominio chat.filthysilver.net)
    const isChatHost = url.hostname.startsWith('chat.');
    const isChatRoute = url.pathname === '/chat' || url.pathname.startsWith('/chat/');

    if (env.ASSETS && ((isChatHost && url.pathname === '/') || isChatRoute)) {
      const chatUrl = new URL('/chat.html', request.url);
      const chatRequest = new Request(chatUrl, request);
      const response = await env.ASSETS.fetch(chatRequest);
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'DENY');
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      headers.set('Content-Security-Policy', "default-src 'self'; connect-src 'self' wss: https: stun:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none';");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    // Si se despliega con assets estáticos (con cabeceras de seguridad forzadas)
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'DENY');
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      headers.set('Content-Security-Policy', "default-src 'self'; connect-src 'self' wss: https: stun:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none';");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
