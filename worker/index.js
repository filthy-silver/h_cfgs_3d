/**
 * @file worker/index.js
 * @description Cloudflare Worker standalone para endpoints de API, despacho de feed iCalendar y gestión de eventos con PIN.
 */

import { generateIcsFeed } from '../functions/api/calendar.ics.js';
import { onRequest as handleAulesRequest } from '../functions/api/aules.js';
import {
  onRequestGet as handleEventsGet,
  onRequestPost as handleEventsPost,
  onRequestDelete as handleEventsDelete,
  onRequestOptions as handleEventsOptions
} from '../functions/api/events.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Endpoint de gestión de tareas y exámenes con PIN
    if (url.pathname === '/api/events') {
      if (request.method === 'OPTIONS') return handleEventsOptions({ request, env, ctx });
      if (request.method === 'GET') return handleEventsGet({ request, env, ctx });
      if (request.method === 'POST') return handleEventsPost({ request, env, ctx });
      if (request.method === 'DELETE') return handleEventsDelete({ request, env, ctx });
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

    // Si se despliega con assets estáticos
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
