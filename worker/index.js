/**
 * @file worker/index.js
 * @description Cloudflare Worker standalone para endpoints de API y despacho de feed iCalendar.
 */

import { generateIcsFeed } from '../functions/api/calendar.ics.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
