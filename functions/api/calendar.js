/**
 * @file functions/api/calendar.js
 * @description Alias para /api/calendar que redirige o despacha el feed iCal.
 */

import { onRequest as handleIcsRequest } from './calendar.ics.js';

export async function onRequest(context) {
  return handleIcsRequest(context);
}
